package secret

import (
	"regexp"
	"strings"
)

// AbsoluteSecretRef identifies an absolute reference like ${env.path.KEY}.
type AbsoluteSecretRef struct {
	Env  string
	Path string
	Key  string
}

// CacheKey returns a unique string key for map lookups.
func (r AbsoluteSecretRef) CacheKey() string {
	return r.Env + ":" + r.Path + ":" + r.Key
}

// ExpandOpts configures the expansion behavior.
type ExpandOpts struct {
	// CanAccessAbsolute checks if the actor can access an absolute reference.
	// Called AFTER fetching, with actual tags from the database.
	// Return false to deny (ref becomes empty string and is tracked as denied).
	// If nil, all fetched absolute refs are allowed.
	CanAccessAbsolute func(ref AbsoluteSecretRef, tags []string) bool

	// FetchAbsoluteSecrets fetches secrets for absolute references.
	// Should return all requested secrets - permission filtering happens after via CanAccessAbsolute.
	// If nil, absolute refs resolve to empty string.
	FetchAbsoluteSecrets func(refs []AbsoluteSecretRef) []*ProcessedSecret
}

const maxExpansionDepth = 10

var interpolationRegex = regexp.MustCompile(`\${([a-zA-Z0-9-_.]+)}`)

// SecretExpander handles secret reference expansion.
// It mutates ProcessedSecret.Value in place with expanded values.
type SecretExpander struct {
	secrets        []*ProcessedSecret
	opts           ExpandOpts
	localLookup    map[string]*ProcessedSecret            // key -> secret (first occurrence wins)
	absoluteLookup map[string]map[string]*ProcessedSecret // "env:path" -> key -> secret
	fullyExpanded  []bool
	deniedRefs     map[string]struct{} // cacheKey -> denied by permission check
	requestedRefs  map[string]struct{} // cacheKey -> already requested (avoid infinite loop)
}

// NewSecretExpander creates an expander from priority-ordered secrets.
// First occurrence of each key wins for relative reference resolution.
// Call Expand() to mutate the secrets' Value fields in place.
func NewSecretExpander(secrets []*ProcessedSecret, opts ExpandOpts) *SecretExpander {
	expander := &SecretExpander{
		secrets:        secrets,
		opts:           opts,
		localLookup:    make(map[string]*ProcessedSecret),
		absoluteLookup: make(map[string]map[string]*ProcessedSecret),
		fullyExpanded:  make([]bool, len(secrets)),
		deniedRefs:     make(map[string]struct{}),
		requestedRefs:  make(map[string]struct{}),
	}

	for _, sec := range secrets {
		if _, exists := expander.localLookup[sec.Secret.Key]; !exists {
			expander.localLookup[sec.Secret.Key] = sec
		}
	}

	return expander
}

// Expand performs the full expansion, mutating each secret's Value field.
// It iteratively expands references, fetching absolute refs as needed.
func (e *SecretExpander) Expand() {
	for {
		needed := e.expandPass()
		if len(needed) == 0 {
			break
		}

		var toFetch []AbsoluteSecretRef
		for _, ref := range needed {
			cacheKey := ref.CacheKey()

			// Skip if already requested (prevents infinite loop for not-found refs)
			if _, requested := e.requestedRefs[cacheKey]; requested {
				continue
			}

			toFetch = append(toFetch, ref)
			e.requestedRefs[cacheKey] = struct{}{}
		}

		if len(toFetch) > 0 && e.opts.FetchAbsoluteSecrets != nil {
			fetched := e.opts.FetchAbsoluteSecrets(toFetch)

			// Post-fetch permission check with actual tags
			var allowed []*ProcessedSecret
			for _, sec := range fetched {
				ref := AbsoluteSecretRef{Env: sec.Environment, Path: sec.SecretPath, Key: sec.Secret.Key}

				if e.opts.CanAccessAbsolute != nil {
					tagSlugs := make([]string, len(sec.Secret.Tags))
					for i, tag := range sec.Secret.Tags {
						tagSlugs[i] = tag.Slug
					}
					if !e.opts.CanAccessAbsolute(ref, tagSlugs) {
						e.deniedRefs[ref.CacheKey()] = struct{}{}
						continue
					}
				}

				allowed = append(allowed, sec)
			}

			e.addAbsoluteSecrets(allowed)
		} else {
			break
		}
	}

	e.replaceDeniedRefs()
	e.replaceNotFoundRefs()
}

// DeniedRefs returns the set of absolute references that were denied due to permissions.
// Each entry is in "env:path:key" format.
func (e *SecretExpander) DeniedRefs() []string {
	refs := make([]string, 0, len(e.deniedRefs))
	for ref := range e.deniedRefs {
		refs = append(refs, ref)
	}
	return refs
}

// HasDeniedRefs returns true if any absolute references were denied.
func (e *SecretExpander) HasDeniedRefs() bool {
	return len(e.deniedRefs) > 0
}

