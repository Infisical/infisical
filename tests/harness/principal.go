package harness

import (
	"bytes"
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/mailpit"
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
	name         string
	orgRole      string
	projectRoles []string

	// set records which options the caller passed, so a constructor that cannot honour
	// one can say so. Silently dropping a role is the worst outcome available here: the
	// test still runs, and passes or fails for a reason unrelated to what it asked for.
	set map[string]bool
}

// WithName names the principal. For a user it also picks the mailbox, so
// WithName("alice") means alice@<orgslug>.test.
func WithName(name string) PrincipalOption {
	return func(c *principalConfig) { c.name = name }
}

// OrgRole sets the organization role: no-access, member or admin, or a custom slug.
//
// Rejected by Project.NewIdentity, which creates the identity through the project
// route and has no organization role to set. Create it with Tenant.NewIdentity and
// grant it the project afterwards if you need both.
func OrgRole(slug string) PrincipalOption {
	return func(c *principalConfig) { c.orgRole = slug; c.set["OrgRole"] = true }
}

// ProjectRole sets the roles the principal gets on the project it is created in.
//
// Rejected by the tenant-level constructors, which create nothing in a project.
func ProjectRole(slugs ...string) PrincipalOption {
	return func(c *principalConfig) { c.projectRoles = slugs; c.set["ProjectRole"] = true }
}

// reject fails the test when the caller passed an option this constructor cannot act
// on, naming the constructor that can.
func (c principalConfig) reject(f failer, option, by, instead string) {
	f.Helper()
	if c.set[option] {
		f.Fatalf("harness: %s ignores %s.\n%s", by, option, instead)
	}
}

func newPrincipalConfig(prefix string, opts []PrincipalOption) principalConfig {
	cfg := principalConfig{name: prefix + "-" + shortID(), orgRole: "member", set: map[string]bool{}}
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
	cfg.reject(tt, "ProjectRole", "Tenant.NewUser",
		"It creates an organization member and nothing in a project. Use project.NewUser, "+
			"or project.Grant to add this user afterwards.")
	return t.newUser(tt, cfg)
}

func (t *Tenant) newUser(tt *testing.T, cfg principalConfig) *Principal {
	tt.Helper()
	ctx := tt.Context()
	addr := t.Address(cfg.name)

	// The new user's own bucket, not the tenant's: the invite goes through
	// smtpRateLimit, which is a hardcoded two per forty seconds keyed on the source
	// address and is not raisable through the plan.
	ip := newIP()
	inviter := t.stack.client(tt, t.Admin.Token, ip)

	invited, err := inviter.InviteUsersToOrganizationWithResponse(ctx, api.InviteUsersToOrganizationJSONRequestBody{
		InviteeEmails:        []openapi_types.Email{openapi_types.Email(addr)},
		OrganizationId:       t.OrgID.String(),
		OrganizationRoleSlug: &cfg.orgRole,
	})
	if err != nil {
		tt.Fatalf("harness: inviting %s: %v", addr, err)
	}
	if invited.StatusCode() != http.StatusOK {
		tt.Fatalf("harness: inviting %s returned %d: %s", addr, invited.StatusCode(), body(invited.Body))
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
			addr, verified.StatusCode(), body(verified.Body))
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
			addr, completed.StatusCode(), body(completed.Body))
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
	cfg.reject(tt, "ProjectRole", "Tenant.NewIdentity",
		"It creates an organization identity and nothing in a project. Use project.NewIdentity, "+
			"or project.Grant to add this identity afterwards.")

	res, err := t.Admin.API.CreateMachineIdentityWithResponse(tt.Context(), api.CreateMachineIdentityJSONRequestBody{
		Name:           cfg.name,
		OrganizationId: t.OrgID.String(),
		Role:           &cfg.orgRole,
	})
	if err != nil {
		tt.Fatalf("harness: creating identity %s: %v", cfg.name, err)
	}
	if res.JSON200 == nil {
		tt.Fatalf("harness: creating identity %s returned %d: %s", cfg.name, res.StatusCode(), body(res.Body))
	}
	return t.loginIdentity(tt, res.JSON200.Identity.Id, cfg.name)
}

