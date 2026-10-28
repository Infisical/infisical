package sharing_test

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
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestProjectFolderGrant_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a grant while the organization has not turned sharing on", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		target := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res := createGrant(t, tn.Admin, source, target, sourceRoot)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, sharingOff, res.JSON403.Message)
		secretmanager.AllowCrossProjectSharing(t, tn, true)
		require.Empty(t, givenGrants(t, source))
	})

	t.Run("should refuse a grant with the same message when the plan does not include sharing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		tn.SetPlan(t, license.Enterprise().Without(license.CrossProjectSecretSharing))

		// Action
		res := createGrant(t, tn.Admin, source, target, sourceRoot)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, sharingOff, res.JSON403.Message, "today the message names neither the plan nor the organization setting")
		require.Empty(t, givenGrants(t, source))
	})

	t.Run("should refuse a second grant of the same folder to the same project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		first := secretmanager.GrantFolder(t, source, target, sourceRoot)

		// Action
		res := createGrant(t, tn.Admin, source, target, sourceRoot)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "A grant already exists for this folder and target project", res.JSON400.Message)
		require.Equal(t, []string{first}, givenGrants(t, source))
	})

	t.Run("should refuse a grant whose target is the source project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, _ := sharingProjects(t, tn)

		// Action
		res := createGrant(t, tn.Admin, source, source, sourceRoot)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Source and target project cannot be the same", res.JSON400.Message)
		require.Empty(t, givenGrants(t, source))
	})

	t.Run("should refuse a grant to another organization's project without revealing it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, _ := sharingProjects(t, tn)
		other := h.NewTenant(t)
		foreign := fixture.NewProject(t, other, fixture.WithProjectType("secret-manager"))
		secretmanager.AllowCrossProjectSharing(t, other, true)

		// Action
		res := createGrant(t, tn.Admin, source, foreign, sourceRoot)

		// Assert
		require.Truef(t, res.StatusCode() >= http.StatusBadRequest && res.StatusCode() < http.StatusInternalServerError,
			"granting to another organization's project returned %d, not a refusal: %s", res.StatusCode(), apierr.Body(res.Body))
		require.NotContains(t, string(res.Body), foreign.Name)
		require.NotContains(t, string(res.Body), foreign.Slug)
		require.Empty(t, givenGrants(t, source))
		require.Empty(t, receivedGrants(t, foreign))
	})

	t.Run("should answer not found naming the path when the folder does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)

		// Action
		res := createGrant(t, tn.Admin, source, target, secretmanager.Location{Env: "dev", Path: "/nope"})

		// Assert
		require.Equal(t, http.StatusNotFound, res.StatusCode())
		require.Equal(t, "Folder not found at path '/nope' in environment 'dev'", res.JSON404.Message)
		require.Empty(t, givenGrants(t, source))
	})

	t.Run("should refuse a grant to a role without create-grant", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		member := source.NewMachineIdentity(t, fixture.WithRoles("member"))

		// Action
		res := createGrant(t, member, source, target, sourceRoot)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to create-grant on project-folder-grant", res.JSON403.Message)
		require.Empty(t, givenGrants(t, source))
	})
}

