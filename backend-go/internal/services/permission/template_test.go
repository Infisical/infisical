package permission

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestInterpolateRulesJSON_SimpleVar(t *testing.T) {
	t.Parallel()

	vars := map[string]any{
		"identity": map[string]any{
			"id":       "actor-123",
			"username": "alice",
		},
	}

	input := `{"identityId": "{{identity.id}}"}`
	result := InterpolateRulesJSON(input, vars)
	assert.Equal(t, `{"identityId": "actor-123"}`, result)
}

func TestInterpolateRulesJSON_MultipleVars(t *testing.T) {
	t.Parallel()

	vars := map[string]any{
		"identity": map[string]any{
			"id":       "actor-123",
			"username": "alice",
		},
	}

	input := `{"id": "{{identity.id}}", "name": "{{identity.username}}"}`
	result := InterpolateRulesJSON(input, vars)
	assert.Equal(t, `{"id": "actor-123", "name": "alice"}`, result)
}

func TestInterpolateRulesJSON_NestedMetadata(t *testing.T) {
	t.Parallel()

	vars := map[string]any{
		"identity": map[string]any{
			"metadata": map[string]string{
				"team": "backend",
			},
		},
	}

	input := `{"team": "{{identity.metadata.team}}"}`
	result := InterpolateRulesJSON(input, vars)
	assert.Equal(t, `{"team": "backend"}`, result)
}

func TestInterpolateRulesJSON_UnresolvedLeftAsIs(t *testing.T) {
	t.Parallel()

	vars := map[string]any{}
	input := `{"id": "{{identity.id}}"}`
	result := InterpolateRulesJSON(input, vars)
	assert.Equal(t, `{"id": "{{identity.id}}"}`, result, "unresolved templates must be left as-is")
}

func TestInterpolateRulesJSON_NoTemplates(t *testing.T) {
	t.Parallel()

	vars := map[string]any{"identity": map[string]any{"id": "123"}}
	input := `{"key": "plain value"}`
	result := InterpolateRulesJSON(input, vars)
	assert.Equal(t, `{"key": "plain value"}`, result)
}

func TestInterpolateRulesJSON_EmptyString(t *testing.T) {
	t.Parallel()

	result := InterpolateRulesJSON("", nil)
	assert.Equal(t, "", result)
}

func TestInterpolateRulesJSON_SpecialCharsInValue(t *testing.T) {
	t.Parallel()

	vars := map[string]any{
		"identity": map[string]any{
			"username": `alice "bob" <charlie>`,
		},
	}

	input := `{"name": "{{identity.username}}"}`
	result := InterpolateRulesJSON(input, vars)
	// json.Marshal escapes quotes and angle brackets inside strings
	assert.Contains(t, result, `alice \"bob\" \u003ccharlie\u003e`)
}

func TestInterpolateRulesJSON_VarWithSpaces(t *testing.T) {
	t.Parallel()

	vars := map[string]any{
		"identity": map[string]any{"id": "abc"},
	}

	input := `{"id": "{{ identity.id }}"}`
	result := InterpolateRulesJSON(input, vars)
	assert.Equal(t, `{"id": "abc"}`, result)
}

func TestResolveVarPath(t *testing.T) {
	t.Parallel()

	vars := map[string]any{
		"identity": map[string]any{
			"id":       "actor-123",
			"username": "alice",
			"metadata": map[string]string{
				"team":  "backend",
				"level": "senior",
			},
		},
	}

	tests := []struct {
		name     string
		path     string
		expected any
	}{
		{"top level", "identity", vars["identity"]},
		{"nested string", "identity.id", "actor-123"},
		{"nested string 2", "identity.username", "alice"},
		{"deep nested via map[string]string", "identity.metadata.team", "backend"},
		{"missing key", "identity.nonexistent", nil},
		{"missing top level", "nonexistent", nil},
		{"missing deep", "identity.metadata.nonexistent", nil},
		{"too deep", "identity.id.extra", nil},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()
			result := resolveVarPath(vars, tt.path)
			assert.Equal(t, tt.expected, result)
		})
	}
}
