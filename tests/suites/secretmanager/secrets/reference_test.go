package secrets_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

func TestSecretReference_Expand(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should expand a reference to a secret in the same folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "HELLO", "world")

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "GREETING", "hello ${HELLO}")

		// Assert
		require.Equal(t, "hello world", secretmanager.GetSecret(t, proj, "dev", "GREETING").Value)
		require.Equal(t, "hello world", valueIn(secretmanager.ListSecrets(t, proj, "dev"), "GREETING"))
	})

	t.Run("should expand references to a nested folder and to another environment", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/deep/nested")
		secretmanager.CreateSecret(t, proj, "dev", "NESTED_KEY", "nested", secretmanager.WithPath("/deep/nested"))
		secretmanager.CreateSecret(t, proj, "prod", "PROD_KEY", "prod")

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "COMBINED", "${dev.deep.nested.NESTED_KEY}+${prod.PROD_KEY}")

		// Assert
		require.Equal(t, "nested+prod", secretmanager.GetSecret(t, proj, "dev", "COMBINED").Value)
	})

	t.Run("should expand every occurrence of a reference and every distinct reference in one value", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "HOST", "db")
		secretmanager.CreateSecret(t, proj, "dev", "PORT", "5432")

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "URL", "${HOST}:${PORT}/${HOST}")

		// Assert
		require.Equal(t, "db:5432/db", secretmanager.GetSecret(t, proj, "dev", "URL").Value)
	})

	t.Run("should expand a chain of references to the last value", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "C", "end")
		secretmanager.CreateSecret(t, proj, "dev", "B", "${C}")

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "A", "${B}")

		// Assert
		require.Equal(t, "end", secretmanager.GetSecret(t, proj, "dev", "A").Value)
	})

	t.Run("should resolve to an empty string when the referenced value is empty", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "EMPTY", "")

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "PADDED", "[${EMPTY}]")

		// Assert
		require.Equal(t, "[]", secretmanager.GetSecret(t, proj, "dev", "PADDED").Value)
	})

	t.Run("should resolve a reference to a secret whose name contains a space", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "MY KEY", "spaced")

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "REF", "${MY KEY}")

		// Assert
		require.Equal(t, "spaced", secretmanager.GetSecret(t, proj, "dev", "REF").Value)
	})

	t.Run("should insert replacement-pattern characters from the referenced value literally", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "PASSWORD", "p$&ss$1$$")

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "DSN", "user:${PASSWORD}@db")

		// Assert
		require.Equal(t, "user:p$&ss$1$$@db", secretmanager.GetSecret(t, proj, "dev", "DSN").Value)
	})

	t.Run("should return the raw reference when expansion is turned off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "HELLO", "world")
		secretmanager.CreateSecret(t, proj, "dev", "GREETING", "hello ${HELLO}")

		// Action
		res, err := tn.Admin.API.GetSecretByNameV4WithResponse(t.Context(), "GREETING", &api.GetSecretByNameV4Params{
			ProjectId:              proj.ID,
			Environment:            new("dev"),
			ExpandSecretReferences: new(api.GetSecretByNameV4ParamsExpandSecretReferencesFalse),
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading returned %d: %s", res.StatusCode(), res.Body)
		require.Equal(t, "hello ${HELLO}", res.JSON200.Secret.SecretValue)
	})

	t.Run("should quote a multiline expanded value when the secret skips multiline encoding", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "PEM", "line1\nline2")

		// Action
		res, err := tn.Admin.API.CreateSecretV4WithResponse(t.Context(), "PEM_REF", api.CreateSecretV4JSONRequestBody{
			ProjectId:             proj.ID,
			Environment:           "dev",
			SecretValue:           "${PEM}",
			SkipMultilineEncoding: new(true),
		})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "creating returned %s", res.Body)

		// Assert
		require.Equal(t, `"line1\nline2"`, secretmanager.GetSecret(t, proj, "dev", "PEM_REF").Value)
	})

	t.Run("should expand references inside imported secrets", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "prod", "BASE", "hello")
		secretmanager.CreateSecret(t, proj, "prod", "GREETING", "${BASE} world")

		// Action
		imp, err := tn.Admin.API.CreateSecretImportWithResponse(t.Context(), api.CreateSecretImportJSONRequestBody{
			ProjectId:   proj.ID,
			Environment: "dev",
			Import: struct {
				Environment     string  `json:"environment"`
				Path            string  `json:"path"`
				SourceProjectId *string `json:"sourceProjectId,omitempty"`
			}{Environment: "prod", Path: "/"},
		})
		require.NoError(t, err)
		require.NotNilf(t, imp.JSON200, "creating the import returned %d: %s", imp.StatusCode(), apierr.Body(imp.Body))

		// Assert
		res, err := tn.Admin.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
			ProjectId: &proj.ID, Environment: new("dev"),
		})
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing returned %d: %s", res.StatusCode(), res.Body)
		require.NotNil(t, res.JSON200.Imports)
		require.Len(t, *res.JSON200.Imports, 1)
		imported := map[string]string{}
		for _, s := range (*res.JSON200.Imports)[0].Secrets {
			imported[s.SecretKey] = s.SecretValue
		}
		require.Equal(t, "hello world", imported["GREETING"])
	})

	t.Run("should expand local and nested references inside a replicated import once it has replicated", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "prod", "/deep/nested")
		secretmanager.CreateSecret(t, proj, "prod", "DEEP_KEY", "testing", secretmanager.WithPath("/deep"))
		secretmanager.CreateSecret(t, proj, "prod", "NESTED_KEY", "reference", secretmanager.WithPath("/deep/nested"))
		secretmanager.CreateSecret(t, proj, "prod", "COMBINED", "secret ${NESTED_KEY} ${prod.deep.DEEP_KEY}",
			secretmanager.WithPath("/deep/nested"))

		// Action
		imp, err := tn.Admin.API.CreateSecretImportWithResponse(t.Context(), api.CreateSecretImportJSONRequestBody{
			ProjectId:     proj.ID,
			Environment:   "dev",
			IsReplication: new(true),
			Import: struct {
				Environment     string  `json:"environment"`
				Path            string  `json:"path"`
				SourceProjectId *string `json:"sourceProjectId,omitempty"`
			}{Environment: "prod", Path: "/deep/nested"},
		})
		require.NoError(t, err)
		require.NotNilf(t, imp.JSON200, "creating the import returned %d: %s", imp.StatusCode(), apierr.Body(imp.Body))

		// Assert
		var imported map[string]string
		wait.Until(t, "the replicated import to carry the expanded secret", func() bool {
			res, err := tn.Admin.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
				ProjectId: &proj.ID, Environment: new("dev"),
			})
			if err != nil || res.JSON200 == nil || res.JSON200.Imports == nil || len(*res.JSON200.Imports) == 0 {
				return false
			}
			imported = map[string]string{}
			for _, s := range (*res.JSON200.Imports)[0].Secrets {
				imported[s.SecretKey] = s.SecretValue
			}
			return imported["COMBINED"] != ""
		})
		require.Equal(t, "secret reference testing", imported["COMBINED"])
	})

	t.Run("should resolve to the actor's own override of the referenced secret when overrides are included", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		owner := proj.NewUser(t, fixture.WithPrincipalName("owner"))
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "shared")
		secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "mine", secretmanager.As(owner), secretmanager.WithPersonal())

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "DSN", "user:${DB_PASS}")

		// Assert
		require.Equal(t, "user:mine",
			valueIn(secretmanager.ListSecrets(t, proj, "dev", secretmanager.As(owner), secretmanager.WithPersonal()), "DSN"))
		require.Equal(t, "user:shared", valueIn(secretmanager.ListSecrets(t, proj, "dev", secretmanager.As(owner)), "DSN"))
	})

	t.Run("should keep a reference literal when the secret, folder or environment does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		dangling := "${MISSING} ${dev.nope.KEY} ${qa.KEY}"

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "DANGLING", dangling)

		// Assert
		require.Equal(t, dangling, secretmanager.GetSecret(t, proj, "dev", "DANGLING").Value)
	})

	t.Run("should keep a reference padded with spaces literal", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "KEY", "value")

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "PADDED", "${ KEY }")

		// Assert
		require.Equal(t, "${ KEY }", secretmanager.GetSecret(t, proj, "dev", "PADDED").Value)
	})

	t.Run("should answer a circular pair with a literal reference rather than looping", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "A", "${B}")

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "B", "${A}")

		// Assert
		require.Contains(t, secretmanager.GetSecret(t, proj, "dev", "A").Value, "${")
	})

	t.Run("should stop expanding a chain longer than the reference depth limit", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		chain := func(prefix string, length int) {
			secretmanager.CreateSecret(t, proj, "dev", fmt.Sprintf("%s%d", prefix, length), "end")
			for i := length - 1; i >= 1; i-- {
				secretmanager.CreateSecret(t, proj, "dev", fmt.Sprintf("%s%d", prefix, i), fmt.Sprintf("${%s%d}", prefix, i+1))
			}
		}

		// Action
		chain("WITHIN", 12)
		chain("BEYOND", 13)

		// Assert
		spec := "the expander stops at depth 10, so the first secret of a 12-long chain resolves and a 13-long one does not"
		require.Equal(t, "end", secretmanager.GetSecret(t, proj, "dev", "WITHIN1").Value, spec)
		require.Equal(t, "${BEYOND13}", secretmanager.GetSecret(t, proj, "dev", "BEYOND1").Value, spec)
	})

	t.Run("should refuse a read when the actor cannot read the referenced secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reader := readerOfOneFolder(t, proj, "/a")
		secretmanager.CreateFolder(t, proj, "dev", "/b")
		secretmanager.CreateSecret(t, proj, "dev", "B", "hidden", secretmanager.WithPath("/b"))
		secretmanager.CreateSecret(t, proj, "dev", "A", "${dev.b.B}", secretmanager.WithPath("/a"))

		// Action
		res, err := reader.API.GetSecretByNameV4WithResponse(t.Context(), "A",
			&api.GetSecretByNameV4Params{ProjectId: proj.ID, Environment: new("dev"), SecretPath: new("/a")})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t,
			"You do not have permission to read secret 'B' in environment 'dev' at path '/b', which is referenced by secret 'A' in environment 'dev' at path '/a'.",
			res.JSON403.Message)
		require.NotContains(t, string(res.Body), "hidden")
	})

	t.Run("should refuse the whole list when one secret references what the actor cannot read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		reader := readerOfOneFolder(t, proj, "/a")
		secretmanager.CreateFolder(t, proj, "dev", "/b")
		secretmanager.CreateSecret(t, proj, "dev", "B", "hidden", secretmanager.WithPath("/b"))
		secretmanager.CreateSecret(t, proj, "dev", "A", "${dev.b.B}", secretmanager.WithPath("/a"))
		secretmanager.CreateSecret(t, proj, "dev", "PLAIN", "visible", secretmanager.WithPath("/a"))

		// Action
		res, err := reader.API.ListSecretsV4WithResponse(t.Context(), &api.ListSecretsV4Params{
			ProjectId: &proj.ID, Environment: new("dev"), SecretPath: new("/a"),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "Failed to expand one or more secret references", res.JSON403.Message)
		require.NotContains(t, string(res.Body), "hidden")
	})
}

