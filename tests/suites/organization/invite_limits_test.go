package organization_test

import (
	"fmt"
	"net/http"
	"slices"
	"sync"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

// freeSeats is the free plan with the identity limit the published free tier has.
func freeSeats(n int) license.Plan { return license.Free.With(license.MaxIdentityLimit, n) }

func TestInvite_Limits(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse more than ten new people in one invite and mail none of them", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		addrs := addresses(tn, "crowd", 11)

		// Action
		res := invite(t, tn, tn.Admin, "member", addrs...)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "You can invite up to 10 new members at a time")
		requireNotInvited(t, tn, addrs)
	})

	t.Run("should accept an invite naming more than ten people when at most ten are new", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		existing := addresses(tn, "existing", 2)
		requireStatus(t, http.StatusOK, invite(t, tn, tn.Admin, "member", existing...).StatusCode(), nil)
		newcomers := addresses(tn, "newcomer", 9)

		// Action
		res := invite(t, tn, tn.Admin, "member", append(newcomers, existing...)...)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		for _, addr := range newcomers {
			require.NotNil(t, fixture.MembershipOf(t, tn, addr), addr)
		}
	})

	t.Run("should add more than ten existing org members to a project in one request", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		members := addresses(tn, "member", 11)
		requireStatus(t, http.StatusOK, invite(t, tn, tn.Admin, "member", members[:10]...).StatusCode(), nil)
		requireStatus(t, http.StatusOK, invite(t, tn, tn.Admin, "member", members[10:]...).StatusCode(), nil)

		// Action
		res, err := fresh(t, tn, tn.Admin).InviteProjectMembersWithResponse(t.Context(), proj.ID,
			api.InviteProjectMembersJSONRequestBody{Emails: emailList(members)})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Subset(t, projectMemberEmails(t, tn, proj), members)
	})

	t.Run("should refuse an invite past a free org's identity limit, counting pending invitations", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(freeSeats(5)))
		requireStatus(t, http.StatusOK, invite(t, tn, tn.Admin, "member", addresses(tn, "pending", 4)...).StatusCode(), nil)
		addr := tn.Email("sixth")

		// Action
		res := invite(t, tn, tn.Admin, "member", addr)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "pending invitations count toward that. This organization has none left")
		requireNotInvited(t, tn, []string{addr})
	})

	t.Run("should count machine identities against a free org's identity limit", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(freeSeats(5)))
		tn.NewMachineIdentity(t)
		addrs := addresses(tn, "over", 4)

		// Action
		res := invite(t, tn, tn.Admin, "member", addrs...)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "This organization has 3 left")
		requireNotInvited(t, tn, addrs)
	})

	t.Run("should free a seat on a free org when a pending invitation is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(freeSeats(5)))
		pending := addresses(tn, "pending", 4)
		requireStatus(t, http.StatusOK, invite(t, tn, tn.Admin, "member", pending...).StatusCode(), nil)
		revoke(t, tn, pending[0])
		addr := tn.Email("replacement")

		// Action
		res := invite(t, tn, tn.Admin, "member", addr)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.NotNil(t, fixture.MembershipOf(t, tn, addr))
	})

	t.Run("should not count pending invitations against a paid plan's identity limit", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.SeatLimited(5)))
		addrs := addresses(tn, "paid", 6)

		// Action
		res := invite(t, tn, tn.Admin, "member", addrs...)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		for _, addr := range addrs {
			require.NotNil(t, fixture.MembershipOf(t, tn, addr), addr)
		}
	})

	t.Run("should keep a free org within its identity limit when invites arrive at once", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(freeSeats(5)))
		addrs := addresses(tn, "racer", 6)
		clients := make([]*api.ClientWithResponses, len(addrs))
		for i := range clients {
			clients[i] = fresh(t, tn, tn.Admin)
		}
		codes := make([]int, len(addrs))

		// Action
		var wg sync.WaitGroup
		for i, addr := range addrs {
			wg.Go(func() {
				res, err := clients[i].InviteUsersToOrganizationWithResponse(t.Context(), api.InviteUsersToOrganizationJSONRequestBody{
					InviteeEmails:        []openapi_types.Email{openapi_types.Email(addr)},
					OrganizationId:       tn.OrgID.String(),
					OrganizationRoleSlug: new("member"),
				})
				if err == nil {
					codes[i] = res.StatusCode()
				}
			})
		}
		wg.Wait()

		// Assert
		invited := 0
		for _, addr := range addrs {
			if fixture.MembershipOf(t, tn, addr) != nil {
				invited++
			}
		}
		require.Equal(t, 4, invited, "statuses %v", codes)
		require.Equal(t, 4, countOf(codes, http.StatusOK), "statuses %v", codes)
	})

	t.Run("should refuse a free org's invites past fifty a day and mail nobody", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Free))
		for batch := range 5 {
			res := invite(t, tn, tn.Admin, "member", addresses(tn, fmt.Sprintf("day%d", batch), 10)...)
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		}
		addr := tn.Email("fifty-first")

		// Action
		res := invite(t, tn, tn.Admin, "member", addr)

		// Assert
		requireStatus(t, http.StatusTooManyRequests, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "can send up to 50 invitations per day")
		requireNotInvited(t, tn, []string{addr})
	})

	t.Run("should count a resent invitation against a free org's daily limit", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Free))
		first := addresses(tn, "first", 10)
		requireStatus(t, http.StatusOK, invite(t, tn, tn.Admin, "member", first...).StatusCode(), nil)
		for batch := range 4 {
			n := 10
			if batch == 3 {
				n = 9
			}
			res := invite(t, tn, tn.Admin, "member", addresses(tn, fmt.Sprintf("more%d", batch), n)...)
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		}
		resend(t, tn, first[0])
		addr := tn.Email("after-resend")

		// Action
		res := invite(t, tn, tn.Admin, "member", addr)

		// Assert
		requireStatus(t, http.StatusTooManyRequests, res.StatusCode(), res.Body)
		requireNotInvited(t, tn, []string{addr})
	})

	t.Run("should not limit invites per day on a paid plan", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		for batch := range 5 {
			res := invite(t, tn, tn.Admin, "member", addresses(tn, fmt.Sprintf("paid%d", batch), 10)...)
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		}
		addr := tn.Email("fifty-first")

		// Action
		res := invite(t, tn, tn.Admin, "member", addr)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.NotNil(t, fixture.MembershipOf(t, tn, addr))
	})
}

