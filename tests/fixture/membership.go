package fixture

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type Membership struct {
	ID       uuid.UUID
	UserID   uuid.UUID
	Status   string
	IsActive bool
	Role     string
}

// MembershipOf is the org membership for an email, as the admin sees it, or nil when
// there is none.
func MembershipOf(tt *testing.T, tn *harness.Tenant, email string) *Membership {
	tt.Helper()
	res, err := tn.Admin.API.ListOrgMembershipsWithResponse(tt.Context(), tn.OrgID.String())
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "listing memberships: %s", apierr.Body(res.Body))
	for _, m := range res.JSON200.Users {
		if m.User.Email == nil || !strings.EqualFold(*m.User.Email, email) {
			continue
		}
		out := &Membership{ID: m.Id, UserID: m.User.Id, Role: m.Role}
		if m.Status != nil {
			out.Status = *m.Status
		}
		if m.IsActive != nil {
			out.IsActive = *m.IsActive
		}
		return out
	}
	return nil
}
