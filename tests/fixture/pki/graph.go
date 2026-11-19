package pki

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
)

// ApplicationGraph is what a client needs to be issued a certificate: a root CA, an
// intermediate signed by it, a policy, a profile issuing from the intermediate under
// that policy, and an application with the profile attached. No enrollment method is on.
type ApplicationGraph struct {
	Project *Project
	Root    CA
	CA      CA
	Policy  Policy
	Profile Profile
	App     Application
}

// Graph is an ApplicationGraph with API enrollment on and an operator.
type Graph struct {
	*ApplicationGraph
	Operator *harness.Principal
}

type graphConfig struct {
	policy *api.CreateCertificatePolicyJSONRequestBody
}

type GraphOption func(*graphConfig)

// WithPolicy issues under a policy built from body instead of AllowAll.
func WithPolicy(body api.CreateCertificatePolicyJSONRequestBody) GraphOption {
	return func(c *graphConfig) { c.policy = &body }
}

// NewGraph builds a Graph in the tenant's Certificate Manager project, with a new
// Product Member as the application's operator.
func NewGraph(tt *testing.T, tn *harness.Tenant, opts ...GraphOption) *Graph {
	tt.Helper()
	var cfg graphConfig
	for _, o := range opts {
		o(&cfg)
	}
	policy := AllowAll(tt)
	if cfg.policy != nil {
		policy = *cfg.policy
	}
	g := &Graph{ApplicationGraph: NewApplicationGraph(tt, tn, policy)}
	g.Operator = newOperator(tt, g.Project, g.App, g.Profile)
	return g
}

// newOperator turns on API enrollment for profile in app and adds a new Product Member
// as the application's operator.
func newOperator(tt *testing.T, p *Project, app Application, profile Profile) *harness.Principal {
	tt.Helper()
	EnableAPI(tt, app, profile, api.SetPkiApplicationApiEnrollmentJSONRequestBody{})
	operator := p.tn.NewUser(tt, harness.WithName("operator"))
	p.Grant(tt, operator)
	AddMember(tt, app, operator, "operator")
	return operator
}

// NewApplicationGraph builds an ApplicationGraph issuing under a policy built from
// policyBody, for clients that reach the profile through another enrollment method.
func NewApplicationGraph(tt *testing.T, tn *harness.Tenant, policyBody api.CreateCertificatePolicyJSONRequestBody) *ApplicationGraph {
	tt.Helper()
	p := CertManager(tt, tn)
	root := NewInternalCA(tt, p)
	ca := NewIntermediateCA(tt, p, root)
	policy := NewPolicy(tt, p, policyBody)
	profile := NewProfile(tt, p, ca, policy)
	app := NewApplication(tt, p, profile)
	return &ApplicationGraph{Project: p, Root: root, CA: ca, Policy: policy, Profile: profile, App: app}
}

// Issue issues a certificate through the graph's profile, as the operator unless an
// As option names someone else.
func (g *Graph) Issue(tt *testing.T, body api.CreateCertificateJSONRequestBody, opts ...IssueOption) Certificate {
	tt.Helper()
	return Issue(tt, g.App, g.Profile, body, append([]IssueOption{As(g.Operator)}, opts...)...)
}
