package syncs_test

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestSecretSync_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse and keep the first when the same name is created twice in a project", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)
		newSync(t, proj, conn, repoScope("acme", "app"), withName("billing"))

		// Action
		res := createSync(t, proj, conn, repoScope("acme", "other"), withName("billing"))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			fmt.Sprintf(`A Secret Sync with the name "billing" already exists for the project with ID "%s"`, proj.ID),
			message(res.Body))
		require.Equal(t, []string{"billing"}, listSyncNames(t, proj.Tenant().Admin.API, proj))
	})

	t.Run("should refuse and create nothing when the source folder does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)

		// Action
		res := createSync(t, proj, conn, repoScope("acme", "app"), fromPath("/does/not/exist"))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, message(res.Body), `Could not find folder with path "/does/not/exist" in environment "dev"`)
		require.Empty(t, listSyncNames(t, proj.Tenant().Admin.API, proj))
	})

	t.Run("should refuse and create nothing when the connection is for another app", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		conn := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)
		body := api.CreateAwsParameterStoreSecretSyncJSONRequestBody{
			Name:         "aws-with-github",
			ProjectId:    proj.ID,
			ConnectionId: conn.ID,
			Environment:  "dev",
			SecretPath:   "/",
		}
		body.DestinationConfig.Region = "us-east-1"
		body.DestinationConfig.Path = "/app/"
		body.SyncOptions.InitialSyncBehavior = "overwrite-destination"

		// Action
		res, err := tn.Admin.API.CreateAwsParameterStoreSecretSyncWithResponse(t.Context(), body)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t,
			fmt.Sprintf("GitHub Connection with ID %s cannot be used to connect to AWS", conn.ID),
			message(res.Body))
		list, err := tn.Admin.API.ListAwsParameterStoreSecretSyncsWithResponse(t.Context(),
			&api.ListAwsParameterStoreSecretSyncsParams{ProjectId: proj.ID})
		require.NoError(t, err)
		require.NotNilf(t, list.JSON200, "listing returned %d: %s", list.StatusCode(), apierr.Body(list.Body))
		require.Empty(t, list.JSON200.SecretSyncs)
	})

	t.Run("should refuse and create nothing when the connection belongs to another tenant", func(t *testing.T) {
		t.Parallel()

		// Setup
		mine, theirs := h.NewTenant(t), h.NewTenant(t)
		proj := fixture.NewProject(t, mine, fixture.WithProjectType("secret-manager"))
		foreign := fixture.NewAppConnection(t, theirs, fixture.GitHubPATAppConnection)

		// Action
		res := createSync(t, proj, foreign, repoScope("acme", "app"))

		// Assert
		require.NotEqual(t, http.StatusOK, res.StatusCode(), "a sync was created over another tenant's connection")
		require.NotContains(t, string(res.Body), foreign.Name, "the refusal revealed the other tenant's connection")
		require.Empty(t, listSyncNames(t, mine.Admin.API, proj))
	})

	t.Run("should refuse and create nothing when the key schema has no secret key placeholder", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)

		// Action
		res := createSync(t, proj, conn, repoScope("acme", "app"), keySchema("INFISICAL_"))

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
		require.Contains(t, message(res.Body), "Key schema must include exactly one {{secretKey}} placeholder")
		require.Empty(t, listSyncNames(t, proj.Tenant().Admin.API, proj))
	})

	t.Run("should refuse and create nothing when the key schema has a character outside the allowed set", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj, conn, _ := setup(t)

		// Action
		res := createSync(t, proj, conn, repoScope("acme", "app"), keySchema("INFISICAL.{{secretKey}}"))

		// Assert
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
		require.Contains(t, message(res.Body), "Only alphanumeric characters (a-z, A-Z, 0-9), dashes (-), underscores (_), and slashes (/) are allowed")
		require.Empty(t, listSyncNames(t, proj.Tenant().Admin.API, proj))
	})

	t.Run("should accept a key schema holding the secret key placeholder twice although the rule says exactly one", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] The validation message promises "exactly one {{secretKey}}", but the
			check only tests that one is present. Pinned as today's behaviour so the fix
			updates this claim.`)

		// Setup
		proj, conn, _ := setup(t)

		// Action
		res := createSync(t, proj, conn, repoScope("acme", "app"), keySchema("{{secretKey}}_{{secretKey}}"))

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "creating returned %s", apierr.Body(res.Body))
		require.Equal(t, "{{secretKey}}_{{secretKey}}", *res.JSON200.SecretSync.SyncOptions.KeySchema)
	})

	t.Run("should refuse and create nothing when subfolders are combined with an import on the first sync", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `GitHub cannot import at all, so the rule is reached through a destination
			that can. The body is refused before the connection is looked at.`)

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		conn := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)
		raw, err := json.Marshal(map[string]any{
			"name":              "recursive-import",
			"projectId":         proj.ID,
			"connectionId":      conn.ID,
			"environment":       "dev",
			"secretPath":        "/",
			"destinationConfig": map[string]any{"region": "us-east-1", "path": "/app/"},
			"syncOptions": map[string]any{
				"initialSyncBehavior":  "import-prioritize-source",
				"includeAllSubFolders": true,
			},
		})
		require.NoError(t, err)

		// Action
		res, err := tn.Admin.API.CreateAwsParameterStoreSecretSyncWithBodyWithResponse(t.Context(),
			"application/json", bytes.NewReader(raw))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusUnprocessableEntity, res.StatusCode())
		require.Contains(t, message(res.Body), "A sync that includes subfolders cannot also import existing secrets from the destination")
		list, err := tn.Admin.API.ListAwsParameterStoreSecretSyncsWithResponse(t.Context(),
			&api.ListAwsParameterStoreSecretSyncsParams{ProjectId: proj.ID})
		require.NoError(t, err)
		require.NotNilf(t, list.JSON200, "listing returned %d: %s", list.StatusCode(), apierr.Body(list.Body))
		require.Empty(t, list.JSON200.SecretSyncs)
	})

	t.Run("should refuse a second sync to the same repository when the organization blocks duplicate destinations", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		first := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		second := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		conn := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)
		blockDuplicateDestinations(t, tn)
		newSync(t, first, conn, repoScope("acme", "app"))

		// Action
		res := createSync(t, second, conn, repoScope("acme", "app"))

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, fmt.Sprintf("A secret sync with this destination already exists in project %s.", first.ID), message(res.Body))
		require.Empty(t, listSyncNames(t, tn.Admin.API, second))
	})

	t.Run("should report a duplicate from check-destination when another project already syncs to the repository", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		first := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		second := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		conn := fixture.NewAppConnection(t, tn, fixture.GitHubPATAppConnection)
		blockDuplicateDestinations(t, tn)
		newSync(t, first, conn, repoScope("acme", "app"))

		// Action
		res, err := tn.Admin.API.CheckGitHubSecretSyncDestinationWithResponse(t.Context(),
			api.CheckGitHubSecretSyncDestinationJSONRequestBody{
				ProjectId:         second.ID,
				ConnectionId:      &conn.ID,
				DestinationConfig: map[string]any{"scope": "repository", "owner": "acme", "repo": "app"},
			})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "checking returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.True(t, res.JSON200.HasDuplicate)
		require.NotNil(t, res.JSON200.DuplicateProjectId)
		require.Equal(t, first.ID, *res.JSON200.DuplicateProjectId)
	})
}

func blockDuplicateDestinations(tt *testing.T, tn *harness.Tenant) {
	tt.Helper()
	res, err := tn.Admin.API.UpdateOrganizationWithResponse(tt.Context(), tn.OrgID.String(),
		api.UpdateOrganizationJSONRequestBody{BlockDuplicateSecretSyncDestinations: new(true)})
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "blocking duplicate destinations returned %s", apierr.Body(res.Body))
}
