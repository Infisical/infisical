package applications_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

const (
	notAMember  = "You are not a member of this certificate-application."
	cannotIssue = "You are not allowed to issue-cert on certificate-profiles"
)

// member is a new Product Member with a role on the graph's application, or on none
// when role is empty.
func member(t *testing.T, g *pki.Graph, role string) *harness.Principal {
	t.Helper()
	return pki.NewMember(t, g.App, role+"-"+id.Short(), role)
}

// operatorIdentity is a new machine identity, a Product Member, that is an operator of
// the graph's application.
func operatorIdentity(t *testing.T, tn *harness.Tenant, g *pki.Graph) *harness.Principal {
	t.Helper()
	mi := tn.NewMachineIdentity(t)
	g.Project.Grant(t, mi)
	pki.AddMember(t, g.App, mi, "operator")
	return mi
}

// operatorGroupMember is a new user who is an operator of the graph's application only
// through a group, and the group's id.
func operatorGroupMember(t *testing.T, tn *harness.Tenant, g *pki.Graph) (*harness.Principal, uuid.UUID) {
	t.Helper()
	user := member(t, g, "")
	group := fixture.NewGroup(t, tn)
	group.AddUser(t, user)
	fixture.ExistingProject(tn, g.Project.ID.String()).GrantGroup(t, group, "member")
	add, err := tn.Admin.API.AddPkiApplicationGroupMemberWithResponse(t.Context(), g.App.ID, group.ID, api.AddPkiApplicationGroupMemberJSONRequestBody{Role: "operator"})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, add.StatusCode(), "adding the group: %s", apierr.Body(add.Body))
	return user, group.ID
}

// requireIssueRefused requires the principal's request through the graph to be
// refused with the message and nothing to be issued.
func requireIssueRefused(t *testing.T, g *pki.Graph, as *harness.Principal, message string) {
	t.Helper()
	res := pki.Request(t, as, g.App, g.Profile, pki.ServerCertificate(id.Short()+".app.test"))
	require.Equalf(t, http.StatusForbidden, res.StatusCode(), "answered: %s", apierr.Body(res.Body))
	require.Equal(t, message, apierr.Message(res.Body))
	require.Zero(t, pki.Requests(t, g.Project, g.Profile))
}

type applicationFields struct {
	Name        string
	Description *string
}

// readApplication reads the application's editable fields as the tenant admin.
func readApplication(t *testing.T, tn *harness.Tenant, app pki.Application) applicationFields {
	t.Helper()
	res, err := tn.Admin.API.GetPkiApplicationWithResponse(t.Context(), app.ID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading the application returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return applicationFields{Name: res.JSON200.Application.Name, Description: res.JSON200.Application.Description}
}

// applicationIDs lists the organization's applications as the tenant admin.
func applicationIDs(t *testing.T, tn *harness.Tenant) []uuid.UUID {
	t.Helper()
	res, err := tn.Admin.API.ListPkiApplicationsWithResponse(t.Context(), nil)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing applications returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	out := []uuid.UUID{}
	for _, a := range res.JSON200.Applications {
		out = append(out, a.Id)
	}
	return out
}
