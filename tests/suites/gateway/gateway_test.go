package gateway_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/kubernetes"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestGateway_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	methods := []struct {
		method string
		body   map[string]any
		check  func(t *testing.T, config map[string]any)
	}{
		{
			method: "token",
			body:   tokenAuth(),
			check:  func(*testing.T, map[string]any) {},
		},
		{
			method: "aws",
			body:   awsAuth(),
			check: func(t *testing.T, config map[string]any) {
				require.Equal(t, "arn:aws:iam::123456789012:role/gateway", config["allowedPrincipalArns"])
			},
		},
		{
			method: "gcp",
			body:   gcpAuth(),
			check: func(t *testing.T, config map[string]any) {
				require.Equal(t, "gateway@project.iam.gserviceaccount.com", config["allowedServiceAccounts"])
			},
		},
	}
	for _, m := range methods {
		t.Run("should create a gateway that authenticates with "+m.method, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			name := gatewayName()

			// Action
			res := createGateway(t, tn.Admin.API, name, m.body)

			// Assert
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
			created := decodeGateway(t, res.Body)
			stored := getGateway(t, tn, created.ID)
			require.Equal(t, name, stored.Name)
			require.Equal(t, m.method, stored.AuthMethod.Method)
			m.check(t, stored.AuthMethod.Config)
		})
	}

	t.Run("should create a gateway that authenticates with kubernetes against the cluster it names", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		cluster := kubernetes.Open(t, fixture.FakenetAdmin(t, tn))
		name := gatewayName()

		// Action
		res := createGateway(t, tn.Admin.API, name, map[string]any{
			"method":            "kubernetes",
			"kubernetesHost":    kubernetes.Service.URL(),
			"tokenReviewerJwt":  cluster.ReviewerJWT,
			"allowedNamespaces": "infisical",
			"allowedNames":      "gateway",
		})

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		stored := getGateway(t, tn, decodeGateway(t, res.Body).ID)
		require.Equal(t, "kubernetes", stored.AuthMethod.Method)
		require.Equal(t, "infisical", stored.AuthMethod.Config["allowedNamespaces"])
		require.Equal(t, "gateway", stored.AuthMethod.Config["allowedNames"])
	})

	invalid := []struct {
		name       string
		authMethod map[string]any
	}{
		{"an unknown auth method", map[string]any{"method": "ldap"}},
		{"aws auth with no allowlist", map[string]any{"method": "aws", "allowedPrincipalArns": "", "allowedAccountIds": ""}},
		{"kubernetes auth with no host when Infisical reviews the token", map[string]any{
			"method": "kubernetes", "allowedNamespaces": "infisical", "allowedNames": "gateway",
		}},
		{"no auth method", nil},
	}
	for _, c := range invalid {
		t.Run("should refuse "+c.name+" and create nothing", func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			body := map[string]any{"name": gatewayName()}
			if c.authMethod != nil {
				body["authMethod"] = c.authMethod
			}

			// Action
			res, err := tn.Admin.API.CreateGatewayWithBodyWithResponse(t.Context(), "application/json", jsonBody(t, body))

			// Assert
			require.NoError(t, err)
			requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
			require.Empty(t, gatewayIDs(t, tn.Admin.API))
		})
	}

	t.Run("should refuse a second gateway with the same name and keep the first", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		first := newGateway(t, tn)

		// Action
		res := createGateway(t, tn.Admin.API, first.Name, awsAuth())

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "already exists")
		require.Equal(t, []uuid.UUID{first.ID}, gatewayIDs(t, tn.Admin.API))
		require.Equal(t, "token", getGateway(t, tn, first.ID).AuthMethod.Method)
	})

	t.Run("should refuse a 51st gateway in the organization", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		for range 50 {
			newGateway(t, tn)
		}

		// Action
		res := createGateway(t, tn.Admin.API, gatewayName(), tokenAuth())

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "maximum limit of 50 gateways")
		require.Len(t, gatewayIDs(t, tn.Admin.API), 50)
	})
}

