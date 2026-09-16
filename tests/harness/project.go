package harness

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
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

	tn *Tenant
}

// ProjectOption adjusts a new project.
type ProjectOption func(*projectConfig)

type projectConfig struct {
	name string
	kind string
}

// WithProjectName names the project. Rarely needed; the slug carries a nanoid.
func WithProjectName(name string) ProjectOption {
	return func(c *projectConfig) { c.name = name }
}

// WithProjectType picks the product: secret-manager, cert-manager, kms, ssh.
func WithProjectType(kind string) ProjectOption {
	return func(c *projectConfig) { c.kind = kind }
}

// NewProject creates a project owned by this tenant's administrator.
func (t *Tenant) NewProject(tt *testing.T, opts ...ProjectOption) *Project {
	tt.Helper()

	cfg := projectConfig{name: "p-" + shortID()}
	for _, o := range opts {
		o(&cfg)
	}

	req := api.CreateProjectJSONRequestBody{ProjectName: cfg.name}
	if cfg.kind != "" {
		kind := api.CreateProjectJSONBodyType(cfg.kind)
		req.Type = &kind
	}

	res, err := t.Admin.API.CreateProjectWithResponse(tt.Context(), req)
	if err != nil {
		tt.Fatalf("harness: creating a project: %v", err)
	}
	if res.JSON200 == nil {
		tt.Fatalf("harness: creating a project returned %d: %s", res.StatusCode(), body(res.Body))
	}

	p := res.JSON200.Project
	proj := &Project{ID: p.Id, Name: p.Name, Slug: p.Slug, Type: p.Type, tn: t}
	for _, env := range p.Environments {
		proj.Environments = append(proj.Environments, env.Slug)
	}
	return proj
}

// Tenant is the organization this project belongs to.
func (p *Project) Tenant() *Tenant { return p.tn }