// expandPass expands all references in current values.
// Returns list of absolute refs that are needed but not yet available.
func (e *SecretExpander) expandPass() []AbsoluteSecretRef {
	neededRefs := make(map[string]AbsoluteSecretRef)

	for i, sec := range e.secrets {
		if e.fullyExpanded[i] || sec.ValueHidden {
			continue
		}

		expanded, needed := e.expandValue(sec.Value, make(map[string]struct{}), 0)
		sec.Value = expanded

		if len(needed) == 0 && !hasReferences(expanded) {
			e.fullyExpanded[i] = true
		}

		for _, ref := range needed {
			neededRefs[ref.CacheKey()] = ref
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
//
// Cycle resolution: When a circular reference is detected (e.g., A references itself),
// one level of substitution occurs before the cycle breaks. For example:
//   - A = "prefix-${A}-suffix"
//   - Expands to "prefix-prefix--suffix-suffix" (not "prefix--suffix")
//
// This happens because the outer ${A} resolves to the inner expansion result,
// where the cycle was detected and replaced with empty string. This is intentional
// behavior matching the Node.js implementation.
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

		var resolvedValue string
		var secretID string
		var found bool

		if len(parts) == 1 {
			// Relative reference: ${KEY}
			found = true // Always replace relative refs (with empty if not found)
			if sec := e.localLookup[parts[0]]; sec != nil {
				secretID = sec.Environment + ":" + sec.SecretPath + ":" + sec.Secret.Key

				if _, cyclic := visited[secretID]; !cyclic {
					visited[secretID] = struct{}{}
					expandedValue, moreNeeded := e.expandValue(sec.Value, visited, depth+1)
					delete(visited, secretID)
					resolvedValue = expandedValue
					neededRefs = append(neededRefs, moreNeeded...)
				}
				// else: cyclic, resolvedValue stays ""
			}
			// else: not found, resolvedValue stays "" (missing ref becomes empty)
		} else {
			// Absolute reference: ${env.path.KEY}
			env := parts[0]
			secretKey := parts[len(parts)-1]
			pathParts := parts[1 : len(parts)-1]
			path := "/"
			if len(pathParts) > 0 {
				path = "/" + strings.Join(pathParts, "/")
			}

			ref := AbsoluteSecretRef{Env: env, Path: path, Key: secretKey}
			secretID = ref.CacheKey()
			locationKey := env + ":" + path

			if secrets, ok := e.absoluteLookup[locationKey]; ok {
				if sec, ok := secrets[secretKey]; ok {
					found = true

					if _, cyclic := visited[secretID]; !cyclic {
						visited[secretID] = struct{}{}
						expandedValue, moreNeeded := e.expandValue(sec.Value, visited, depth+1)
						delete(visited, secretID)
						resolvedValue = expandedValue
						neededRefs = append(neededRefs, moreNeeded...)
					}
					// else: cyclic, resolvedValue stays ""
				}
			}

			if !found {
				neededRefs = append(neededRefs, ref)
				continue
			}
		}

		if found {
			value = strings.ReplaceAll(value, syntax, resolvedValue)
		}
	}

	return value, neededRefs
}

// addAbsoluteSecrets adds fetched absolute secrets to the lookup.
func (e *SecretExpander) addAbsoluteSecrets(secrets []*ProcessedSecret) {
	for _, sec := range secrets {
		locationKey := sec.Environment + ":" + sec.SecretPath

		if e.absoluteLookup[locationKey] == nil {
			e.absoluteLookup[locationKey] = make(map[string]*ProcessedSecret)
		}

		if _, exists := e.absoluteLookup[locationKey][sec.Secret.Key]; !exists {
			e.absoluteLookup[locationKey][sec.Secret.Key] = sec
		}
	}

	// Reset expansion state for secrets that still have references
	for i := range e.fullyExpanded {
		if hasReferences(e.secrets[i].Value) {
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
	notFound := make(map[string]struct{})
	for key := range e.requestedRefs {
		if _, denied := e.deniedRefs[key]; denied {
			continue
		}
		// Parse key back to check if it's in absoluteLookup
		parts := strings.SplitN(key, ":", 3)
		if len(parts) != 3 {
			continue
		}
		env, path, secretKey := parts[0], parts[1], parts[2]
		locationKey := env + ":" + path
		if secrets, ok := e.absoluteLookup[locationKey]; ok {
			if _, found := secrets[secretKey]; found {
				continue
			}
		}
		notFound[key] = struct{}{}
	}
	e.replaceAbsoluteRefsWith(notFound, "")
}

// replaceAbsoluteRefsWith replaces absolute refs matching the given set with the replacement string.
func (e *SecretExpander) replaceAbsoluteRefsWith(refs map[string]struct{}, replacement string) {
	for _, sec := range e.secrets {
		if sec.ValueHidden {
			continue
		}

		matches := interpolationRegex.FindAllStringSubmatch(sec.Value, -1)
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

				ref := AbsoluteSecretRef{Env: env, Path: path, Key: secretKey}
				if _, match := refs[ref.CacheKey()]; match {
					sec.Value = strings.ReplaceAll(sec.Value, syntax, replacement)
				}
			}
		}
	}
}

func hasReferences(value string) bool {
	return interpolationRegex.MatchString(value)
}