func addresses(tn *harness.Tenant, prefix string, n int) []string {
	out := make([]string, n)
	for i := range out {
		out[i] = tn.Email(fmt.Sprintf("%s-%d", prefix, i))
	}
	return out
}

func emailList(addrs []string) *[]openapi_types.Email {
	out := make([]openapi_types.Email, len(addrs))
	for i, a := range addrs {
		out[i] = openapi_types.Email(a)
	}
	return &out
}

func countOf(codes []int, want int) int {
	n := 0
	for _, c := range codes {
		if c == want {
			n++
		}
	}
	return n
}

// requireNotInvited checks a refused invite changed nothing: no membership and no mail.
func requireNotInvited(t *testing.T, tn *harness.Tenant, addrs []string) {
	t.Helper()
	for _, addr := range addrs {
		require.Nil(t, fixture.MembershipOf(t, tn, addr), addr)
	}
	tn.Mail(t).ExpectNoEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool {
		return slices.Contains(addrs, e.Recipient)
	})
}

func revoke(t *testing.T, tn *harness.Tenant, addr string) {
	t.Helper()
	m := fixture.MembershipOf(t, tn, addr)
	require.NotNil(t, m, addr)
	res, err := tn.Admin.API.DeleteOrgMembershipWithResponse(t.Context(), tn.OrgID.String(), m.ID.String())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
}

func resend(t *testing.T, tn *harness.Tenant, addr string) {
	t.Helper()
	m := fixture.MembershipOf(t, tn, addr)
	require.NotNil(t, m, addr)
	res, err := fresh(t, tn, tn.Admin).ResendOrganizationMemberInvitationWithResponse(t.Context(),
		api.ResendOrganizationMemberInvitationJSONRequestBody{MembershipId: m.ID.String()})
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
}