func TestSecretReference_CrossProject(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should expand a reference into another project's granted folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		allowCrossProjectSharing(t, tn, true)
		grantFolder(t, tn, source, target)

		// Action
		secretmanager.CreateSecret(t, target, "dev", "REF", fmt.Sprintf("${@%s.dev.SHARED}", source.Slug))

		// Assert
		require.Equal(t, "from-source", secretmanager.GetSecret(t, target, "dev", "REF").Value)
	})

	t.Run("should keep the reference literal when the folder is not granted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		allowCrossProjectSharing(t, tn, true)
		ref := fmt.Sprintf("${@%s.dev.SHARED}", source.Slug)

		// Action
		secretmanager.CreateSecret(t, target, "dev", "REF", ref)

		// Assert
		require.Equal(t, ref, secretmanager.GetSecret(t, target, "dev", "REF").Value)
	})

	t.Run("should keep the reference literal once the organization turns sharing off", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		allowCrossProjectSharing(t, tn, true)
		grantFolder(t, tn, source, target)
		ref := fmt.Sprintf("${@%s.dev.SHARED}", source.Slug)
		secretmanager.CreateSecret(t, target, "dev", "REF", ref)

		// Action
		allowCrossProjectSharing(t, tn, false)

		// Assert
		require.Equal(t, ref, secretmanager.GetSecret(t, target, "dev", "REF").Value)
	})

	t.Run("should not expand references inside the other project's value", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		secretmanager.CreateSecret(t, source, "dev", "INNER", "inner")
		secretmanager.CreateSecret(t, source, "dev", "OUTER", "${INNER}")
		allowCrossProjectSharing(t, tn, true)
		grantFolder(t, tn, source, target)

		// Action
		secretmanager.CreateSecret(t, target, "dev", "REF", fmt.Sprintf("${@%s.dev.OUTER}", source.Slug))

		// Assert
		require.Equal(t, "${INNER}", secretmanager.GetSecret(t, target, "dev", "REF").Value)
	})

	t.Run("should keep resolving after the plan loses cross-project sharing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		allowCrossProjectSharing(t, tn, true)
		grantFolder(t, tn, source, target)
		secretmanager.CreateSecret(t, target, "dev", "REF", fmt.Sprintf("${@%s.dev.SHARED}", source.Slug))

		// Action
		tn.SetPlan(t, license.Enterprise().Without(license.CrossProjectSecretSharing))

		// Assert
		require.Equal(t, "from-source", secretmanager.GetSecret(t, target, "dev", "REF").Value,
			"a license check must never change what an existing reference reads")
	})
}

