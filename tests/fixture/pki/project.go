// Package pki builds Certificate Manager resources: CAs, certificate policies,
// profiles, applications and their enrollment methods.
package pki

import (
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Project is an organization's active Certificate Manager project. Organization
// creation provisions it, and applications only work on that one, so it is looked up
// rather than created.
type Project struct {
	ID uuid.UUID

	tn *harness.Tenant
}

// CertManager returns the tenant's active Certificate Manager project.
func CertManager(tt *testing.T, tn *harness.Tenant) *Project {
	tt.Helper()
	res, err := tn.Admin.API.GetCertManagerInstanceStateWithResponse(tt.Context())
	require.NoError(tt, err, "reading the Certificate Manager instance")
	require.NotNilf(tt, res.JSON200, "reading the Certificate Manager instance returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	require.NotNil(tt, res.JSON200.ActiveProjectId, "the organization has no active Certificate Manager project")
	projectID, err := uuid.Parse(*res.JSON200.ActiveProjectId)
	require.NoError(tt, err)
	return &Project{ID: projectID, tn: tn}
}
