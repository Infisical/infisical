package auditlog_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestAuditLog_Access(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a member without audit-log read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fixture.NewOrgRole(t, tn, "no-audit", fixture.Permission{Subject: "settings", Action: []string{"read"}})
		member := tn.NewMachineIdentity(t, harness.OrgRole("no-audit"))
		groupID := createGroup(t, tn.Admin, "g-"+id.Short())
		waitForEvents(t, tn.Admin, filter{EventType: new("create-group")}, 1)

		// Action
		res, _, err := listLogs(t.Context(), member.API, filter{EventType: new("create-group")})

		// Assert
		require.Error(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.NotContains(t, string(res.Body), groupID)
	})

	t.Run("should never return another org's events, even when given that org's project id", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)
		theirs := fixture.NewProject(t, other, fixture.WithProjectType("secret-manager"))
		secretmanager.CreateSecret(t, theirs, "dev", "THEIRS", "v")
		waitForEvents(t, other.Admin, filter{EventType: new("create-secret"), ProjectId: &theirs.ID}, 1)

		// Action
		byProject, _, byProjectErr := listLogs(t.Context(), tn.Admin.API, filter{EventType: new("create-secret"), ProjectId: &theirs.ID})
		orgWide := events(t, tn.Admin, filter{EventType: new("create-secret")})

		// Assert
		require.Error(t, byProjectErr)
		require.Equalf(t, http.StatusForbidden, byProject.StatusCode(), "%s", apierr.Body(byProject.Body))
		require.Equal(t, "This project does not belong to your selected organization.", apierr.Message(byProject.Body))
		require.NotContains(t, string(byProject.Body), "THEIRS")
		require.Empty(t, orgWide)
	})

	t.Run("should refuse a project-scoped read without project audit-log read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		proj.NewRole(t, "secret-reader", fixture.Permission{Subject: "secrets", Action: []string{"read"}})
		reader := tn.NewMachineIdentity(t, harness.OrgRole("member"))
		proj.Grant(t, reader, "secret-reader")
		secretmanager.CreateSecret(t, proj, "dev", "TOKEN", "v")
		waitForEvents(t, tn.Admin, filter{EventType: new("create-secret"), ProjectId: &proj.ID}, 1)

		// Action
		res, _, err := listLogs(t.Context(), reader.API, filter{EventType: new("create-secret"), ProjectId: &proj.ID})

		// Assert
		require.Error(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.NotContains(t, string(res.Body), "TOKEN")
	})
}
