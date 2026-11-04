package fixture

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// VerifiedEmailDomain proves the tenant owns its mail domain. SSO login and SCIM
// provisioning both refuse an email outside the org's verified domains.
func VerifiedEmailDomain(tt *testing.T, tn *harness.Tenant) {
	tt.Helper()
	ctx := tt.Context()
	domain := strings.SplitN(tn.Email("x"), "@", 2)[1]

	created, err := tn.Admin.API.CreateEmailDomainWithResponse(ctx, api.CreateEmailDomainJSONRequestBody{Domain: domain})
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, created.StatusCode(), "creating email domain: %s", apierr.Body(created.Body))
	record := created.JSON200.EmailDomain

	fakenet.SetTXT(tt, FakenetAdmin(tt, tn), record.VerificationRecordName,
		"infisical-domain-verification="+record.VerificationCode)

	verified, err := tn.Admin.API.VerifyEmailDomainWithResponse(ctx, record.Id)
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, verified.StatusCode(), "verifying email domain: %s", apierr.Body(verified.Body))
}
