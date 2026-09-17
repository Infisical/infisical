package harness

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/mailpit"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/mail"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"
)

// UserPassword is what every harness-created user gets.
//
// Fixed rather than generated so a failing test can be reproduced by hand against the
// surviving instance. It satisfies PASSWORD_POLICY: fourteen characters, a letter, a
// digit and a symbol.
const UserPassword = "HarnessUserPassword7!"

// PrincipalOption adjusts a new user or identity.
type PrincipalOption func(*principalConfig)

type principalConfig struct {
	name    string
	orgRole string
}

// WithName names the principal. For a user it also picks the mailbox, so
// WithName("alice") means alice@<orgslug>.test.
func WithName(name string) PrincipalOption {
	return func(c *principalConfig) { c.name = name }
}

// OrgRole sets the organization role: no-access, member or admin, or a custom slug.
//
// Project roles are a different thing entirely, and live in the project package.
func OrgRole(slug string) PrincipalOption {
	return func(c *principalConfig) { c.orgRole = slug }
}

func newPrincipalConfig(prefix string, opts []PrincipalOption) principalConfig {
	cfg := principalConfig{name: prefix + "-" + id.Short(), orgRole: "member"}
	for _, o := range opts {
		o(&cfg)
	}
	return cfg
}

// Mail returns a view of Mailpit scoped to this tenant's domain.
//
// A method rather than a field: it fails with the option to add when the suite has no
// Mailpit, where a field would be a nil dereference three frames inside the client.
func (t *Tenant) Mail(tt *testing.T) *mail.Inbox {
	tt.Helper()
	h := t.stack.Require(tt, mailpit.Key, "harness.Shared").(*mailpit.Handle)
	return mail.NewInbox(h.API(infra.External).URL("http"), t.OrgSlug+".test")
}

// NewUser creates a real user in this tenant's organization.
//
// The whole invite flow, because there is no shortcut. The invite response carries
// the signup link only when SMTP is unconfigured (org-membership-user-factory.ts),
// and the harness configures SMTP on purpose, so the link has to come out of the
// mailbox. That is what makes Mailpit load-bearing rather than decorative.
//
// Five calls: invite, verify, complete-account, select-organization, and the mail
// read in between. The last one is not just fetching a scoped token --
// selectOrganization is what promotes the membership from Invited to Accepted.
func (t *Tenant) NewUser(tt *testing.T, opts ...PrincipalOption) *Principal {
	tt.Helper()
	cfg := newPrincipalConfig("u", opts)
	return t.newUser(tt, cfg, t.Admin.Token)
}

// newUser runs the invitation flow. inviterToken is normally the tenant's own
// administrator; creating that administrator is the one case where it is the root,
// because there is nobody else in the organization yet.
func (t *Tenant) newUser(tt *testing.T, cfg principalConfig, inviterToken string) *Principal {
	tt.Helper()
	ctx := tt.Context()
	addr := t.Address(cfg.name)

	// The new user's own bucket, not the tenant's: the invite goes through
	// smtpRateLimit, which is a hardcoded two per forty seconds keyed on the source
	// address and is not raisable through the plan.
	ip := newIP()
	inviter := t.stack.client(tt, inviterToken, ip)

	invited, err := inviter.InviteUsersToOrganizationWithResponse(ctx, api.InviteUsersToOrganizationJSONRequestBody{
		InviteeEmails:        []openapi_types.Email{openapi_types.Email(addr)},
		OrganizationId:       t.OrgID.String(),
		OrganizationRoleSlug: &cfg.orgRole,
	})
	if err != nil {
		tt.Fatalf("harness: inviting %s: %v", addr, err)
	}
	if invited.StatusCode() != http.StatusOK {
		tt.Fatalf("harness: inviting %s returned %d: %s", addr, invited.StatusCode(), apierr.Body(invited.Body))
	}

	msg, err := t.Mail(tt).Await(ctx, addr, mail.Subject("invitation"))
	if err != nil {
		tt.Fatalf("harness: %v", err)
	}
	inviteToken, err := mail.Param(msg, "token")
	if err != nil {
		tt.Fatalf("harness: %v", err)
	}

	anon, err := infisical.NewClient(t.stack.app.BaseURL(infra.External), infisical.ForwardedFor(ip))
	if err != nil {
		tt.Fatalf("harness: %v", err)
	}
	verified, err := anon.VerifyUserToOrganizationWithResponse(ctx, api.VerifyUserToOrganizationJSONRequestBody{
		Email:          openapi_types.Email(addr),
		OrganizationId: t.OrgID.String(),
		Code:           inviteToken,
	})
	if err != nil {
		tt.Fatalf("harness: verifying the invitation for %s: %v", addr, err)
	}
	if verified.JSON200 == nil || verified.JSON200.Token == nil {
		tt.Fatalf("harness: verifying the invitation for %s returned %d: %s",
			addr, verified.StatusCode(), apierr.Body(verified.Body))
	}

	var signupBody api.CompleteAccountSignupV3JSONBody
	if err := signupBody.FromCompleteAccountSignupV3JSONBody0(api.CompleteAccountSignupV3JSONBody0{
		Type:      api.CompleteAccountSignupV3JSONBody0TypeEmail,
		Email:     addr,
		FirstName: cfg.name,
		Password:  UserPassword,
	}); err != nil {
		tt.Fatalf("harness: %v", err)
	}

	// The typed request body cannot carry this. oapi-codegen declares
	// CompleteAccountSignupV3JSONRequestBody as a defined type over the union struct,
	// and a defined type does not inherit methods -- so the generated MarshalJSON is
	// lost and the discriminated union serialises as {}. Encoding the union itself and
	// posting the bytes is the only shape that survives.
	raw, err := json.Marshal(signupBody)
	if err != nil {
		tt.Fatalf("harness: %v", err)
	}
	completed, err := t.stack.client(tt, *verified.JSON200.Token, ip).
		CompleteAccountSignupV3WithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		tt.Fatalf("harness: completing the account for %s: %v", addr, err)
	}
	if completed.JSON200 == nil {
		tt.Fatalf("harness: completing the account for %s returned %d: %s",
			addr, completed.StatusCode(), apierr.Body(completed.Body))
	}

	scoped := t.stack.scopeToOrg(tt, completed.JSON200.Token, t.OrgID, ip)
	return &Principal{
		Kind:  User,
		ID:    completed.JSON200.User.Id,
		Name:  cfg.name,
		Email: addr,
		Token: scoped,
		API:   t.stack.client(tt, scoped, ip),
		ip:    ip,
	}
}

