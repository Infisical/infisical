package pki

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Requests is how many certificate requests the profile has received, as the tenant
// admin sees them, so a refusal can show that nothing was issued.
func Requests(tt *testing.T, p *Project, profile Profile) int {
	tt.Helper()
	res, err := p.tn.Admin.API.SearchCertificateRequestsWithResponse(tt.Context(), api.SearchCertificateRequestsJSONRequestBody{ProfileIds: &[]uuid.UUID{profile.ID}})
	require.NoError(tt, err, "searching certificate requests")
	require.NotNilf(tt, res.JSON200, "searching certificate requests returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return int(res.JSON200.TotalCount)
}

var finalRequestStatuses = []api.GetCertificateRequest200JSONResponseBodyStatus{
	api.GetCertificateRequest200JSONResponseBodyStatusIssued,
	api.GetCertificateRequest200JSONResponseBodyStatusFailed,
	api.GetCertificateRequest200JSONResponseBodyStatusRejected,
}

// WaitRequest polls a certificate request as `as` until it reaches one of want, and
// fails as soon as it reaches a final status outside want or the read is refused in a
// way polling cannot clear. Transport errors, 429s and 5xx responses are retried.
func WaitRequest(tt *testing.T, as *harness.Principal, requestID string, want []api.GetCertificateRequest200JSONResponseBodyStatus, opts ...wait.Option) *api.GetCertificateRequestResponse {
	tt.Helper()
	reqID, err := uuid.Parse(requestID)
	require.NoError(tt, err)
	res := Poll(tt, "reading the certificate request", func(ctx context.Context) (*api.GetCertificateRequestResponse, int, []byte, error) {
		res, status, body, err := ReadResponse(ctx, func(ctx context.Context) (*http.Response, error) {
			return as.API.GetCertificateRequest(ctx, reqID)
		}, api.ParseGetCertificateRequestResponse)
		if err == nil && status == http.StatusOK && res.JSON200 == nil {
			err = fmt.Errorf("content type %q", res.HTTPResponse.Header.Get("Content-Type"))
		}
		return res, status, body, err
	}, func(res *api.GetCertificateRequestResponse) bool {
		return slices.Contains(want, res.JSON200.Status) || slices.Contains(finalRequestStatuses, res.JSON200.Status)
	}, opts...)
	if status := res.JSON200.Status; !slices.Contains(want, status) {
		msg := "<none>"
		if res.JSON200.ErrorMessage != nil {
			msg = *res.JSON200.ErrorMessage
		}
		require.FailNowf(tt, "the certificate request ended in the wrong status", "want %v, got %s: %s", want, status, msg)
	}
	return res
}
