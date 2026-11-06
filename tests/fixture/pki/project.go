// Package pki builds Certificate Manager resources: CAs, certificate policies,
// profiles, applications and their enrollment methods.
package pki

import (
	"bytes"
	"encoding/json"
	"io"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// Project is an organization's active Certificate Manager project. Organization
// creation provisions it, and applications only work on that one, so it is looked up
// rather than created.
type Project struct {
	ID string

	tn *harness.Tenant
}

// Tenant is the organization the project belongs to.
func (p *Project) Tenant() *harness.Tenant { return p.tn }

// CertManager returns the tenant's active Certificate Manager project.
func CertManager(tt *testing.T, tn *harness.Tenant) *Project {
	tt.Helper()
	res, err := tn.Admin.API.GetCertManagerInstanceStateWithResponse(tt.Context())
	require.NoError(tt, err, "reading the Certificate Manager instance")
	require.NotNilf(tt, res.JSON200, "reading the Certificate Manager instance returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	require.NotNil(tt, res.JSON200.ActiveProjectId, "the organization has no active Certificate Manager project")
	return &Project{ID: *res.JSON200.ActiveProjectId, tn: tn}
}

func jsonBody(tt *testing.T, v any) io.Reader {
	tt.Helper()
	raw, err := json.Marshal(v)
	require.NoError(tt, err)
	return bytes.NewReader(raw)
}

func decode(tt *testing.T, body []byte, v any) {
	tt.Helper()
	require.NoErrorf(tt, json.Unmarshal(body, v), "decoding %s", apierr.Body(body))
}
