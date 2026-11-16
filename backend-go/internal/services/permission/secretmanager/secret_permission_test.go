package secretmanager_test

import (
	"encoding/json"
	"testing"

	"github.com/infisical/gocasl"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/permission/project"
	"github.com/infisical/api/internal/services/permission/secretmanager"
)

func TestSecretAccessChecker_MatchesFolderRulesOnAnySpellingOfThePath(t *testing.T) {
	t.Parallel()

	readValueActions := gocasl.StringOrSlice{
		project.SecretActionReadValue.Name(),
		project.SecretActionDescribeAndReadValue.Name(),
	}
	rules := append([]gocasl.JSONRule{}, project.MemberPermissions...)
	rules = append(rules, gocasl.JSONRule{
		Action:     readValueActions,
		Subject:    gocasl.StringOrSlice{project.SubSecrets},
		Conditions: gocasl.Cond{"environment": "dev", "secretPath": "/locked"},
		Inverted:   true,
	})
	rulesJSON, err := json.Marshal(rules)
	require.NoError(t, err)
	ability, err := gocasl.LoadFromJSON(rulesJSON, gocasl.LoadOptions{FieldOps: permission.PermissionFieldOps()})
	require.NoError(t, err)

	checker := secretmanager.NewSecretAccessChecker(ability)

	for _, path := range []string{"/locked", "//locked", "locked", "/locked/", "/locked//"} {
		assert.False(t, checker.CanReadSecretValue("dev", path, "API_KEY", nil), "path %q", path)
		assert.True(t, checker.CanDescribeSecret("dev", path, "API_KEY", nil), "path %q", path)
	}
	assert.True(t, checker.CanReadSecretValue("dev", "/open", "API_KEY", nil))
}
