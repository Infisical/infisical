package organization_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/internal/spec"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

func TestRateLimit_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should answer 429 with the retry message past the plan's read limit", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.ReadRateLimit, 3)))
		caller := tn.Client(t, tn.Admin.Token, infisical.ForwardedFor(sourceIP()))
		require.Equal(t, []int{200, 200, 200}, readOrg(t, tn, caller, 3))

		// Action
		res, err := caller.GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusTooManyRequests, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Rate limit exceeded. Please try again in")
	})

	t.Run("should apply a raised plan limit", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Counted from a fresh address after the raise, so the result cannot come
			from the old bucket expiring.`)

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.ReadRateLimit, 2)))
		before := tn.Client(t, tn.Admin.Token, infisical.ForwardedFor(sourceIP()))
		require.Equal(t, []int{200, 200, 429}, readOrg(t, tn, before, 3))

		// Action
		tn.SetPlan(t, license.Enterprise().With(license.ReadRateLimit, 5))

		// Assert
		after := tn.Client(t, tn.Admin.Token, infisical.ForwardedFor(sourceIP()))
		require.Equal(t, []int{200, 200, 200, 200, 200, 429}, readOrg(t, tn, after, 6))
	})

	t.Run("should leave other source IPs unaffected", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.ReadRateLimit, 2)))
		exhausted := tn.Client(t, tn.Admin.Token, infisical.ForwardedFor(sourceIP()))
		require.Equal(t, []int{200, 200, 429}, readOrg(t, tn, exhausted, 3))
		other := tn.Client(t, tn.Admin.Token, infisical.ForwardedFor(sourceIP()))

		// Action
		res, err := other.GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	})
}

func TestRateLimit_InviteMail(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should limit invite mail sends and send no extra mail", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		caller := tn.Client(t, tn.Admin.Token, infisical.ForwardedFor(sourceIP()))
		first, second, third := tn.Email("first"), tn.Email("second"), tn.Email("third")
		for _, addr := range []string{first, second} {
			res := inviteWith(t, tn, caller, addr)
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		}

		// Action
		res := inviteWith(t, tn, caller, third)

		// Assert
		requireStatus(t, http.StatusTooManyRequests, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Rate limit exceeded")
		inbox := tn.Mail(t)
		inbox.Expect(t, first, smtp.Subject("invitation"))
		inbox.Expect(t, second, smtp.Subject("invitation"))
		inbox.ExpectNoEvent[smtp.MessageReceived](t, func(e smtp.MessageReceived) bool { return e.Recipient == third })
		require.Nil(t, fixture.MembershipOf(t, tn, third))
	})
}

// readOrg reads the org n times and returns each status.
func readOrg(t *testing.T, tn *harness.Tenant, c *api.ClientWithResponses, n int) []int {
	t.Helper()
	out := make([]int, 0, n)
	for range n {
		res, err := c.GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())
		require.NoError(t, err)
		out = append(out, res.StatusCode())
	}
	return out
}

func inviteWith(t *testing.T, tn *harness.Tenant, c *api.ClientWithResponses, addr string) *api.InviteUsersToOrganizationResponse {
	t.Helper()
	res, err := c.InviteUsersToOrganizationWithResponse(t.Context(), api.InviteUsersToOrganizationJSONRequestBody{
		InviteeEmails:        []openapi_types.Email{openapi_types.Email(addr)},
		OrganizationId:       tn.OrgID.String(),
		OrganizationRoleSlug: new("member"),
	})
	require.NoError(t, err)
	return res
}