// NewIdentity creates a machine identity directly inside this project.
//
// One call rather than two: createProjectMachineIdentity takes the project roles and
// makes the org identity and the project membership together.
func (p *Project) NewIdentity(tt *testing.T, opts ...PrincipalOption) *Principal {
	tt.Helper()
	cfg := newPrincipalConfig("i", opts)
	cfg.reject(tt, "OrgRole", "Project.NewIdentity",
		"createProjectMachineIdentity takes project roles only. Use tenant.NewIdentity(OrgRole(...)) "+
			"and then project.Grant if the identity needs both.")

	req := api.CreateProjectMachineIdentityJSONRequestBody{Name: cfg.name}
	if len(cfg.projectRoles) > 0 {
		roles := make([]api.CreateProjectMachineIdentityJSONBody_Roles_Item, 0, len(cfg.projectRoles))
		for _, slug := range cfg.projectRoles {
			var item api.CreateProjectMachineIdentityJSONBody_Roles_Item
			if err := item.FromCreateProjectMachineIdentityJSONBodyRoles0(
				api.CreateProjectMachineIdentityJSONBodyRoles0{Role: slug}); err != nil {
				tt.Fatalf("harness: %v", err)
			}
			roles = append(roles, item)
		}
		req.Roles = &roles
	}

	res, err := p.tn.Admin.API.CreateProjectMachineIdentityWithResponse(tt.Context(), p.ID, req)
	if err != nil {
		tt.Fatalf("harness: creating identity %s in project %s: %v", cfg.name, p.Slug, err)
	}
	if res.JSON200 == nil {
		tt.Fatalf("harness: creating identity %s in project %s returned %d: %s",
			cfg.name, p.Slug, res.StatusCode(), body(res.Body))
	}
	return p.tn.loginIdentity(tt, res.JSON200.Identity.Id, cfg.name)
}

// NewUser creates a user and grants it access to this project.
func (p *Project) NewUser(tt *testing.T, opts ...PrincipalOption) *Principal {
	tt.Helper()
	cfg := newPrincipalConfig("u", opts)
	pr := p.tn.newUser(tt, cfg)
	p.Grant(tt, pr, cfg.projectRoles...)
	return pr
}

// Grant gives an existing principal access to this project.
//
// Users and identities take different routes -- inviteProjectMembers against the
// project's membership collection, createProjectIdentityMembership against the
// identity -- which is why Principal carries its Kind.
func (p *Project) Grant(tt *testing.T, pr *Principal, roles ...string) {
	tt.Helper()
	ctx := tt.Context()

	// Defaulted here rather than left to the server: inviteProjectMembers falls back to
	// member on its own, createProjectIdentityMembership does not, and a fixture that
	// behaves differently for a user and an identity is a trap.
	if len(roles) == 0 {
		roles = []string{"member"}
	}

	switch pr.Kind {
	case User:
		res, err := p.tn.Admin.API.InviteProjectMembersWithResponse(ctx, p.ID,
			api.InviteProjectMembersJSONRequestBody{
				Emails:    &[]openapi_types.Email{openapi_types.Email(pr.Email)},
				RoleSlugs: &roles,
			})
		if err != nil {
			tt.Fatalf("harness: adding %s to project %s: %v", pr.Email, p.Slug, err)
		}
		if res.StatusCode() != http.StatusOK {
			tt.Fatalf("harness: adding %s to project %s returned %d: %s",
				pr.Email, p.Slug, res.StatusCode(), body(res.Body))
		}

	case Identity:
		items := make([]api.CreateProjectIdentityMembershipJSONBody_Roles_Item, 0, len(roles))
		for _, slug := range roles {
			var item api.CreateProjectIdentityMembershipJSONBody_Roles_Item
			if err := item.FromCreateProjectIdentityMembershipJSONBodyRoles0(
				api.CreateProjectIdentityMembershipJSONBodyRoles0{Role: slug}); err != nil {
				tt.Fatalf("harness: %v", err)
			}
			items = append(items, item)
		}
		res, err := p.tn.Admin.API.CreateProjectIdentityMembershipWithResponse(ctx, p.ID, pr.ID.String(),
			api.CreateProjectIdentityMembershipJSONRequestBody{Roles: &items})
		if err != nil {
			tt.Fatalf("harness: adding identity %s to project %s: %v", pr.Name, p.Slug, err)
		}
		if res.StatusCode() != http.StatusOK {
			tt.Fatalf("harness: adding identity %s to project %s returned %d: %s",
				pr.Name, p.Slug, res.StatusCode(), body(res.Body))
		}
	}
}

// loginIdentity attaches universal auth to an identity and exchanges the credentials
// for an access token.
func (t *Tenant) loginIdentity(tt *testing.T, id uuid.UUID, name string) *Principal {
	tt.Helper()
	ctx := tt.Context()

	attached, err := t.Admin.API.AttachUniversalAuthWithResponse(ctx, id.String(),
		api.AttachUniversalAuthJSONRequestBody{})
	if err != nil {
		tt.Fatalf("harness: attaching universal auth to %s: %v", name, err)
	}
	if attached.JSON200 == nil {
		tt.Fatalf("harness: attaching universal auth to %s returned %d: %s",
			name, attached.StatusCode(), body(attached.Body))
	}

	secret, err := t.Admin.API.CreateUniversalAuthClientSecretWithResponse(ctx, id.String(),
		api.CreateUniversalAuthClientSecretJSONRequestBody{})
	if err != nil {
		tt.Fatalf("harness: creating a client secret for %s: %v", name, err)
	}
	if secret.JSON200 == nil {
		tt.Fatalf("harness: creating a client secret for %s returned %d: %s",
			name, secret.StatusCode(), body(secret.Body))
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
		tt.Fatalf("harness: logging in as %s returned %d: %s", name, login.StatusCode(), body(login.Body))
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

func shortID() string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	return strings.ToLower(fmt.Sprintf("%x", b))
}
