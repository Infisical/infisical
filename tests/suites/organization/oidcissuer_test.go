package organization_test

import (
	"context"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestOIDCIssuer_Discovery(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should serve discovery whose issuer and jwks_uri belong to the org", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		issuer := h.App().SiteURL() + "/api/v1/oidc-issuer/organizations/" + tn.OrgID.String()

		// Action
		res, err := tn.Anonymous(t).GetOidcIssuerDiscoveryDocumentWithResponse(t.Context(), tn.OrgID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, issuer, res.JSON200.Issuer)
		require.Equal(t, issuer+"/.well-known/jwks.json", res.JSON200.JwksUri)
		require.Equal(t, []string{"RS256"}, res.JSON200.IdTokenSigningAlgValuesSupported)
	})

	t.Run("should answer 422 for a non-uuid org id", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Anonymous(t).GetOidcIssuerDiscoveryDocumentWithResponse(t.Context(), tn.OrgID, orgIDInPath(tn.OrgID.String(), "not-a-uuid"))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
	})
}

func TestOIDCIssuer_JWKS(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should serve an empty JWKS with no-store before any token is signed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Anonymous(t).GetOidcIssuerJwksWithResponse(t.Context(), tn.OrgID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Empty(t, res.JSON200.Keys)
		require.Equal(t, "no-store", res.HTTPResponse.Header.Get("Cache-Control"))
	})

	t.Run("should answer 422 for a non-uuid org id", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Anonymous(t).GetOidcIssuerJwksWithResponse(t.Context(), tn.OrgID, orgIDInPath(tn.OrgID.String(), "not-a-uuid"))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
	})
}

// orgIDInPath swaps the org id in the request path. The generated client types the
// parameter as a UUID, so a malformed one can only be sent by editing the request.
func orgIDInPath(from, to string) func(context.Context, *http.Request) error {
	return func(_ context.Context, req *http.Request) error {
		req.URL.Path = strings.Replace(req.URL.Path, from, to, 1)
		req.URL.RawPath = ""
		return nil
	}
}
