package fixture

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// SubOrg is a sub-organization of a tenant. Admin is the tenant's admin, who created it
// and so is its admin, holding a session scoped to it.
type SubOrg struct {
	ID    uuid.UUID
	Name  string
	Slug  string
	Admin *harness.Principal

	tn *harness.Tenant
}

// NewSubOrg creates a sub-organization under the tenant's root organization.
func NewSubOrg(tt *testing.T, tn *harness.Tenant) *SubOrg {
	tt.Helper()

	name := "sub-" + id.Short()
	res, err := tn.Admin.API.CreateSubOrganizationWithResponse(tt.Context(), api.CreateSubOrganizationJSONRequestBody{Name: name})
	require.NoErrorf(tt, err, "creating sub-organization %s", name)
	require.NotNilf(tt, res.JSON200, "creating sub-organization %s returned %d: %s", name, res.StatusCode(), apierr.Body(res.Body))

	org := res.JSON200.Organization
	sub := &SubOrg{ID: org.Id, Name: org.Name, Slug: org.Slug, tn: tn}
	sub.Admin = sub.Scope(tt, tn.Admin)
	return sub
}

func (s *SubOrg) Tenant() *harness.Tenant { return s.tn }

// Scope returns a user with a session selected into this sub-organization. The user
// must already be able to reach it.
func (s *SubOrg) Scope(tt *testing.T, user *harness.Principal) *harness.Principal {
	tt.Helper()
	require.Equalf(tt, harness.User, user.Kind, "%s is not a user; machine identities log into a sub-org with organizationSlug", user.Name)

	res, err := user.API.SelectOrganizationV3WithResponse(tt.Context(),
		api.SelectOrganizationV3JSONRequestBody{OrganizationId: s.ID.String()})
	require.NoError(tt, err)
	require.NotNilf(tt, res.JSON200, "selecting sub-organization %s for %s returned %d: %s",
		s.Slug, user.Name, res.StatusCode(), apierr.Body(res.Body))

	token := res.JSON200.Token
	return &harness.Principal{
		Kind:  harness.User,
		ID:    user.ID,
		Name:  user.Name,
		Email: user.Email,
		Token: token,
		API:   s.tn.Client(tt, token),
	}
}