func TestProjectFolderGrant_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list a grant as given by the source and as received by the target", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		secretmanager.CreateFolder(t, source, "prod", "/shared")
		secretmanager.CreateSecret(t, source, "prod", "ONE", "1", secretmanager.WithPath("/shared"))

		// Action
		grantID := secretmanager.GrantFolder(t, source, target, secretmanager.Location{Env: "prod", Path: "/shared"})

		// Assert
		given, err := tn.Admin.API.ListProjectFolderGrantsWithResponse(t.Context(),
			&api.ListProjectFolderGrantsParams{SourceProjectId: source.ID})
		require.NoError(t, err)
		require.NotNilf(t, given.JSON200, "listing given grants returned %d: %s", given.StatusCode(), apierr.Body(given.Body))
		require.Len(t, given.JSON200.Grants, 1)
		g := given.JSON200.Grants[0]
		require.Equal(t, []any{grantID, target.ID, target.Name, "prod", "/shared", "shared", float32(1)},
			[]any{g.Id.String(), g.TargetProjectId, g.TargetProjectName, g.EnvironmentSlug, g.SecretPath, g.FolderName, g.SecretCount})

		received, err := tn.Admin.API.ListReceivedProjectFolderGrantsWithResponse(t.Context(),
			&api.ListReceivedProjectFolderGrantsParams{TargetProjectId: target.ID})
		require.NoError(t, err)
		require.NotNilf(t, received.JSON200, "listing received grants returned %d: %s", received.StatusCode(), apierr.Body(received.Body))
		require.Len(t, received.JSON200.Grants, 1)
		r := received.JSON200.Grants[0]
		require.Equal(t, []any{grantID, source.ID, source.Slug, "prod", "/shared"},
			[]any{r.Id.String(), r.SourceProjectId, r.SourceProjectSlug, r.EnvironmentSlug, r.SecretPath})
	})

	t.Run("should count the target's imports and references that read the granted folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		grantID := secretmanager.GrantFolder(t, source, target, sourceRoot)
		secretmanager.CreateImport(t, target, "dev", sourceRoot, secretmanager.FromProject(source))
		secretmanager.CreateSecret(t, target, "staging", "REF", fmt.Sprintf("${@%s.dev.SHARED}", source.Slug))

		// Action
		res, err := tn.Admin.API.GetProjectFolderGrantUsageWithResponse(t.Context(), uuid.MustParse(grantID),
			&api.GetProjectFolderGrantUsageParams{SourceProjectId: source.ID})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading usage returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, float32(1), res.JSON200.ImportCount)
		require.Equal(t, float32(1), res.JSON200.ReferenceCount)
	})
}

func TestProjectFolderGrant_Revoke(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should stop resolving a reference into the folder as soon as the grant is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		grantID := secretmanager.GrantFolder(t, source, target, sourceRoot)
		ref := fmt.Sprintf("${@%s.dev.SHARED}", source.Slug)
		secretmanager.CreateSecret(t, target, "dev", "REF", ref)
		require.Equal(t, "from-source", secretmanager.GetSecret(t, target, "dev", "REF").Value)

		// Action
		res := revokeGrant(t, tn.Admin, source, grantID)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "revoking returned %s", apierr.Body(res.Body))
		require.Equal(t, ref, secretmanager.GetSecret(t, target, "dev", "REF").Value)
		require.Empty(t, givenGrants(t, source))
	})

	t.Run("should refuse a revoke to a role without revoke-grant and keep the grant", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		grantID := secretmanager.GrantFolder(t, source, target, sourceRoot)
		member := source.NewMachineIdentity(t, fixture.WithRoles("member"))

		// Action
		res := revokeGrant(t, member, source, grantID)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to revoke-grant on project-folder-grant", res.JSON403.Message)
		require.Equal(t, []string{grantID}, givenGrants(t, source))
	})

	t.Run("should list no grants and refuse a revoke while the organization has sharing off, and keep the grant", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := sharingProjects(t, tn)
		grantID := secretmanager.GrantFolder(t, source, target, sourceRoot)
		secretmanager.AllowCrossProjectSharing(t, tn, false)

		// Action
		res := revokeGrant(t, tn.Admin, source, grantID)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode(), "[LICENSE] today revoke is gated on the organization setting")
		require.Equal(t, sharingOff, res.JSON403.Message)
		require.Empty(t, givenGrants(t, source), "[LICENSE] today the list is empty while the setting is off")
		require.Empty(t, receivedGrants(t, target))
		secretmanager.AllowCrossProjectSharing(t, tn, true)
		require.Equal(t, []string{grantID}, givenGrants(t, source))
	})
}
