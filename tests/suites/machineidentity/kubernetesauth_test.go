package machineidentity_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/kubernetes"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestKubernetesAuth_Login(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a token for an allowed namespace, service account and audience", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		cluster := kubernetes.Open(t, fixture.FakenetAdmin(t, tn))
		identityID := fedNewIdentity(t, tn)
		fedAttachKubernetes(t, tn, identityID, cluster)
		saToken := cluster.ServiceAccountToken(t, "payments", "api", "infisical")

		// Action
		res := fedLoginKubernetes(t, tn, identityID, saToken)

		// Assert
		require.NotNilf(t, res.JSON200, "login returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		fedRequireTokenWorks(t, tn, res.JSON200.AccessToken)
		cluster.ExpectEvent(t, func(e kubernetes.TokenReviewed) bool {
			return e.Token == saToken && len(e.Audiences) == 1 && e.Audiences[0] == "infisical"
		})
	})

	refusals := []struct {
		name    string
		message string
		token   func(t *testing.T, cluster *kubernetes.ControlPlane) string
	}{
		{
			name: "should refuse a service account in a namespace outside the allowlist and issue no token", message: "Access denied: K8s namespace not allowed.",
			token: func(t *testing.T, cluster *kubernetes.ControlPlane) string {
				return cluster.ServiceAccountToken(t, "billing", "api", "infisical")
			},
		},
		{
			name: "should refuse a service account name outside the allowlist and issue no token", message: "Access denied: K8s name not allowed.",
			token: func(t *testing.T, cluster *kubernetes.ControlPlane) string {
				return cluster.ServiceAccountToken(t, "payments", "worker", "infisical")
			},
		},
		{
			name: "should refuse a token for another audience and issue no token", message: "Access denied: K8s audience not allowed.",
			token: func(t *testing.T, cluster *kubernetes.ControlPlane) string {
				return cluster.ServiceAccountToken(t, "payments", "api", "vault")
			},
		},
		{
			name: "should refuse a token TokenReview reports as unauthenticated and issue no token", message: "Kubernetes token not authenticated",
			token: func(*testing.T, *kubernetes.ControlPlane) string { return "sa-the-cluster-never-issued" },
		},
	}
	for _, tc := range refusals {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			cluster := kubernetes.Open(t, fixture.FakenetAdmin(t, tn))
			identityID := fedNewIdentity(t, tn)
			fedAttachKubernetes(t, tn, identityID, cluster)

			// Action
			res := fedLoginKubernetes(t, tn, identityID, tc.token(t, cluster))

			// Assert
			fedRequireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
			require.Equal(t, tc.message, apierr.Message(res.Body))
			fedRequireNeverLoggedIn(t, tn, identityID)
		})
	}

	t.Run("should answer 404 when the identity has no Kubernetes auth", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		cluster := kubernetes.Open(t, fixture.FakenetAdmin(t, tn))
		identityID := fedNewIdentity(t, tn)

		// Action
		res := fedLoginKubernetes(t, tn, identityID, cluster.ServiceAccountToken(t, "payments", "api", "infisical"))

		// Assert
		fedRequireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Equal(t, "Kubernetes auth method not found for identity, did you configure Kubernetes auth?", apierr.Message(res.Body))
		fedRequireNeverLoggedIn(t, tn, identityID)
	})
}

func TestKubernetesAuth_Attach(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse attaching when the cluster rejects the token reviewer JWT, and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		cluster := kubernetes.Open(t, fixture.FakenetAdmin(t, tn))
		cluster.RejectReviewer(t)
		identityID := fedNewIdentity(t, tn)

		// Action
		res, err := tn.Admin.API.AttachKubernetesAuthWithResponse(t.Context(), identityID.String(), fedKubernetesBindings(cluster))

		// Assert
		require.NoError(t, err)
		fedRequireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "Ensure the service account has the 'system:auth-delegator' ClusterRole binding.")
		require.NotContains(t, fedAuthMethods(t, tn, identityID), "kubernetes-auth")
	})

	t.Run("should refuse gateway token review when the plan does not include gateways, and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.Gateway)))
		identityID := fedNewIdentity(t, tn)
		gatewayMode := api.AttachKubernetesAuthJSONBodyTokenReviewMode("gateway")

		// Action
		res, err := tn.Admin.API.AttachKubernetesAuthWithResponse(t.Context(), identityID.String(), api.AttachKubernetesAuthJSONRequestBody{
			TokenReviewMode:   &gatewayMode,
			GatewayId:         new(uuid.New()),
			AllowedNamespaces: "payments",
			AllowedNames:      "api",
		})

		// Assert
		require.NoError(t, err)
		fedRequireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Your current plan does not support gateway usage with identity k8s auth. Please upgrade your plan or contact Infisical Sales for assistance.",
			apierr.Message(res.Body))
		require.NotContains(t, fedAuthMethods(t, tn, identityID), "kubernetes-auth")
	})
}

func fedKubernetesBindings(cluster *kubernetes.ControlPlane) api.AttachKubernetesAuthJSONRequestBody {
	return api.AttachKubernetesAuthJSONRequestBody{
		KubernetesHost:    new(kubernetes.Service.URL()),
		TokenReviewerJwt:  new(cluster.ReviewerJWT),
		AllowedNamespaces: "payments",
		AllowedNames:      "api",
		AllowedAudience:   new("infisical"),
	}
}

func fedAttachKubernetes(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, cluster *kubernetes.ControlPlane) {
	t.Helper()
	res, err := tn.Admin.API.AttachKubernetesAuthWithResponse(t.Context(), identityID.String(), fedKubernetesBindings(cluster))
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "attaching Kubernetes auth returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
}

func fedLoginKubernetes(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, jwt string) *api.LoginWithKubernetesAuthResponse {
	t.Helper()
	res, err := tn.Anonymous(t).LoginWithKubernetesAuthWithResponse(t.Context(), api.LoginWithKubernetesAuthJSONRequestBody{
		IdentityId: identityID.String(), Jwt: jwt,
	})
	require.NoError(t, err)
	return res
}
