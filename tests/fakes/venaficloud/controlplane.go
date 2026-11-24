package venaficloud

import (
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
)

// ControlPlane is a test's view of what one API key reaches inside fakenet.
type ControlPlane struct {
	*fakenet.Scope[Tenant]
}

// Open returns the tenant an API key belongs to.
func Open(tt *testing.T, adminURL, apiKey string) *ControlPlane {
	tt.Helper()
	return &ControlPlane{fakenet.Open[Tenant](tt, adminURL, Service.Host(), apiKey)}
}

// WithApplication seeds an application that may request certificates under an issuing
// template. Every template signs intermediates.
func WithApplication(applicationID, templateID string) any {
	return map[string]any{"applications": []Application{{ID: applicationID, Name: "app-" + applicationID[:8],
		Templates: []Template{{ID: templateID, Name: "template-" + templateID[:8]}}}}}
}
