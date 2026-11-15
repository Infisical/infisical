package instancerelay_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestInstanceRelay(t *testing.T) {
	h := harness.From(t)

	t.Run("should list an instance relay registered with the auth secret to every organization", func(t *testing.T) {
		// Setup
		first, second := h.NewTenant(t), h.NewTenant(t)
		name := "instance-" + id.Short()

		// Action
		res, err := first.Client(t, relayAuthSecret).RegisterInstanceRelayWithResponse(t.Context(),
			api.RegisterInstanceRelayJSONRequestBody{Name: name, Host: name + ".relay.test"})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "registering: %s", apierr.Body(res.Body))
		for _, tn := range []*harness.Tenant{first, second} {
			relay := relayNamed(t, tn, name)
			require.NotNilf(t, relay, "%s does not list the instance relay", tn.OrgSlug)
			require.Nil(t, relay.OrgId)
		}
	})

	t.Run("should refuse an organization admin deleting an instance relay and keep it", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		name := "instance-" + id.Short()
		registered, err := tn.Client(t, relayAuthSecret).RegisterInstanceRelayWithResponse(t.Context(),
			api.RegisterInstanceRelayJSONRequestBody{Name: name, Host: name + ".relay.test"})
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, registered.StatusCode(), "registering: %s", apierr.Body(registered.Body))
		relay := relayNamed(t, tn, name)
		require.NotNil(t, relay)

		// Action
		res, err := tn.Admin.API.DeleteRelayWithResponse(t.Context(), relay.Id.String())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "deleting: %s", apierr.Body(res.Body))
		require.NotNil(t, relayNamed(t, tn, name))
	})
}

type relay struct {
	Id    uuid.UUID
	OrgId *uuid.UUID
}

func relayNamed(t *testing.T, tn *harness.Tenant, name string) *relay {
	t.Helper()
	res, err := tn.Admin.API.GetRelaysWithResponse(t.Context())
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing relays returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	for _, r := range *res.JSON200 {
		if r.Name == name {
			return &relay{Id: r.Id, OrgId: r.OrgId}
		}
	}
	return nil
}
