package secrets

import (
	"regexp"
	"strings"

	"github.com/google/uuid"
)

const maxExpansionDepth = 10

var interpolationRegex = regexp.MustCompile(`\${([a-zA-Z0-9-_.]+)}`)

// SecretExpander handles secret reference expansion.
type SecretExpander struct {
	inputSecrets   []SecretInput
	opts           ExpandOpts
	localLookup    map[string]*SecretInput
	absoluteLookup map[string]map[string]*SecretInput
	currentValues  []string
	fullyExpanded  []bool
	deniedRefs     map[string]struct{} // "env:path:key" -> denied by permission check
	requestedRefs  map[string]struct{} // "env:path:key" -> already requested (avoid infinite loop)
	idToIndex      map[uuid.UUID]int   // secret ID -> index in inputSecrets
}

// NewSecretExpander creates an expander from priority-ordered secrets.
// First occurrence of each key wins for relative reference resolution.
func NewSecretExpander(secrets []SecretInput, opts ExpandOpts) *SecretExpander {
	expander := &SecretExpander{
		inputSecrets:   secrets,
		opts:           opts,
		localLookup:    make(map[string]*SecretInput),
		absoluteLookup: make(map[string]map[string]*SecretInput),
		currentValues:  make([]string, len(secrets)),
		fullyExpanded:  make([]bool, len(secrets)),
		deniedRefs:     make(map[string]struct{}),
		requestedRefs:  make(map[string]struct{}),
		idToIndex:      make(map[uuid.UUID]int),
	}

	for i := range secrets {
		if _, exists := expander.localLookup[secrets[i].Key]; !exists {
			expander.localLookup[secrets[i].Key] = &secrets[i]
		}
		expander.currentValues[i] = secrets[i].Value
		expander.idToIndex[secrets[i].ID] = i
	}

	return expander
}

// Expand performs the full expansion.
// It iteratively expands references, fetching absolute refs as needed.
// After calling Expand, use Secrets() or LookUp() to retrieve results.
func (e *SecretExpander) Expand() {
	for {
		needed := e.expandPass()
		if len(needed) == 0 {
			break
		}

		var allowed []AbsoluteSecretRef
		for _, ref := range needed {
			key := ref.Env + ":" + ref.Path + ":" + ref.Key

			// Skip if already requested (prevents infinite loop for not-found refs)
			if _, requested := e.requestedRefs[key]; requested {
				continue
			}

			if e.opts.CanAccessAbsolute == nil || e.opts.CanAccessAbsolute(ref) {
				allowed = append(allowed, ref)
				e.requestedRefs[key] = struct{}{}
			} else {
				e.deniedRefs[key] = struct{}{}
				e.requestedRefs[key] = struct{}{}
			}
		}

		if len(allowed) > 0 && e.opts.FetchAbsoluteSecrets != nil {
			absolutes := e.opts.FetchAbsoluteSecrets(allowed)
			e.addAbsoluteSecrets(absolutes)
		} else {
			break
		}
	}

	e.replaceDeniedRefs()
	e.replaceNotFoundRefs()
}

// Secrets returns all expanded secrets in the same order as input.
func (e *SecretExpander) Secrets() []ExpandedSecret {
	return e.results()
}

// LookUp returns the expanded value for a specific secret ID.
// Returns empty string and false if the ID is not found.
func (e *SecretExpander) LookUp(id uuid.UUID) (string, bool) {
	idx, ok := e.idToIndex[id]
	if !ok {
		return "", false
	}
	return e.currentValues[idx], true
}

// expandPass expands all references in current values.
// Returns list of absolute refs that are needed but not yet available.
func (e *SecretExpander) expandPass() []AbsoluteSecretRef {
	neededRefs := make(map[string]AbsoluteSecretRef)

	for i := range e.inputSecrets {
		if e.fullyExpanded[i] {
			continue
		}

		expanded, needed := e.expandValue(e.currentValues[i], make(map[string]struct{}), 0)
		e.currentValues[i] = expanded

		if len(needed) == 0 && !hasReferences(expanded) {
			e.fullyExpanded[i] = true
		}

		for _, ref := range needed {
			key := ref.Env + ":" + ref.Path + ":" + ref.Key
			neededRefs[key] = ref
		}
	}

	result := make([]AbsoluteSecretRef, 0, len(neededRefs))
	for _, ref := range neededRefs {
		result = append(result, ref)
	}
	return result
}

