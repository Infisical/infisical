package aws

import (
	"encoding/base64"
	"encoding/json"
	"maps"
	"net/http"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ParameterStore is one account's SSM parameters in the served region.
type ParameterStore struct {
	Policy
	Parameters map[string]*Parameter `json:"parameters"`

	mu     sync.Mutex
	events fakenet.Emitter
	h      handler
}

// Parameter is keyed by its full name. SSM stores a root-level name without its
// leading slash, so "/DB_URL" is held as "DB_URL" while "/app/DB_URL" keeps it.
type Parameter struct {
	Name             string            `json:"name"`
	Type             string            `json:"type"`
	Value            string            `json:"value"`
	KeyID            string            `json:"keyId,omitempty"`
	Version          int64             `json:"version"`
	Tags             map[string]string `json:"tags,omitempty"`
	LastModifiedDate time.Time         `json:"lastModifiedDate"`
}

const (
	ssmDefaultKeyID     = "alias/aws/ssm"
	ssmMaxByPath        = 10
	ssmMaxDescribe      = 50
	ssmMaxDeleteBatch   = 10
	ssmMaxValueLength   = 4096
	ssmMaxHierarchyDeep = 15
)

func newParameterStore(svc service, events fakenet.Emitter) fakenet.Fake {
	ps := &ParameterStore{Parameters: map[string]*Parameter{}, events: events}
	ps.h = handler{svc: svc, mu: &ps.mu, policy: func() *Policy { return &ps.Policy }, actions: map[string]func(call) (any, *apiError){
		"GetParametersByPath":    ps.getParametersByPath,
		"DescribeParameters":     ps.describeParameters,
		"PutParameter":           ps.putParameter,
		"DeleteParameters":       ps.deleteParameters,
		"ListTagsForResource":    ps.listTagsForResource,
		"AddTagsToResource":      ps.addTagsToResource,
		"RemoveTagsFromResource": ps.removeTagsFromResource,
	}}
	return ps
}

func (ps *ParameterStore) ServeHTTP(w http.ResponseWriter, r *http.Request) { ps.h.serve(w, r) }

func (ps *ParameterStore) Snapshot() ([]byte, error) {
	ps.mu.Lock()
	defer ps.mu.Unlock()
	return json.Marshal(struct {
		Policy
		Parameters map[string]*Parameter `json:"parameters"`
	}{ps.Policy, ps.Parameters})
}

// Seed merges parameters that exist before Infisical touches the store. It skips the
// API's validation on purpose: a seed is whatever someone else put there.
func (ps *ParameterStore) Seed(raw []byte) error {
	var in struct {
		Policy
		Parameters map[string]*Parameter `json:"parameters"`
	}
	if err := json.Unmarshal(raw, &in); err != nil {
		return err
	}
	ps.mu.Lock()
	defer ps.mu.Unlock()
	ps.merge(in.Policy)
	for name, p := range in.Parameters {
		name = normalizeParameterName(name)
		if p.Type == "" {
			p.Type = "SecureString"
		}
		if p.Type == "SecureString" && p.KeyID == "" {
			p.KeyID = ssmDefaultKeyID
		}
		if p.Version == 0 {
			p.Version = 1
		}
		if p.LastModifiedDate.IsZero() {
			p.LastModifiedDate = now()
		}
		p.Name = name
		ps.Parameters[name] = p
	}
	return nil
}

func normalizeParameterName(name string) string {
	if rest, ok := strings.CutPrefix(name, "/"); ok && !strings.Contains(rest, "/") {
		return rest
	}
	return name
}

var parameterNamePattern = regexp.MustCompile(`^[a-zA-Z0-9_.\-/]+$`)

func validateParameterName(name string) *apiError {
	invalid := errf(http.StatusBadRequest, "ValidationException",
		`Parameter name: can't be prefixed with "aws" or "ssm" (case-insensitive). If formed as a path, it can consist of `+
			`sub-paths divided by slash symbol; each sub-path can be formed as a mix of letters, numbers and the following 3 symbols .-_`)
	if name == "" || !parameterNamePattern.MatchString(name) || strings.Contains(name, "//") || strings.HasSuffix(name, "/") {
		return invalid
	}
	first := strings.ToLower(strings.SplitN(strings.TrimPrefix(name, "/"), "/", 2)[0])
	if strings.HasPrefix(first, "aws") || strings.HasPrefix(first, "ssm") {
		return invalid
	}
	if strings.Contains(name, "/") && !strings.HasPrefix(name, "/") {
		return errf(http.StatusBadRequest, "ValidationException",
			"Parameter name must be a fully qualified name.")
	}
	if strings.Count(name, "/") > ssmMaxHierarchyDeep {
		return errf(http.StatusBadRequest, "HierarchyLevelLimitExceededException",
			"A hierarchy can have a maximum of 15 levels.")
	}
	return nil
}

// inPath reports whether a stored name sits at path, or anywhere below it when
// recursive.
func inPath(name, path string, recursive bool) bool {
	if path == "/" {
		if recursive {
			return true
		}
		return !strings.Contains(name, "/")
	}
	rest, ok := strings.CutPrefix(name, path)
	if !ok {
		return false
	}
	return recursive || !strings.Contains(rest, "/")
}

func validatePath(path string) (string, *apiError) {
	if !strings.HasPrefix(path, "/") {
		return "", errf(http.StatusBadRequest, "ValidationException",
			"The parameter doesn't meet the parameter name requirements. The parameter name must begin with a forward slash \"/\".")
	}
	if !strings.HasSuffix(path, "/") {
		path += "/"
	}
	return path, nil
}

// page sorts names and returns one page after the token, with the token for the next.
func page(names []string, token string, limit int) ([]string, string, *apiError) {
	slices.Sort(names)
	start := 0
	if token != "" {
		raw, err := base64.StdEncoding.DecodeString(token)
		if err != nil {
			return nil, "", errf(http.StatusBadRequest, "InvalidNextToken", "The specified token isn't valid.")
		}
		after := string(raw)
		start, _ = slices.BinarySearch(names, after)
		if start < len(names) && names[start] == after {
			start++
		}
	}
	end := min(start+limit, len(names))
	next := ""
	if end < len(names) {
		next = base64.StdEncoding.EncodeToString([]byte(names[end-1]))
	}
	return names[start:end], next, nil
}

func maxResults(given *int, limit, def int, field string) (int, *apiError) {
	if given == nil {
		return def, nil
	}
	if *given < 1 || *given > limit {
		return 0, errf(http.StatusBadRequest, "ValidationException",
			"1 validation error detected: Value '%d' at '%s' failed to satisfy constraint: Member must have value less than or equal to %d",
			*given, field, limit)
	}
	return *given, nil
}

func (ps *ParameterStore) arn(c call, name string) string {
	if !strings.HasPrefix(name, "/") {
		name = "/" + name
	}
	return "arn:aws:ssm:" + c.svc.region + ":" + c.account() + ":parameter" + name
}

func (ps *ParameterStore) getParametersByPath(c call) (any, *apiError) {
	var in struct {
		Path           string
		Recursive      bool
		WithDecryption bool
		MaxResults     *int
		NextToken      string
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	path, err := validatePath(in.Path)
	if err != nil {
		return nil, err
	}
	limit, err := maxResults(in.MaxResults, ssmMaxByPath, ssmMaxByPath, "maxResults")
	if err != nil {
		return nil, err
	}

	var names []string
	for name := range ps.Parameters {
		if inPath(name, path, in.Recursive) {
			names = append(names, name)
		}
	}
	got, next, err := page(names, in.NextToken, limit)
	if err != nil {
		return nil, err
	}

	out := make([]map[string]any, 0, len(got))
	for _, name := range got {
		p := ps.Parameters[name]
		value := p.Value
		if p.Type == "SecureString" && !in.WithDecryption {
			value = base64.StdEncoding.EncodeToString([]byte("kms:" + p.KeyID + ":" + p.Value))
		}
		out = append(out, map[string]any{
			"Name":             p.Name,
			"Type":             p.Type,
			"Value":            value,
			"Version":          p.Version,
			"LastModifiedDate": epoch(p.LastModifiedDate),
			"ARN":              ps.arn(c, p.Name),
			"DataType":         "text",
		})
	}
	res := map[string]any{"Parameters": out}
	if next != "" {
		res["NextToken"] = next
	}
	return res, nil
}

func (ps *ParameterStore) describeParameters(c call) (any, *apiError) {
	var in struct {
		MaxResults       *int
		NextToken        string
		ParameterFilters []struct {
			Key    string
			Option string
			Values []string
		}
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	limit, err := maxResults(in.MaxResults, ssmMaxDescribe, ssmMaxDescribe, "maxResults")
	if err != nil {
		return nil, err
	}

	var names []string
	for name := range ps.Parameters {
		keep := true
		for _, f := range in.ParameterFilters {
			switch f.Key {
			case "Path":
				match := false
				for _, v := range f.Values {
					path, pErr := validatePath(v)
					if pErr != nil {
						return nil, pErr
					}
					if inPath(name, path, f.Option == "Recursive") {
						match = true
					}
				}
				keep = keep && match
			case "Name":
				keep = keep && slices.ContainsFunc(f.Values, func(v string) bool {
					if f.Option == "BeginsWith" {
						return strings.HasPrefix(name, normalizeParameterName(v))
					}
					return name == normalizeParameterName(v)
				})
			default:
				return nil, errf(http.StatusBadRequest, "InvalidFilterKey", "The specified key isn't valid.")
			}
		}
		if keep {
			names = append(names, name)
		}
	}
	got, next, err := page(names, in.NextToken, limit)
	if err != nil {
		return nil, err
	}

	out := make([]map[string]any, 0, len(got))
	for _, name := range got {
		p := ps.Parameters[name]
		meta := map[string]any{
			"Name":             p.Name,
			"Type":             p.Type,
			"Version":          p.Version,
			"LastModifiedDate": epoch(p.LastModifiedDate),
			"ARN":              ps.arn(c, p.Name),
			"Tier":             "Standard",
			"DataType":         "text",
		}
		if p.KeyID != "" {
			meta["KeyId"] = p.KeyID
		}
		out = append(out, meta)
	}
	res := map[string]any{"Parameters": out}
	if next != "" {
		res["NextToken"] = next
	}
	return res, nil
}

func (ps *ParameterStore) putParameter(c call) (any, *apiError) {
	var in struct {
		Name      string
		Value     *string
		Type      string
		Overwrite bool
		KeyId     string
		Tags      []tag
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	if err := validateParameterName(in.Name); err != nil {
		return nil, err
	}
	if in.Value == nil || *in.Value == "" {
		return nil, errf(http.StatusBadRequest, "ValidationException",
			"1 validation error detected: Value '' at 'value' failed to satisfy constraint: Member must have length greater than or equal to 1")
	}
	if len(*in.Value) > ssmMaxValueLength {
		return nil, errf(http.StatusBadRequest, "ValidationException",
			"Standard tier parameters support a maximum parameter value of 4096 characters. "+
				"To create a larger parameter value, upgrade the parameter to use the advanced-parameter tier.")
	}
	if in.Overwrite && len(in.Tags) > 0 {
		return nil, errf(http.StatusBadRequest, "ValidationException",
			"Invalid request: tags and overwrite can't be used together. To create a parameter with tags, please remove overwrite flag. "+
				"To update tags for an existing parameter, please use AddTagsToResource or RemoveTagsFromResource.")
	}

	name := normalizeParameterName(in.Name)
	existing, exists := ps.Parameters[name]
	if exists && !in.Overwrite {
		return nil, errf(http.StatusBadRequest, "ParameterAlreadyExists",
			"The parameter already exists. To overwrite this value, set the overwrite option in the request to true.")
	}

	typ := in.Type
	if typ == "" {
		if !exists {
			return nil, errf(http.StatusBadRequest, "ValidationException", "A parameter type is required when you create a parameter.")
		}
		typ = existing.Type
	}
	keyID := ""
	if typ == "SecureString" {
		keyID = in.KeyId
		if keyID == "" {
			keyID = ssmDefaultKeyID
		}
	} else if in.KeyId != "" {
		return nil, errf(http.StatusBadRequest, "ValidationException", "KeyId is required for SecureString type parameter only.")
	}

	p := &Parameter{Name: name, Type: typ, Value: *in.Value, KeyID: keyID, Version: 1, LastModifiedDate: now()}
	if exists {
		p.Version = existing.Version + 1
		p.Tags = existing.Tags
	} else if len(in.Tags) > 0 {
		p.Tags = map[string]string{}
		for _, t := range in.Tags {
			p.Tags[t.Key] = t.Value
		}
	}
	ps.Parameters[name] = p
	ps.events.Publish(ParameterPut{ParameterDetail{Name: name}, p.Version})
	return map[string]any{"Version": p.Version, "Tier": "Standard"}, nil
}

func (ps *ParameterStore) deleteParameters(c call) (any, *apiError) {
	var in struct{ Names []string }
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	if len(in.Names) < 1 || len(in.Names) > ssmMaxDeleteBatch {
		return nil, errf(http.StatusBadRequest, "ValidationException",
			"1 validation error detected: Value at 'names' failed to satisfy constraint: Member must have length less than or equal to 10")
	}
	deleted, invalid := []string{}, []string{}
	for _, raw := range in.Names {
		name := normalizeParameterName(raw)
		if _, ok := ps.Parameters[name]; !ok {
			invalid = append(invalid, raw)
			continue
		}
		delete(ps.Parameters, name)
		deleted = append(deleted, raw)
		ps.events.Publish(ParameterDeleted{ParameterDetail{Name: name}})
	}
	return map[string]any{"DeletedParameters": deleted, "InvalidParameters": invalid}, nil
}

type tag struct {
	Key   string
	Value string
}

func (ps *ParameterStore) taggable(resourceType, resourceID string) (*Parameter, *apiError) {
	if resourceType != "Parameter" {
		return nil, errf(http.StatusBadRequest, "InvalidResourceType", "The resource type isn't valid.")
	}
	p, ok := ps.Parameters[normalizeParameterName(resourceID)]
	if !ok {
		return nil, errf(http.StatusBadRequest, "InvalidResourceId", "The resource ID isn't valid. Verify that you entered the correct ID and try again.")
	}
	return p, nil
}

func (ps *ParameterStore) listTagsForResource(c call) (any, *apiError) {
	var in struct{ ResourceType, ResourceId string }
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	p, err := ps.taggable(in.ResourceType, in.ResourceId)
	if err != nil {
		return nil, err
	}
	keys := make([]string, 0, len(p.Tags))
	for k := range p.Tags {
		keys = append(keys, k)
	}
	slices.Sort(keys)
	out := make([]tag, 0, len(keys))
	for _, k := range keys {
		out = append(out, tag{Key: k, Value: p.Tags[k]})
	}
	return map[string]any{"TagList": out}, nil
}

func (ps *ParameterStore) addTagsToResource(c call) (any, *apiError) {
	var in struct {
		ResourceType, ResourceId string
		Tags                     []tag
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	p, err := ps.taggable(in.ResourceType, in.ResourceId)
	if err != nil {
		return nil, err
	}
	tags := maps.Clone(p.Tags)
	if tags == nil {
		tags = map[string]string{}
	}
	for _, t := range in.Tags {
		tags[t.Key] = t.Value
	}
	if len(tags) > 50 {
		return nil, errf(http.StatusBadRequest, "TooManyTagsError", "The Targets parameter includes too many tags. Remove one or more tags and try the command again.")
	}
	p.Tags = tags
	ps.events.Publish(ParameterTagged{ParameterDetail{Name: p.Name}})
	return struct{}{}, nil
}

func (ps *ParameterStore) removeTagsFromResource(c call) (any, *apiError) {
	var in struct {
		ResourceType, ResourceId string
		TagKeys                  []string
	}
	if err := decodeJSON(c, &in); err != nil {
		return nil, err
	}
	p, err := ps.taggable(in.ResourceType, in.ResourceId)
	if err != nil {
		return nil, err
	}
	for _, k := range in.TagKeys {
		delete(p.Tags, k)
	}
	ps.events.Publish(ParameterUntagged{ParameterDetail{Name: p.Name}})
	return struct{}{}, nil
}
