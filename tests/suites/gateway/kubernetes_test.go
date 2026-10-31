package gateway_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/kubernetes"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestGatewayForwarding_Kubernetes(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should review a machine identity's Kubernetes token through a gateway", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw, _ := healthyGateway(t, h, tn, startRelay(t, h, tn))
		cluster := kubernetes.Open(t, fixture.FakenetAdmin(t, tn))
		identity := tn.NewMachineIdentity(t)
		attached, err := tn.Admin.API.AttachKubernetesAuthWithResponse(t.Context(), identity.ID.String(), api.AttachKubernetesAuthJSONRequestBody{
			KubernetesHost:       new(kubernetes.Service.TunnelURL()),
			TokenReviewerJwt:     new(cluster.ReviewerJWT),
			GatewayId:            new(gw.ID),
			VerifyTlsCertificate: new(false),
			AllowedNamespaces:    "payments",
			AllowedNames:         "api",
		})
		require.NoError(t, err)
		require.NotNilf(t, attached.JSON200, "attaching Kubernetes auth through the gateway returned %d: %s", attached.StatusCode(), apierr.Body(attached.Body))
		saToken := cluster.ServiceAccountToken(t, "payments", "api")

		// Action
		res, err := tn.Anonymous(t).LoginWithKubernetesAuthWithResponse(t.Context(), api.LoginWithKubernetesAuthJSONRequestBody{
			IdentityId: identity.ID.String(), Jwt: saToken,
		})

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "login returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		cluster.ExpectEvent(t, func(e kubernetes.TokenReviewed) bool { return e.Token == saToken })
	})

	t.Run("should refuse deleting a gateway another gateway reviews Kubernetes tokens through, naming it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		reviewer, _ := healthyGateway(t, h, tn, startRelay(t, h, tn))
		cluster := kubernetes.Open(t, fixture.FakenetAdmin(t, tn))
		dependentName := gatewayName()
		dependent := createGateway(t, tn.Admin.API, dependentName, map[string]any{
			"method":               "kubernetes",
			"kubernetesHost":       kubernetes.Service.TunnelURL(),
			"tokenReviewerJwt":     cluster.ReviewerJWT,
			"gatewayId":            reviewer.ID,
			"verifyTlsCertificate": false,
			"allowedNamespaces":    "infisical",
			"allowedNames":         "gateway",
		})
		requireStatus(t, http.StatusOK, dependent.StatusCode(), dependent.Body)

		// Action
		res, err := tn.Admin.API.DeleteGatewayWithResponse(t.Context(), reviewer.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "reviews Kubernetes tokens for '"+dependentName+"'")
		require.Contains(t, gatewayIDs(t, tn.Admin.API), reviewer.ID)
	})
}
