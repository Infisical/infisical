package pki

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
)

// ScanFinished waits, reading as `as`, for the discovery's latest scan to complete or fail.
func ScanFinished(tt *testing.T, as *harness.Principal, discoveryID uuid.UUID) *api.GetPkiDiscoveryLatestScanResponse {
	tt.Helper()
	return Poll(tt, "reading the latest scan", func(ctx context.Context) (*api.GetPkiDiscoveryLatestScanResponse, int, []byte, error) {
		res, status, body, err := ReadResponse(ctx, func(ctx context.Context) (*http.Response, error) {
			return as.API.GetPkiDiscoveryLatestScan(ctx, discoveryID)
		}, api.ParseGetPkiDiscoveryLatestScanResponse)
		// A 200 with no scan yet is JSON null, so a nil JSON200 alone is not malformed.
		if err == nil && status == http.StatusOK {
			if ct := res.HTTPResponse.Header.Get("Content-Type"); !strings.Contains(ct, "json") {
				err = fmt.Errorf("content type %q", ct)
			}
		}
		return res, status, body, err
	}, func(res *api.GetPkiDiscoveryLatestScanResponse) bool {
		return res.JSON200 != nil && (res.JSON200.Status == "completed" || res.JSON200.Status == "failed")
	})
}
