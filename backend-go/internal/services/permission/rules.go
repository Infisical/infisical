package permission

import (
	"encoding/json"
	"slices"

	"github.com/infisical/gocasl"

	"github.com/infisical/api/internal/services/permission/project"
)

// roleWithPermissions pairs a role slug with its optional custom permissions JSON.
type roleWithPermissions struct {
	Role        string
	Permissions *string
}

// buildProjectPermissionRules maps role slugs to their builtin JSONRule sets and
// unpacks custom roles via gocasl.UnpackRules.
// Exact port of buildProjectPermissionRules from permission-service.ts:77-109.
func buildProjectPermissionRules(roles []roleWithPermissions) []gocasl.JSONRule {
	var allRules []gocasl.JSONRule

	for _, roleEntry := range roles {
		switch roleEntry.Role {
		case project.RoleAdmin:
			allRules = append(allRules, project.AdminPermissions...)
		case project.RoleMember:
			allRules = append(allRules, project.MemberPermissions...)
		case project.RoleViewer:
			allRules = append(allRules, project.ViewerPermissions...)
		case project.RoleNoAccess:
			allRules = append(allRules, project.NoAccessPermissions...)
		case project.RoleSshHostBootstrapper:
			allRules = append(allRules, project.SshHostBootstrapPermissions...)
		case project.RoleKmsCryptographicOperator:
			allRules = append(allRules, project.CryptographicOperatorPermissions...)
		case project.RoleCustom:
			if roleEntry.Permissions != nil {
				var packed []gocasl.PackedRule
				if err := json.Unmarshal([]byte(*roleEntry.Permissions), &packed); err == nil {
					unpacked := gocasl.UnpackRules(packed)
					allRules = append(allRules, unpacked...)
				}
			}
		}
	}

	return allRules
}

// ServiceTokenScope represents a single scope entry from a service token.
type ServiceTokenScope struct {
	Environment string `json:"environment"`
	SecretPath  string `json:"secretPath"`
}

// buildServiceTokenProjectPermission builds scoped rules with $glob conditions
// on secretPath and exact match on environment.
// Port of buildServiceTokenProjectPermission from project-permission.ts:1848-1887.
func buildServiceTokenProjectPermission(scopes []ServiceTokenScope, permissions []string) []gocasl.JSONRule {
	canWrite := containsString(permissions, "write")
	canRead := containsString(permissions, "read")

	subjects := gocasl.StringOrSlice{
		project.SubSecrets,
		project.SubSecretImports,
		project.SubSecretFolders,
	}

	var rules []gocasl.JSONRule
	for _, scope := range scopes {
		cond := gocasl.Cond{
			"secretPath":  gocasl.Op{"$glob": scope.SecretPath},
			"environment": scope.Environment,
		}

		if canWrite {
			rules = append(rules, gocasl.JSONRule{
				Action:     gocasl.StringOrSlice{"edit", "create", "delete"},
				Subject:    subjects,
				Conditions: cond,
			})
		}
		if canRead {
			rules = append(rules, gocasl.JSONRule{
				Action:     gocasl.StringOrSlice{"read"},
				Subject:    subjects,
				Conditions: cond,
			})
		}
	}

	return rules
}

func containsString(slice []string, target string) bool {
	return slices.Contains(slice, target)
}
