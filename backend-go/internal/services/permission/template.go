package permission

import (
	"encoding/json"
	"regexp"
	"strings"
)

var handlebarsPattern = regexp.MustCompile(`\{\{([^}]+)\}\}`)

// InterpolateRulesJSON resolves Handlebars-style templates (e.g. {{identity.id}})
// in a JSON rules string by replacing them with the actual values from vars.
// This mirrors the Node.js behavior where interpolation happens on the raw JSON
// string before CASL parses the rules — gocasl never sees template syntax.
func InterpolateRulesJSON(rulesJSON string, vars map[string]any) string {
	return handlebarsPattern.ReplaceAllStringFunc(rulesJSON, func(match string) string {
		path := strings.TrimSpace(match[2 : len(match)-2])

		val := resolveVarPath(vars, path)
		if val == nil {
			return match // leave unresolved templates as-is
		}

		// The replaced value must be valid inline JSON since it sits inside a JSON string.
		// json.Marshal handles escaping for strings, numbers, booleans, etc.
		b, err := json.Marshal(val)
		if err != nil {
			return match
		}

		result := string(b)

		// If the value is a string, json.Marshal wraps it in quotes ("value").
		// But the template is already inside a JSON string (e.g. "field": "{{identity.id}}"),
		// so we strip the outer quotes to avoid double-quoting.
		if s, ok := val.(string); ok {
			_ = s
			result = result[1 : len(result)-1]
		}

		return result
	})
}

// resolveVarPath traverses a nested map following a dotted path.
// "identity.id" → vars["identity"]["id"]
// "identity.metadata.team" → vars["identity"]["metadata"]["team"]
func resolveVarPath(vars map[string]any, path string) any {
	parts := strings.Split(path, ".")
	var current any = vars

	for _, part := range parts {
		switch m := current.(type) {
		case map[string]any:
			val, ok := m[part]
			if !ok {
				return nil
			}
			current = val
		case map[string]string:
			val, ok := m[part]
			if !ok {
				return nil
			}
			current = val
		default:
			return nil
		}
	}

	return current
}