// expandValue recursively expands references in a value.
// Returns the expanded string and any absolute refs that couldn't be resolved.
func (e *SecretExpander) expandValue(value string, visited map[string]struct{}, depth int) (string, []AbsoluteSecretRef) {
	if depth > maxExpansionDepth {
		return value, nil
	}

	matches := interpolationRegex.FindAllStringSubmatch(value, -1)
	if len(matches) == 0 {
		return value, nil
	}

	var neededRefs []AbsoluteSecretRef

	for _, match := range matches {
		syntax := match[0]
		refKey := match[1]
		parts := strings.Split(refKey, ".")

		var resolvedSecret *SecretInput
		var secretID string

		if len(parts) == 1 {
			resolvedSecret = e.localLookup[parts[0]]
			if resolvedSecret != nil {
				secretID = resolvedSecret.Env + ":" + resolvedSecret.Path + ":" + resolvedSecret.Key
			}
		} else {
			env := parts[0]
			secretKey := parts[len(parts)-1]
			pathParts := parts[1 : len(parts)-1]
			path := "/"
			if len(pathParts) > 0 {
				path = "/" + strings.Join(pathParts, "/")
			}

			secretID = env + ":" + path + ":" + secretKey
			locationKey := env + ":" + path

			if secrets, ok := e.absoluteLookup[locationKey]; ok {
				if s, ok := secrets[secretKey]; ok {
					resolvedSecret = s
				}
			}

			if resolvedSecret == nil {
				neededRefs = append(neededRefs, AbsoluteSecretRef{
					Env:  env,
					Path: path,
					Key:  secretKey,
				})
				continue
			}
		}

		resolvedValue := ""
		if resolvedSecret != nil {
			if _, cyclic := visited[secretID]; !cyclic {
				newVisited := copyVisited(visited)
				newVisited[secretID] = struct{}{}

				expandedValue, moreNeeded := e.expandValue(resolvedSecret.Value, newVisited, depth+1)
				resolvedValue = expandedValue
				neededRefs = append(neededRefs, moreNeeded...)
			} else {
				// Circular reference detected - use empty to break the cycle
				resolvedValue = ""
			}
		}

		value = strings.ReplaceAll(value, syntax, resolvedValue)
	}

	return value, neededRefs
}

// addAbsoluteSecrets adds fetched absolute secrets to the lookup.
func (e *SecretExpander) addAbsoluteSecrets(secrets []SecretInput) {
	for i := range secrets {
		s := &secrets[i]
		locationKey := s.Env + ":" + s.Path

		if e.absoluteLookup[locationKey] == nil {
			e.absoluteLookup[locationKey] = make(map[string]*SecretInput)
		}

		if _, exists := e.absoluteLookup[locationKey][s.Key]; !exists {
			e.absoluteLookup[locationKey][s.Key] = s
		}
	}

	for i := range e.fullyExpanded {
		if hasReferences(e.currentValues[i]) {
			e.fullyExpanded[i] = false
		}
	}
}

// replaceDeniedRefs replaces permission-denied absolute refs with empty string.
func (e *SecretExpander) replaceDeniedRefs() {
	e.replaceAbsoluteRefsWith(e.deniedRefs, "")
}

// replaceNotFoundRefs replaces absolute refs that were requested but not found with empty string.
func (e *SecretExpander) replaceNotFoundRefs() {
	// Build set of refs that were requested but not found in absoluteLookup
	notFound := make(map[string]struct{})
	for key := range e.requestedRefs {
		if _, denied := e.deniedRefs[key]; denied {
			continue // Already handled by replaceDeniedRefs
		}
		// Parse key back to check if it's in absoluteLookup
		// key format: "env:path:secretKey"
		parts := strings.SplitN(key, ":", 3)
		if len(parts) != 3 {
			continue
		}
		env, path, secretKey := parts[0], parts[1], parts[2]
		locationKey := env + ":" + path
		if secrets, ok := e.absoluteLookup[locationKey]; ok {
			if _, found := secrets[secretKey]; found {
				continue // Found, not missing
			}
		}
		notFound[key] = struct{}{}
	}
	e.replaceAbsoluteRefsWith(notFound, "")
}

// replaceAbsoluteRefsWith replaces absolute refs matching the given set with the replacement string.
func (e *SecretExpander) replaceAbsoluteRefsWith(refs map[string]struct{}, replacement string) {
	for i := range e.currentValues {
		matches := interpolationRegex.FindAllStringSubmatch(e.currentValues[i], -1)
		for _, match := range matches {
			syntax := match[0]
			refKey := match[1]
			parts := strings.Split(refKey, ".")

			if len(parts) > 1 {
				env := parts[0]
				secretKey := parts[len(parts)-1]
				pathParts := parts[1 : len(parts)-1]
				path := "/"
				if len(pathParts) > 0 {
					path = "/" + strings.Join(pathParts, "/")
				}

				key := env + ":" + path + ":" + secretKey
				if _, match := refs[key]; match {
					e.currentValues[i] = strings.ReplaceAll(e.currentValues[i], syntax, replacement)
				}
			}
		}
	}
}

// results builds the final output.
func (e *SecretExpander) results() []ExpandedSecret {
	results := make([]ExpandedSecret, len(e.inputSecrets))
	for i, secret := range e.inputSecrets {
		results[i] = ExpandedSecret{
			ID:            secret.ID,
			ExpandedValue: e.currentValues[i],
		}
	}
	return results
}

func hasReferences(value string) bool {
	return interpolationRegex.MatchString(value)
}

func copyVisited(visited map[string]struct{}) map[string]struct{} {
	newVisited := make(map[string]struct{}, len(visited)+1)
	for k, v := range visited {
		newVisited[k] = v
	}
	return newVisited
}
