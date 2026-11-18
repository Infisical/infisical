package pki

import (
	"context"
	"fmt"
	"net/http"
	"slices"
	"testing"
	"time"

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
	res, err := p.tn.Admin.API.ListCertificateRequestsWithResponse(tt.Context(), &api.ListCertificateRequestsParams{ProfileIds: new(profile.ID.String())})
	require.NoError(tt, err, "listing certificate requests")
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "listing certificate requests: %s", apierr.Body(res.Body))
	return len(res.JSON200.CertificateRequests)
}

// pollReadTimeout bounds one read, so a stuck response cannot hold a poll past its wait.
const pollReadTimeout = 10 * time.Second

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
	type outcome struct {
		res *api.GetCertificateRequestResponse
		err error
	}
	got, err := wait.For(tt.Context(), func(ctx context.Context) (outcome, bool, error) {
		ctx, cancel := context.WithTimeout(ctx, pollReadTimeout)
		defer cancel()
		res, err := as.API.GetCertificateRequestWithResponse(ctx, reqID)
		if err != nil {
			return outcome{}, false, fmt.Errorf("reading the certificate request: %w", err)
		}
		if res.JSON200 == nil {
			err := fmt.Errorf("reading the certificate request returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
			temporary := res.StatusCode() == http.StatusTooManyRequests || res.StatusCode() >= 500
			return outcome{err: err}, !temporary, err
		}
		status := res.JSON200.Status
		return outcome{res: res}, slices.Contains(want, status) || slices.Contains(finalRequestStatuses, status), nil
	}, opts...)
	require.NoErrorf(tt, err, "waiting for the certificate request to reach %v", want)
	require.NoError(tt, got.err)
	if status := got.res.JSON200.Status; !slices.Contains(want, status) {
		msg := "<none>"
		if got.res.JSON200.ErrorMessage != nil {
			msg = *got.res.JSON200.ErrorMessage
		}
		require.FailNowf(tt, "the certificate request ended in the wrong status", "want %v, got %s: %s", want, status, msg)
	}
	return got.res
}