func valueIn(secrets []secretmanager.Secret, key string) string {
	for _, s := range secrets {
		if s.Key == key {
			return s.Value
		}
	}
	return ""
}

// readerOfOneFolder is a machine identity with no project role and a read grant on one
// dev folder, so it can read that folder and nothing else.
func readerOfOneFolder(t *testing.T, proj *fixture.Project, folderPath string) *harness.Principal {
	t.Helper()
	secretmanager.CreateFolder(t, proj, "dev", folderPath)
	reader := proj.NewMachineIdentity(t, fixture.WithRoles("no-access"))
	res, err := proj.Tenant().Admin.API.CreateIdentityFolderAccessWithResponse(t.Context(), proj.ID, reader.ID,
		api.CreateIdentityFolderAccessJSONRequestBody{
			EnvironmentSlug: "dev",
			SecretPath:      folderPath,
			Permission:      api.CreateIdentityFolderAccessJSONBodyPermissionRead,
		})
	require.NoError(t, err)
	require.Truef(t, res.StatusCode() == http.StatusOK, "granting folder access returned %d: %s",
		res.StatusCode(), apierr.Body(res.Body))
	return reader
}

func sharingProjects(t *testing.T, tn *harness.Tenant) (source, target *fixture.Project) {
	t.Helper()
	source = fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
	target = fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
	secretmanager.CreateSecret(t, source, "dev", "SHARED", "from-source")
	return source, target
}

func allowCrossProjectSharing(t *testing.T, tn *harness.Tenant, allowed bool) {
	t.Helper()
	res, err := tn.Admin.API.UpdateOrganizationWithResponse(t.Context(), tn.OrgID.String(),
		api.UpdateOrganizationJSONRequestBody{AllowCrossProjectSecretSharing: &allowed})
	require.NoError(t, err)
	require.Truef(t, res.StatusCode() == http.StatusOK, "setting cross-project sharing returned %d: %s",
		res.StatusCode(), apierr.Body(res.Body))
}

func grantFolder(t *testing.T, tn *harness.Tenant, source, target *fixture.Project) {
	t.Helper()
	res, err := tn.Admin.API.CreateProjectFolderGrantWithResponse(t.Context(), api.CreateProjectFolderGrantJSONRequestBody{
		SourceProjectId: source.ID,
		TargetProjectId: target.ID,
		Environment:     "dev",
		SecretPath:      "/",
	})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "granting the folder returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}
