package signers_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// signerAccess is how one kind of member is added to, changed on and removed from a
// signer, with the principal that then signs through that membership.
type signerAccess struct {
	kind string
	// newMember makes a Product Member and returns the membership's actor id and the
	// principal that signs through it.
	newMember func(t *testing.T, tn *harness.Tenant) (uuid.UUID, *harness.Principal)
	add       func(t *testing.T, tn *harness.Tenant, signerID, actorID uuid.UUID, role string) *http.Response
	setRole   func(t *testing.T, tn *harness.Tenant, signerID, actorID uuid.UUID, role string) *http.Response
	remove    func(t *testing.T, tn *harness.Tenant, signerID, actorID uuid.UUID) *http.Response
	// roles lists each member's actor id and role.
	roles func(t *testing.T, tn *harness.Tenant, signerID uuid.UUID) map[uuid.UUID]string
}

var signerAccesses = []signerAccess{
	{
		kind: "user",
		newMember: func(t *testing.T, tn *harness.Tenant) (uuid.UUID, *harness.Principal) {
			u := tn.NewUser(t)
			pki.CertManager(t, tn).Grant(t, u)
			return u.ID, u
		},
		add: func(t *testing.T, tn *harness.Tenant, signerID, actorID uuid.UUID, role string) *http.Response {
			res, err := tn.Admin.API.AddSignerUserMembersWithResponse(t.Context(), signerID, api.AddSignerUserMembersJSONRequestBody{
				UserIds: &[]uuid.UUID{actorID},
				Role:    new(api.AddSignerUserMembersJSONBodyRole(role)),
			})
			require.NoError(t, err)
			return res.HTTPResponse
		},
		setRole: func(t *testing.T, tn *harness.Tenant, signerID, actorID uuid.UUID, role string) *http.Response {
			res, err := tn.Admin.API.UpdateSignerUserRoleWithResponse(t.Context(), signerID, actorID, api.UpdateSignerUserRoleJSONRequestBody{
				Role: api.UpdateSignerUserRoleJSONBodyRole(role),
			})
			require.NoError(t, err)
			return res.HTTPResponse
		},
		remove: func(t *testing.T, tn *harness.Tenant, signerID, actorID uuid.UUID) *http.Response {
			res, err := tn.Admin.API.RemoveSignerUserMemberWithResponse(t.Context(), signerID, actorID)
			require.NoError(t, err)
			return res.HTTPResponse
		},
		roles: func(t *testing.T, tn *harness.Tenant, signerID uuid.UUID) map[uuid.UUID]string {
			res, err := tn.Admin.API.ListSignerUserMembersWithResponse(t.Context(), signerID)
			require.NoError(t, err)
			require.NotNilf(t, res.JSON200, "listing user members returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
			out := map[uuid.UUID]string{}
			for _, m := range res.JSON200.Memberships {
				if m.ActorUserId != nil {
					out[*m.ActorUserId] = m.Role
				}
			}
			return out
		},
	},
	{
		kind: "machine identity",
		newMember: func(t *testing.T, tn *harness.Tenant) (uuid.UUID, *harness.Principal) {
			mi := tn.NewMachineIdentity(t)
			pki.CertManager(t, tn).Grant(t, mi)
			return mi.ID, mi
		},
		add: func(t *testing.T, tn *harness.Tenant, signerID, actorID uuid.UUID, role string) *http.Response {
			res, err := tn.Admin.API.AddSignerIdentityMemberWithResponse(t.Context(), signerID, api.AddSignerIdentityMemberJSONRequestBody{
				IdentityId: actorID,
				Role:       new(api.AddSignerIdentityMemberJSONBodyRole(role)),
			})
			require.NoError(t, err)
			return res.HTTPResponse
		},
		setRole: func(t *testing.T, tn *harness.Tenant, signerID, actorID uuid.UUID, role string) *http.Response {
			res, err := tn.Admin.API.UpdateSignerIdentityRoleWithResponse(t.Context(), signerID, actorID, api.UpdateSignerIdentityRoleJSONRequestBody{
				Role: api.UpdateSignerIdentityRoleJSONBodyRole(role),
			})
			require.NoError(t, err)
			return res.HTTPResponse
		},
		remove: func(t *testing.T, tn *harness.Tenant, signerID, actorID uuid.UUID) *http.Response {
			res, err := tn.Admin.API.RemoveSignerIdentityMemberWithResponse(t.Context(), signerID, actorID)
			require.NoError(t, err)
			return res.HTTPResponse
		},
		roles: func(t *testing.T, tn *harness.Tenant, signerID uuid.UUID) map[uuid.UUID]string {
			res, err := tn.Admin.API.ListSignerIdentityMembersWithResponse(t.Context(), signerID)
			require.NoError(t, err)
			require.NotNilf(t, res.JSON200, "listing identity members returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
			out := map[uuid.UUID]string{}
			for _, m := range res.JSON200.Memberships {
				if m.ActorIdentityId != nil {
					out[*m.ActorIdentityId] = m.Role
				}
			}
			return out
		},
	},
	{
		kind: "group",
		newMember: func(t *testing.T, tn *harness.Tenant) (uuid.UUID, *harness.Principal) {
			u := tn.NewUser(t)
			g := fixture.NewGroup(t, tn)
			g.AddUser(t, u)
			fixture.ExistingProject(tn, pki.CertManager(t, tn).ID.String()).GrantGroup(t, g, "member")
			return g.ID, u
		},
		add: func(t *testing.T, tn *harness.Tenant, signerID, actorID uuid.UUID, role string) *http.Response {
			res, err := tn.Admin.API.AddSignerGroupMemberWithResponse(t.Context(), signerID, api.AddSignerGroupMemberJSONRequestBody{
				GroupId: actorID,
				Role:    new(api.AddSignerGroupMemberJSONBodyRole(role)),
			})
			require.NoError(t, err)
			return res.HTTPResponse
		},
		setRole: func(t *testing.T, tn *harness.Tenant, signerID, actorID uuid.UUID, role string) *http.Response {
			res, err := tn.Admin.API.UpdateSignerGroupRoleWithResponse(t.Context(), signerID, actorID, api.UpdateSignerGroupRoleJSONRequestBody{
				Role: api.UpdateSignerGroupRoleJSONBodyRole(role),
			})
			require.NoError(t, err)
			return res.HTTPResponse
		},
		remove: func(t *testing.T, tn *harness.Tenant, signerID, actorID uuid.UUID) *http.Response {
			res, err := tn.Admin.API.RemoveSignerGroupMemberWithResponse(t.Context(), signerID, actorID)
			require.NoError(t, err)
			return res.HTTPResponse
		},
		roles: func(t *testing.T, tn *harness.Tenant, signerID uuid.UUID) map[uuid.UUID]string {
			res, err := tn.Admin.API.ListSignerGroupMembersWithResponse(t.Context(), signerID)
			require.NoError(t, err)
			require.NotNilf(t, res.JSON200, "listing group members returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
			out := map[uuid.UUID]string{}
			for _, m := range res.JSON200.Memberships {
				if m.ActorGroupId != nil {
					out[*m.ActorGroupId] = m.Role
				}
			}
			return out
		},
	},
}

// requireCannotSign checks a principal is refused signing with message.
func requireCannotSign(t *testing.T, as *harness.Principal, signerID uuid.UUID, message string) {
	t.Helper()
	res, _ := pki.Sign(t, as, signerID)
	require.Equal(t, http.StatusForbidden, res.StatusCode())
	require.Equal(t, message, apierr.Message(res.Body))
}

func TestSigner_Membership(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	for _, a := range signerAccesses {
		t.Run("should let a "+a.kind+" added as operator sign", func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			s := pki.NewSigner(t, pki.CertManager(t, tn))
			actorID, signer := a.newMember(t, tn)

			// Action
			res := a.add(t, tn, s.ID, actorID, "operator")

			// Assert
			require.Equal(t, http.StatusOK, res.StatusCode)
			require.Equal(t, "operator", a.roles(t, tn, s.ID)[actorID])
			requireSigns(t, tn, signer, s.ID)
		})

		t.Run("should stop a "+a.kind+" signing once its role changes to auditor", func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			s := pki.NewSigner(t, pki.CertManager(t, tn))
			actorID, signer := a.newMember(t, tn)
			require.Equal(t, http.StatusOK, a.add(t, tn, s.ID, actorID, "operator").StatusCode)

			// Action
			res := a.setRole(t, tn, s.ID, actorID, "auditor")

			// Assert
			require.Equal(t, http.StatusOK, res.StatusCode)
			require.Equal(t, "auditor", a.roles(t, tn, s.ID)[actorID])
			requireCannotSign(t, signer, s.ID, "You are not allowed to sign on pki-signer")
		})

		t.Run("should stop a removed "+a.kind+" signing and list it no more", func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			s := pki.NewSigner(t, pki.CertManager(t, tn))
			actorID, signer := a.newMember(t, tn)
			require.Equal(t, http.StatusOK, a.add(t, tn, s.ID, actorID, "operator").StatusCode)

			// Action
			res := a.remove(t, tn, s.ID, actorID)

			// Assert
			require.Equal(t, http.StatusOK, res.StatusCode)
			require.NotContains(t, a.roles(t, tn, s.ID), actorID)
			requireCannotSign(t, signer, s.ID, "You are not a member of this pki-signer.")
		})
	}
}