// NewIdentity creates a machine identity with universal auth and logs it in.
//
// Four calls and no mail, so it is much cheaper than a user. Reach for this unless
// the behaviour under test is specific to a human actor.
func (t *Tenant) NewIdentity(tt *testing.T, opts ...PrincipalOption) *Principal {
	tt.Helper()
	cfg := newPrincipalConfig("i", opts)

	res, err := t.Admin.API.CreateMachineIdentityWithResponse(tt.Context(), api.CreateMachineIdentityJSONRequestBody{
		Name:           cfg.name,
		OrganizationId: t.OrgID.String(),
		Role:           &cfg.orgRole,
	})
	if err != nil {
		tt.Fatalf("harness: creating identity %s: %v", cfg.name, err)
	}
	if res.JSON200 == nil {
		tt.Fatalf("harness: creating identity %s returned %d: %s", cfg.name, res.StatusCode(), apierr.Body(res.Body))
	}
	return t.LoginIdentity(tt, res.JSON200.Identity.Id, cfg.name)
}

// LoginIdentity attaches universal auth to an existing identity and exchanges the
// credentials for an access token.
//
// Exported for fixture packages that create an identity through a product route --
// a project, say -- and still need it to be able to authenticate.
func (t *Tenant) LoginIdentity(tt *testing.T, id uuid.UUID, name string) *Principal {
	tt.Helper()
	ctx := tt.Context()

	attached, err := t.Admin.API.AttachUniversalAuthWithResponse(ctx, id.String(),
		api.AttachUniversalAuthJSONRequestBody{})
	if err != nil {
		tt.Fatalf("harness: attaching universal auth to %s: %v", name, err)
	}
	if attached.JSON200 == nil {
		tt.Fatalf("harness: attaching universal auth to %s returned %d: %s",
			name, attached.StatusCode(), apierr.Body(attached.Body))
	}

	secret, err := t.Admin.API.CreateUniversalAuthClientSecretWithResponse(ctx, id.String(),
		api.CreateUniversalAuthClientSecretJSONRequestBody{})
	if err != nil {
		tt.Fatalf("harness: creating a client secret for %s: %v", name, err)
	}
	if secret.JSON200 == nil {
		tt.Fatalf("harness: creating a client secret for %s returned %d: %s",
			name, secret.StatusCode(), apierr.Body(secret.Body))
	}

	ip := newIP()
	anon, err := infisical.NewClient(t.stack.app.BaseURL(infra.External), infisical.ForwardedFor(ip))
	if err != nil {
		tt.Fatalf("harness: %v", err)
	}
	slug := t.OrgSlug
	login, err := anon.LoginWithUniversalAuthWithResponse(ctx, api.LoginWithUniversalAuthJSONRequestBody{
		ClientId:         attached.JSON200.IdentityUniversalAuth.ClientId,
		ClientSecret:     secret.JSON200.ClientSecret,
		OrganizationSlug: &slug,
	})
	if err != nil {
		tt.Fatalf("harness: logging in as %s: %v", name, err)
	}
	if login.JSON200 == nil {
		tt.Fatalf("harness: logging in as %s returned %d: %s", name, login.StatusCode(), apierr.Body(login.Body))
	}

	return &Principal{
		Kind:  Identity,
		ID:    id,
		Name:  name,
		Token: login.JSON200.AccessToken,
		API:   t.stack.client(tt, login.JSON200.AccessToken, ip),
		ip:    ip,
	}
}
