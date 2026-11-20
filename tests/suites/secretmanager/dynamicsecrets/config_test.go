package dynamicsecrets_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestDynamicSecret_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a code from the configured secret when a totp dynamic secret is leased", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, totpProvider())

		// Action
		l := ds.lease(t, nil, "")

		// Assert
		require.Contains(t, totpCodes(t, totpSecret), l.Data["TOTP"])
		require.Equal(t, []string{l.ID}, ds.leaseIDs(t))
	})

	t.Run("should refuse and keep the original when the same name is created twice in a folder", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, totpProvider(), defaultTTL("1h"))

		// Action
		res, _ := createDynamicSecret(t, tn.Admin.API, proj, totpProvider(), named(ds.Name), defaultTTL("2h"))

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "already exists under the folder")
		got := ds.get(t, tn.Admin.API)
		require.NotNil(t, got.JSON200)
		require.Equal(t, "1h", got.JSON200.DynamicSecret.DefaultTTL)
	})

	t.Run("should refuse naming the path when the folder does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, _ := createDynamicSecret(t, tn.Admin.API, proj, totpProvider(), atPath("/missing"))

		// Assert
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "/missing")
		require.Empty(t, names(t, proj, "/"))
	})

	t.Run("should refuse and create nothing when both a gateway and a gateway pool are set", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		target := fixture.OpenPostgresTarget(t, tn)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		inputs := postgresInputs(target)
		inputs["gatewayId"] = uuid.NewString()
		inputs["gatewayPoolId"] = uuid.NewString()

		// Action
		res, _ := createDynamicSecret(t, tn.Admin.API, proj, provider{"type": "sql-database", "inputs": inputs})

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "Cannot specify both a gateway and a gateway pool")
		require.Empty(t, names(t, proj, "/"))
	})

	t.Run("should refuse naming the gateway and create nothing when the gateway does not exist", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		target := fixture.OpenPostgresTarget(t, tn)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		gatewayID := uuid.NewString()
		inputs := postgresInputs(target)
		inputs["gatewayId"] = gatewayID

		// Action
		res, _ := createDynamicSecret(t, tn.Admin.API, proj, provider{"type": "sql-database", "inputs": inputs})

		// Assert
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), gatewayID)
		require.Empty(t, names(t, proj, "/"))
	})

	t.Run("should refuse and create nothing when the username template uses an unknown variable", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, _ := createDynamicSecret(t, tn.Admin.API, proj, totpProvider(), usernameTemplate("{{identity.email}}"))

		// Assert
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		require.Empty(t, names(t, proj, "/"))
	})

	t.Run("should refuse naming the setting and create nothing when AWS IAM temporary credentials use IRSA on an instance without it", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The harness leaves KUBERNETES_AUTO_FETCH_SERVICE_ACCOUNT_TOKEN at its default, off,
			and the refusal comes before any call to AWS, so no fake is needed.`)

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		inputs := map[string]any{"method": "irsa", "credentialType": "temporary-credentials", "region": "us-east-1"}

		// Action
		res, _ := createDynamicSecret(t, tn.Admin.API, proj, provider{"type": "aws-iam", "inputs": inputs})

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Message(res.Body), "KUBERNETES_AUTO_FETCH_SERVICE_ACCOUNT_TOKEN is not enabled")
		require.Empty(t, names(t, proj, "/"))
	})
}

func TestDynamicSecret_Inputs(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should leave the private key out of a read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, sshProvider())

		// Action
		in := ds.inputs(t)

		// Assert
		require.NotContains(t, in, "caPrivateKey")
		require.NotEmpty(t, in["caPublicKey"], "the read does not carry the public half either: %v", in)
	})

	t.Run("should keep the stored private key when an update leaves it out", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		ds := newDynamicSecret(t, proj, sshProvider())
		before := ds.inputs(t)["caPublicKey"]

		// Action
		res := ds.update(t, map[string]any{"inputs": map[string]any{"principals": []string{"deploy", "ops"}}})

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		after := ds.inputs(t)
		require.Equal(t, before, after["caPublicKey"], "the CA was replaced, so the stored private key was lost")
		require.Equal(t, []any{"deploy", "ops"}, after["principals"])
	})
}
