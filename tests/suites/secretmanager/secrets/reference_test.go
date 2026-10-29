package secrets_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
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
		dangling := "${MISSING} ${MISSING} ${dev.nope.KEY} ${qa.KEY}"

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "DANGLING", dangling)

		// Assert
		require.Equal(t, dangling, secretmanager.GetSecret(t, proj, "dev", "DANGLING").Value)
		require.Equal(t, dangling, valueIn(secretmanager.ListSecrets(t, proj, "dev"), "DANGLING"),
			"listing expands references on its own path and must leave them literal too")
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
		require.Equal(t, "${B}", secretmanager.GetSecret(t, proj, "dev", "A").Value)
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

func TestSecretReference_Rewrite(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should rewrite local and nested references in other secrets when the referenced secret is renamed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateSecret(t, proj, "dev", "OLD", "value")
		secretmanager.CreateSecret(t, proj, "dev", "LOCAL", "x-${OLD}")
		secretmanager.CreateSecret(t, proj, "dev", "NESTED", "y-${dev.OLD}", secretmanager.WithPath("/app"))

		// Action
		res, err := tn.Admin.API.UpdateSecretV4WithResponse(t.Context(), "OLD",
			api.UpdateSecretV4JSONRequestBody{ProjectId: proj.ID, Environment: "dev", NewSecretName: new("NEW")})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "renaming returned %s", apierr.Body(res.Body))

		// Assert
		require.Equal(t, "x-${NEW}", rawValue(t, proj, "dev", "/", "LOCAL"))
		require.Equal(t, "y-${dev.NEW}", rawValue(t, proj, "dev", "/app", "NESTED"))
		require.Equal(t, "y-value", secretmanager.GetSecret(t, proj, "dev", "NESTED", secretmanager.WithPath("/app")).Value)
	})

	t.Run("should rewrite a local reference into a nested one when the referenced secret is moved", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "prod", "/app")
		moved := secretmanager.CreateSecret(t, proj, "dev", "DB_PASS", "value")
		secretmanager.CreateSecret(t, proj, "dev", "DSN", "user:${DB_PASS}")

		// Action
		res, err := tn.Admin.API.MoveSecretsV4WithResponse(t.Context(), api.MoveSecretsV4JSONRequestBody{
			ProjectId:              proj.ID,
			SourceEnvironment:      "dev",
			DestinationEnvironment: "prod",
			DestinationSecretPath:  new("/app"),
			SecretIds:              []string{moved.ID},
		})
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "moving returned %d: %s", res.StatusCode(), apierr.Body(res.Body))

		// Assert
		require.Equal(t, "user:${prod.app.DB_PASS}", rawValue(t, proj, "dev", "/", "DSN"))
		require.Equal(t, "user:value", secretmanager.GetSecret(t, proj, "dev", "DSN").Value)
	})

	t.Run("should keep a reference unchanged and unresolved when the folder it names is renamed", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "a folder rename does not rewrite references today, unlike a secret rename or move")

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateSecret(t, proj, "dev", "KEY", "value", secretmanager.WithPath("/app"))
		secretmanager.CreateSecret(t, proj, "dev", "REF", "${dev.app.KEY}")

		// Action
		res, err := tn.Admin.API.UpdateSecretFolderWithResponse(t.Context(), secretmanager.FolderID(t, proj, "dev", "/", "app"),
			api.UpdateSecretFolderJSONRequestBody{ProjectId: proj.ID, Environment: "dev", Path: new("/"), Name: "svc"})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "renaming the folder returned %s", apierr.Body(res.Body))

		// Assert
		require.Equal(t, "${dev.app.KEY}", rawValue(t, proj, "dev", "/", "REF"))
		require.Equal(t, "${dev.app.KEY}", secretmanager.GetSecret(t, proj, "dev", "REF").Value)
		require.Equal(t, "value", secretmanager.GetSecret(t, proj, "dev", "KEY", secretmanager.WithPath("/svc")).Value)
	})
}

func TestSecretReference_Tree(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the expanded value and each referenced secret as a child", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, proj, "dev", "HOST", "db")
		secretmanager.CreateSecret(t, proj, "prod", "PORT", "5432")
		secretmanager.CreateSecret(t, proj, "dev", "URL", "${HOST}:${prod.PORT}")

		// Action
		res, err := tn.Admin.API.GetSecretReferenceTreeV4WithResponse(t.Context(), "URL",
			&api.GetSecretReferenceTreeV4Params{ProjectId: proj.ID, Environment: "dev"})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the tree returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.NotNil(t, res.JSON200.Value)
		require.Equal(t, "db:5432", *res.JSON200.Value)
		require.ElementsMatch(t, []string{"dev:/:HOST", "prod:/:PORT"}, childLocations(decodeReferenceTree(t, res.Body)))
	})

	t.Run("should refuse the reference tree and reveal nothing when the actor cannot read values", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := fixture.NewProject(t, h.NewTenant(t), fixture.WithProjectType("secret-manager"))
		describer := describeOnlyUser(t, proj, "describer")
		secretmanager.CreateSecret(t, proj, "dev", "HOST", "db-host")
		secretmanager.CreateSecret(t, proj, "dev", "URL", "${HOST}")

		// Action
		res, err := describer.API.GetSecretReferenceTreeV4WithResponse(t.Context(), "URL",
			&api.GetSecretReferenceTreeV4Params{ProjectId: proj.ID, Environment: "dev"})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t,
			"Unable to get secret reference tree for secret with key 'URL', because you don't have permission to view secret value.",
			res.JSON403.Message)
		require.NotContains(t, string(res.Body), "db-host")
	})

	t.Run("should list the secrets that reference a secret, locally, from another folder and through a chain", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateFolder(t, proj, "dev", "/app")
		secretmanager.CreateSecret(t, proj, "dev", "BASE", "value")
		secretmanager.CreateSecret(t, proj, "dev", "UNRELATED", "value")
		secretmanager.CreateSecret(t, proj, "dev", "LOCAL", "${BASE}")
		secretmanager.CreateSecret(t, proj, "dev", "CHAINED", "${LOCAL}")
		secretmanager.CreateSecret(t, proj, "dev", "NESTED", "${dev.BASE}", secretmanager.WithPath("/app"))

		// Action
		res, err := tn.Admin.API.GetSecretReferencesV4WithResponse(t.Context(), "BASE",
			&api.GetSecretReferencesV4Params{ProjectId: proj.ID, Environment: "dev"})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "reading dependents returned %s", apierr.Body(res.Body))
		tree := decodeReferenceTree(t, res.Body)
		require.ElementsMatch(t, []string{"dev:/:LOCAL", "dev:/app:NESTED"}, childLocations(tree))
		for _, child := range tree.Children {
			if child.Key == "LOCAL" {
				require.Equal(t, []string{"dev:/:CHAINED"}, childLocations(child))
			}
		}
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
	secretmanager.GrantFolderAccess(t, proj, reader, secretmanager.Location{Env: "dev", Path: folderPath},
		secretmanager.FolderRead)
	return reader
}
