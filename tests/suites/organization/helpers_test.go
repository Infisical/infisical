package organization_test

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/internal/apierr"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

// sourceIP is a fresh rate-limit bucket. Invites go through smtpRateLimit (two per
// forty seconds per address), so every invite a test sends needs its own.
func sourceIP() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return fmt.Sprintf("10.%d.%d.%d", b[0], b[1], b[2])
}

// fresh is p's client on a bucket nobody else is drawing down.
func fresh(t *testing.T, tn *harness.Tenant, p *harness.Principal) *api.ClientWithResponses {
	t.Helper()
	return tn.Client(t, p.Token, infisical.ForwardedFor(sourceIP()))
}

func requireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "answered %d: %s", got, apierr.Body(body))
}

type organization struct {
	Name                  string
	Slug                  string
	AuthEnforced          bool
	GoogleSsoAuthEnforced bool
	DefaultMembershipRole string
	SsoMfaTrust           string
}

func orgOf(t *testing.T, tn *harness.Tenant) organization {
	t.Helper()
	res, err := fresh(t, tn, tn.Admin).GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	o := res.JSON200.Organization
	return organization{
		Name:                  o.Name,
		Slug:                  o.Slug,
		AuthEnforced:          o.AuthEnforced != nil && *o.AuthEnforced,
		GoogleSsoAuthEnforced: o.GoogleSsoAuthEnforced != nil && *o.GoogleSsoAuthEnforced,
		DefaultMembershipRole: deref(o.DefaultMembershipRole),
		SsoMfaTrust:           deref(o.SsoMfaTrust),
	}
}

func membershipOf(t *testing.T, tn *harness.Tenant, p *harness.Principal) *fixture.Membership {
	t.Helper()
	m := fixture.MembershipOf(t, tn, p.Email)
	require.NotNilf(t, m, "%s has no org membership", p.Email)
	return m
}

func invite(t *testing.T, tn *harness.Tenant, actor *harness.Principal, role string, emails ...string) *api.InviteUsersToOrganizationResponse {
	t.Helper()
	addrs := make([]openapi_types.Email, len(emails))
	for i, e := range emails {
		addrs[i] = openapi_types.Email(e)
	}
	res, err := fresh(t, tn, actor).InviteUsersToOrganizationWithResponse(t.Context(), api.InviteUsersToOrganizationJSONRequestBody{
		InviteeEmails:        addrs,
		OrganizationId:       tn.OrgID.String(),
		OrganizationRoleSlug: &role,
	})
	require.NoError(t, err)
	return res
}

// customRoleUser is a user whose only org role is a new custom role with exactly the
// given rules.
func customRoleUser(t *testing.T, tn *harness.Tenant, slug string, perms ...fixture.Permission) *harness.Principal {
	t.Helper()
	fixture.NewOrgRole(t, tn, slug, perms...)
	return tn.NewUser(t, harness.OrgRole(slug))
}

func createOrgRole(t *testing.T, actor *api.ClientWithResponses, slug string, perms ...fixture.Permission) *api.CreateOrganizationRoleResponse {
	t.Helper()
	if perms == nil {
		perms = []fixture.Permission{}
	}
	body, err := json.Marshal(map[string]any{"slug": slug, "name": slug, "permissions": perms})
	require.NoError(t, err)
	res, err := actor.CreateOrganizationRoleWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(body))
	require.NoError(t, err)
	return res
}

func orgRoleSlugs(t *testing.T, tn *harness.Tenant) []string {
	t.Helper()
	res, err := fresh(t, tn, tn.Admin).ListOrganizationRolesWithResponse(t.Context())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	var slugs []string
	for _, r := range res.JSON200.Roles {
		slugs = append(slugs, r.Slug)
	}
	return slugs
}

// packedRules turns the CASL packed rules GET /organization/permissions returns into
// subject -> actions, for allow rules only.
func packedRules(t *testing.T, raw []any) map[string][]string {
	t.Helper()
	out := map[string][]string{}
	for _, r := range raw {
		rule, ok := r.([]any)
		require.Truef(t, ok, "rule %v is not packed", r)
		require.GreaterOrEqual(t, len(rule), 2)
		if len(rule) > 3 {
			if inverted, _ := rule[3].(float64); inverted == 1 {
				continue
			}
			if inverted, _ := rule[3].(bool); inverted {
				continue
			}
		}
		actions, _ := rule[0].(string)
		subjects, _ := rule[1].(string)
		for _, s := range strings.Split(subjects, ",") {
			out[s] = append(out[s], strings.Split(actions, ",")...)
		}
	}
	return out
}

func deref[T any](p *T) T {
	var zero T
	if p == nil {
		return zero
	}
	return *p
}
