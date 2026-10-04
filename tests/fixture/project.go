// Package fixture builds platform resources a test needs: projects and app
// connections. Product resources live in a package per product under fixture/.
//
// Required arguments are positional; everything optional is an option.
package fixture

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

type Project struct {
	ID           string
	Name         string
	Slug         string
	Type         string
	Environments []string

	tn *harness.Tenant
}

type ProjectOption func(*projectConfig)

type projectConfig struct {
	name string
	kind string
}

func WithProjectName(name string) ProjectOption {
	return func(c *projectConfig) { c.name = name }
}

// WithProjectType picks the product: secret-manager, cert-manager, kms, ssh.
func WithProjectType(kind string) ProjectOption {
	return func(c *projectConfig) { c.kind = kind }
}

func NewProject(tt *testing.T, tn *harness.Tenant, opts ...ProjectOption) *Project {
	tt.Helper()

	cfg := projectConfig{name: "p-" + id.Short()}
	for _, o := range opts {
		o(&cfg)
	}

	req := api.CreateProjectJSONRequestBody{ProjectName: cfg.name}
	if cfg.kind != "" {
		kind := api.CreateProjectJSONBodyType(cfg.kind)
		req.Type = &kind
	}

	res, err := tn.Admin.API.CreateProjectWithResponse(tt.Context(), req)
	require.NoError(tt, err, "creating a project")
	require.NotNilf(tt, res.JSON200, "creating a project returned %d: %s", res.StatusCode(), apierr.Body(res.Body))

	p := res.JSON200.Project
	proj := &Project{ID: p.Id, Name: p.Name, Slug: p.Slug, Type: p.Type, tn: tn}
	for _, env := range p.Environments {
		proj.Environments = append(proj.Environments, env.Slug)
	}
	return proj
}

func (p *Project) Tenant() *harness.Tenant { return p.tn }

type PrincipalOption func(*principalConfig)

type principalConfig struct {
	name  string
	roles []string
}

// WithPrincipalName also picks a user's mailbox: alice means alice@<tenant-nonce>.test.
func WithPrincipalName(n string) PrincipalOption {
	return func(c *principalConfig) { c.name = n }
}

// WithRoles sets project roles. Without it a principal gets member.
func WithRoles(slugs ...string) PrincipalOption {
	return func(c *principalConfig) { c.roles = slugs }
}

func newPrincipalConfig(opts []PrincipalOption) principalConfig {
	var cfg principalConfig
	for _, o := range opts {
		o(&cfg)
	}
	return cfg
}

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
			require.NoError(tt, item.FromCreateProjectMachineIdentityJSONBodyRoles0(
				api.CreateProjectMachineIdentityJSONBodyRoles0{Role: slug}))
			roles = append(roles, item)
		}
		req.Roles = &roles
	}

	res, err := p.tn.Admin.API.CreateProjectMachineIdentityWithResponse(tt.Context(), p.ID, req)
	require.NoErrorf(tt, err, "creating identity %s in %s", cfg.name, p.Slug)
	require.NotNilf(tt, res.JSON200, "creating identity %s in %s returned %d: %s",
		cfg.name, p.Slug, res.StatusCode(), apierr.Body(res.Body))
	return p.tn.LoginIdentity(tt, res.JSON200.Identity.Id, cfg.name)
}

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

// Grant gives an existing principal access to this project. Users and identities go
// through different routes, which is why Principal carries its Kind.
func (p *Project) Grant(tt *testing.T, pr *harness.Principal, roles ...string) {
	tt.Helper()
	ctx := tt.Context()

	// Defaulted here because inviteProjectMembers falls back to member on its own and
	// createProjectIdentityMembership does not.
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
		require.NoErrorf(tt, err, "adding %s to %s", pr.Email, p.Slug)
		require.Equalf(tt, http.StatusOK, res.StatusCode(), "adding %s to %s: %s",
			pr.Email, p.Slug, apierr.Body(res.Body))

	case harness.Identity:
		items := make([]api.CreateProjectIdentityMembershipJSONBody_Roles_Item, 0, len(roles))
		for _, slug := range roles {
			var item api.CreateProjectIdentityMembershipJSONBody_Roles_Item
			require.NoError(tt, item.FromCreateProjectIdentityMembershipJSONBodyRoles0(
				api.CreateProjectIdentityMembershipJSONBodyRoles0{Role: slug}))
			items = append(items, item)
		}
		res, err := p.tn.Admin.API.CreateProjectIdentityMembershipWithResponse(ctx, p.ID, pr.ID.String(),
			api.CreateProjectIdentityMembershipJSONRequestBody{Roles: &items})
		require.NoErrorf(tt, err, "adding identity %s to %s", pr.Name, p.Slug)
		require.Equalf(tt, http.StatusOK, res.StatusCode(), "adding identity %s to %s: %s",
			pr.Name, p.Slug, apierr.Body(res.Body))
	}
}
