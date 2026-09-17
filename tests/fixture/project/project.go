// Package project creates projects and the principals that live inside them.
//
// Split from harness because organization membership is not project membership:
// the roles, the routes and the options differ, and keeping them in separate
// packages means a project role cannot be passed where only an organization role
// makes sense. That used to be a runtime check.
package project

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	openapi_types "github.com/oapi-codegen/runtime/types"
)

// Project is one project inside a tenant.
type Project struct {
	ID   string
	Name string
	Slug string
	Type string

	// Environments are the slugs the project was created with: dev, staging, prod
	// unless the type or template says otherwise.
	Environments []string

	tn *harness.Tenant
}

// Option adjusts a new project.
type Option func(*config)

type config struct {
	name string
	kind string
}

// WithName names the project. Rarely needed; the slug carries a nanoid.
func WithName(name string) Option { return func(c *config) { c.name = name } }

// WithType picks the product: secret-manager, cert-manager, kms, ssh.
func WithType(kind string) Option { return func(c *config) { c.kind = kind } }

// New creates a project owned by the tenant's administrator.
func New(tt *testing.T, tn *harness.Tenant, opts ...Option) *Project {
	tt.Helper()

	cfg := config{name: "p-" + id.Short()}
	for _, o := range opts {
		o(&cfg)
	}

	req := api.CreateProjectJSONRequestBody{ProjectName: cfg.name}
	if cfg.kind != "" {
		kind := api.CreateProjectJSONBodyType(cfg.kind)
		req.Type = &kind
	}

	res, err := tn.Admin.API.CreateProjectWithResponse(tt.Context(), req)
	if err != nil {
		tt.Fatalf("project: creating: %v", err)
	}
	if res.JSON200 == nil {
		tt.Fatalf("project: creating returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	}

	p := res.JSON200.Project
	proj := &Project{ID: p.Id, Name: p.Name, Slug: p.Slug, Type: p.Type, tn: tn}
	for _, env := range p.Environments {
		proj.Environments = append(proj.Environments, env.Slug)
	}
	return proj
}

// Tenant is the organization this project belongs to.
func (p *Project) Tenant() *harness.Tenant { return p.tn }

// PrincipalOption adjusts a principal created inside a project.
type PrincipalOption func(*principalConfig)

type principalConfig struct {
	name  string
	roles []string
}

// Name names the principal. For a user it also picks the mailbox, so Name("alice")
// means alice@<orgslug>.test.
func Name(n string) PrincipalOption { return func(c *principalConfig) { c.name = n } }

// Role sets the project roles the principal gets.
func Role(slugs ...string) PrincipalOption {
	return func(c *principalConfig) { c.roles = slugs }
}

func newPrincipalConfig(opts []PrincipalOption) principalConfig {
	var cfg principalConfig
	for _, o := range opts {
		o(&cfg)
	}
	return cfg
}

// NewIdentity creates a machine identity directly inside this project.
//
// One call rather than two: createProjectMachineIdentity takes the project roles
// and makes the organization identity and the project membership together.
func (p *Project) NewIdentity(tt *testing.T, opts ...PrincipalOption) *harness.Principal {
	tt.Helper()

	cfg := newPrincipalConfig(opts)
	if cfg.name == "" {
		cfg.name = "i-" + id.Short()
	}

	req := api.CreateProjectMachineIdentityJSONRequestBody{Name: cfg.name}
	if len(cfg.roles) > 0 {
		roles := make([]api.CreateProjectMachineIdentityJSONBody_Roles_Item, 0, len(cfg.roles))
		for _, slug := range cfg.roles {
			var item api.CreateProjectMachineIdentityJSONBody_Roles_Item
			if err := item.FromCreateProjectMachineIdentityJSONBodyRoles0(
				api.CreateProjectMachineIdentityJSONBodyRoles0{Role: slug}); err != nil {
				tt.Fatalf("project: %v", err)
			}
			roles = append(roles, item)
		}
		req.Roles = &roles
	}

	res, err := p.tn.Admin.API.CreateProjectMachineIdentityWithResponse(tt.Context(), p.ID, req)
	if err != nil {
		tt.Fatalf("project: creating identity %s in %s: %v", cfg.name, p.Slug, err)
	}
	if res.JSON200 == nil {
		tt.Fatalf("project: creating identity %s in %s returned %d: %s",
			cfg.name, p.Slug, res.StatusCode(), apierr.Body(res.Body))
	}
	return p.tn.LoginIdentity(tt, res.JSON200.Identity.Id, cfg.name)
}

// NewUser creates a user and grants it access to this project.
func (p *Project) NewUser(tt *testing.T, opts ...PrincipalOption) *harness.Principal {
	tt.Helper()

	cfg := newPrincipalConfig(opts)
	var userOpts []harness.PrincipalOption
	if cfg.name != "" {
		userOpts = append(userOpts, harness.WithName(cfg.name))
	}

	pr := p.tn.NewUser(tt, userOpts...)
	p.Grant(tt, pr, cfg.roles...)
	return pr
}

// Grant gives an existing principal access to this project.
//
// Users and identities take different routes -- inviteProjectMembers against the
// project's membership collection, createProjectIdentityMembership against the
// identity -- which is why Principal carries its Kind.
func (p *Project) Grant(tt *testing.T, pr *harness.Principal, roles ...string) {
	tt.Helper()
	ctx := tt.Context()

	// Defaulted here rather than left to the server: inviteProjectMembers falls back
	// to member on its own, createProjectIdentityMembership does not, and a fixture
	// that behaves differently for a user and an identity is a trap.
	if len(roles) == 0 {
		roles = []string{"member"}
	}

	switch pr.Kind {
	case harness.User:
		res, err := p.tn.Admin.API.InviteProjectMembersWithResponse(ctx, p.ID,
			api.InviteProjectMembersJSONRequestBody{
				Emails:    &[]openapi_types.Email{openapi_types.Email(pr.Email)},
				RoleSlugs: &roles,
			})
		if err != nil {
			tt.Fatalf("project: adding %s to %s: %v", pr.Email, p.Slug, err)
		}
		if res.StatusCode() != http.StatusOK {
			tt.Fatalf("project: adding %s to %s returned %d: %s",
				pr.Email, p.Slug, res.StatusCode(), apierr.Body(res.Body))
		}

	case harness.Identity:
		items := make([]api.CreateProjectIdentityMembershipJSONBody_Roles_Item, 0, len(roles))
		for _, slug := range roles {
			var item api.CreateProjectIdentityMembershipJSONBody_Roles_Item
			if err := item.FromCreateProjectIdentityMembershipJSONBodyRoles0(
				api.CreateProjectIdentityMembershipJSONBodyRoles0{Role: slug}); err != nil {
				tt.Fatalf("project: %v", err)
			}
			items = append(items, item)
		}
		res, err := p.tn.Admin.API.CreateProjectIdentityMembershipWithResponse(ctx, p.ID, pr.ID.String(),
			api.CreateProjectIdentityMembershipJSONRequestBody{Roles: &items})
		if err != nil {
			tt.Fatalf("project: adding identity %s to %s: %v", pr.Name, p.Slug, err)
		}
		if res.StatusCode() != http.StatusOK {
			tt.Fatalf("project: adding identity %s to %s returned %d: %s",
				pr.Name, p.Slug, res.StatusCode(), apierr.Body(res.Body))
		}
	}
}