func TestGateway_OtherOrganization(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	operations := []struct {
		name string
		call func(t *testing.T, c *api.ClientWithResponses, gatewayID uuid.UUID) (int, []byte)
	}{
		{"get", func(t *testing.T, c *api.ClientWithResponses, gatewayID uuid.UUID) (int, []byte) {
			res, err := c.GetGatewayWithResponse(t.Context(), gatewayID)
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"rename", func(t *testing.T, c *api.ClientWithResponses, gatewayID uuid.UUID) (int, []byte) {
			res, err := c.UpdateGatewayWithBodyWithResponse(t.Context(), gatewayID, "application/json",
				jsonBody(t, map[string]any{"name": "taken-over"}))
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"delete", func(t *testing.T, c *api.ClientWithResponses, gatewayID uuid.UUID) (int, []byte) {
			res, err := c.DeleteGatewayWithResponse(t.Context(), gatewayID.String())
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"mint an enrollment token for", func(t *testing.T, c *api.ClientWithResponses, gatewayID uuid.UUID) (int, []byte) {
			res, err := c.MintGatewayEnrollmentTokenWithResponse(t.Context(), gatewayID)
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
		{"revoke", func(t *testing.T, c *api.ClientWithResponses, gatewayID uuid.UUID) (int, []byte) {
			res, err := c.RevokeGatewayAccessWithResponse(t.Context(), gatewayID)
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		}},
	}
	for _, op := range operations {
		t.Run("should answer 404 and change nothing when another organization's admin tries to "+op.name+" a gateway", func(t *testing.T) {
			t.Parallel()

			// Setup
			owner := h.NewTenant(t)
			outsider := h.NewTenant(t)
			gw := newGateway(t, owner)
			running := enrollGateway(t, owner, gw.ID)

			// Action
			status, body := op.call(t, outsider.Admin.API, gw.ID)

			// Assert
			requireStatus(t, http.StatusNotFound, status, body)
			stored := getGateway(t, owner, gw.ID)
			require.Equal(t, gw.Name, stored.Name)
			status, body = gatewayTokenStatus(t, running)
			requireStatus(t, http.StatusOK, status, body)
		})
	}
}

func TestGateway_MemberPermission(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should let an organization member create a gateway", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))

		// Action
		res := createGateway(t, member.API, gatewayName(), tokenAuth())

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, []uuid.UUID{decodeGateway(t, res.Body).ID}, gatewayIDs(t, tn.Admin.API))
	})

	t.Run("should refuse an organization member minting an enrollment token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))
		created := createGateway(t, member.API, gatewayName(), tokenAuth())
		requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)
		gw := decodeGateway(t, created.Body)

		// Action
		res, err := member.API.MintGatewayEnrollmentTokenWithResponse(t.Context(), gw.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.False(t, getGateway(t, tn, gw.ID).CanRevoke, "a pending enrollment token exists")
	})

	t.Run("should refuse an organization member deleting a gateway", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))
		gw := newGateway(t, tn)

		// Action
		res, err := member.API.DeleteGatewayWithResponse(t.Context(), gw.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, []uuid.UUID{gw.ID}, gatewayIDs(t, tn.Admin.API))
	})

	t.Run("should refuse an organization member revoking a gateway and keep it connected", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))
		gw := newGateway(t, tn)
		running := enrollGateway(t, tn, gw.ID)

		// Action
		res, err := member.API.RevokeGatewayAccessWithResponse(t.Context(), gw.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		status, body := gatewayTokenStatus(t, running)
		requireStatus(t, http.StatusOK, status, body)
	})
}

func TestGateway_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse deleting a gateway an app connection routes through, naming the connection", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		conn := fixture.NewAppConnection(t, tn, fixture.PostgresAppConnection(fixture.OpenPostgresTarget(t, tn)))
		attached := updateConnection(t, tn.Admin.API, conn.ID, api.UpdatePostgresAppConnectionJSONRequestBody{GatewayId: &gw.ID})
		requireStatus(t, http.StatusOK, attached.StatusCode(), attached.Body)

		// Action
		res, err := tn.Admin.API.DeleteGatewayWithResponse(t.Context(), gw.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), conn.Name)
		require.Equal(t, []uuid.UUID{gw.ID}, gatewayIDs(t, tn.Admin.API))
		require.Equal(t, &gw.ID, connectionRouteOf(t, tn, conn.ID).GatewayID)
	})

	t.Run("should delete a gateway once no app connection routes through it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		connID := postgresConnection(t, tn)
		attached := updateConnection(t, tn.Admin.API, connID, api.UpdatePostgresAppConnectionJSONRequestBody{GatewayId: &gw.ID})
		requireStatus(t, http.StatusOK, attached.StatusCode(), attached.Body)
		detached, err := tn.Admin.API.UpdatePostgresAppConnectionWithBodyWithResponse(t.Context(), connID,
			"application/json", jsonBody(t, map[string]any{"gatewayId": nil}))
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, detached.StatusCode(), detached.Body)
		require.Nil(t, connectionRouteOf(t, tn, connID).GatewayID)

		// Action
		res, err := tn.Admin.API.DeleteGatewayWithResponse(t.Context(), gw.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Empty(t, gatewayIDs(t, tn.Admin.API))
	})
}

func TestGateway_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list only the organization's own gateways", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)
		mine := newGateway(t, tn)
		newGateway(t, other)

		// Action
		listed := gatewayIDs(t, tn.Admin.API)

		// Assert
		require.Equal(t, []uuid.UUID{mine.ID}, listed)
	})

	t.Run("should show the app connection that routes through a gateway", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		gw := newGateway(t, tn)
		connID := postgresConnection(t, tn)
		attached := updateConnection(t, tn.Admin.API, connID, api.UpdatePostgresAppConnectionJSONRequestBody{GatewayId: &gw.ID})
		requireStatus(t, http.StatusOK, attached.StatusCode(), attached.Body)

		// Action
		res, err := tn.Admin.API.GetGatewayConnectedResourcesWithResponse(t.Context(), gw.ID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Len(t, res.JSON200.AppConnections, 1)
		require.Equal(t, connID.String(), res.JSON200.AppConnections[0].Id)
		list, err := tn.Admin.API.ListGatewaysWithResponse(t.Context())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, list.StatusCode(), list.Body)
		require.Len(t, *list.JSON200, 1)
		require.EqualValues(t, 1, (*list.JSON200)[0].ConnectedResourcesCount)
	})
}
