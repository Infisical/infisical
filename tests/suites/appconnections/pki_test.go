package appconnections_test

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fakes/azure"
	"github.com/Infisical/infisical/tests/fakes/azureadcs"
	"github.com/Infisical/infisical/tests/fakes/chef"
	"github.com/Infisical/infisical/tests/fakes/digicert"
	"github.com/Infisical/infisical/tests/fakes/f5bigip"
	"github.com/Infisical/infisical/tests/fakes/godaddy"
	"github.com/Infisical/infisical/tests/fakes/imperva"
	"github.com/Infisical/infisical/tests/fakes/kemp"
	"github.com/Infisical/infisical/tests/fakes/netscaler"
	"github.com/Infisical/infisical/tests/fakes/nutanix"
	"github.com/Infisical/infisical/tests/fakes/panos"
	"github.com/Infisical/infisical/tests/fakes/venafitpp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type createConnection func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error)

// refusedConnection is one PKI-only connection kind sent a credential its provider
// rejects.
type refusedConnection struct {
	kind string
	// body is the create request for a credential the provider rejects. Where the fake
	// would accept any credential, it first has the fake refuse this one.
	body   func(t *testing.T, admin, credential string) map[string]any
	create createConnection
	want   string
	// why records a refusal message that may not be the intended one.
	why string
}

func applianceBody(host string) func(*testing.T, string, string) map[string]any {
	return func(_ *testing.T, _, credential string) map[string]any {
		return map[string]any{"method": "basic-auth", "credentials": map[string]any{
			"hostname": host, "port": 443, "username": credential, "password": "wrong-" + credential,
		}}
	}
}

func TestPkiAppConnection_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	cases := []refusedConnection{
		{
			kind: "F5 BIG-IP",
			body: applianceBody(f5bigip.Service.Host()),
			create: func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
				res, err := c.CreateF5BigIpAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
				if err != nil {
					return 0, nil, err
				}
				return res.StatusCode(), res.Body, nil
			},
			want: "Unable to validate connection: Request failed with status code 401",
		},
		{
			kind: "NetScaler",
			body: applianceBody(netscaler.Service.Host()),
			create: func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
				res, err := c.CreateNetscalerAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
				if err != nil {
					return 0, nil, err
				}
				return res.StatusCode(), res.Body, nil
			},
			want: "Unable to validate connection: Request failed with status code 401",
		},
		{
			kind: "Kemp LoadMaster",
			body: applianceBody(kemp.Service.Host()),
			create: func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
				res, err := c.CreateKempLoadmasterAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
				if err != nil {
					return 0, nil, err
				}
				return res.StatusCode(), res.Body, nil
			},
			want: "Unable to validate connection: invalid username or password",
		},
		{
			kind: "Nutanix Prism Central",
			body: applianceBody(nutanix.Service.Host()),
			create: func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
				res, err := c.CreateNutanixPrismCentralAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
				if err != nil {
					return 0, nil, err
				}
				return res.StatusCode(), res.Body, nil
			},
			want: "Unable to validate Nutanix Prism Central connection: Request failed with status code 401",
		},
		{
			kind: "Palo Alto Networks",
			body: applianceBody(panos.Service.Host()),
			create: func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
				res, err := c.CreatePaloAltoNetworksAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
				if err != nil {
					return 0, nil, err
				}
				return res.StatusCode(), res.Body, nil
			},
			want: "Unable to validate connection: Invalid Credential",
		},
		{
			kind: "Imperva",
			body: func(_ *testing.T, _, credential string) map[string]any {
				return map[string]any{"method": "api-key", "credentials": map[string]any{
					"apiId": credential, "apiKey": "wrong-" + imperva.APIKey(credential),
				}}
			},
			create: func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
				res, err := c.CreateImpervaAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
				if err != nil {
					return 0, nil, err
				}
				return res.StatusCode(), res.Body, nil
			},
			want: "Unable to validate connection: Unauthorized: The API ID and API key do not match. Check that the key is enabled under User Management > My Profile > API keys (Imperva creates keys disabled), that both the ID and the key were copied in full, that the key's role includes the Manage SSL Certificates permission, and that the account ID names an account the key can reach",
		},
		{
			kind: "Chef",
			body: func(t *testing.T, admin, credential string) map[string]any {
				registered := rsaKey(t)
				der, err := x509.MarshalPKIXPublicKey(&registered.PublicKey)
				require.NoError(t, err)
				chef.Open(t, admin, credential).Seed(t, chef.WithUser(fixture.ChefOrganization(credential),
					string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}))))
				other := rsaKey(t)
				return map[string]any{"method": "user-key", "credentials": map[string]any{
					"orgName": fixture.ChefOrganization(credential), "userName": credential,
					"privateKey": string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(other)})),
				}}
			},
			create: func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
				res, err := c.CreateChefAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
				if err != nil {
					return 0, nil, err
				}
				return res.StatusCode(), res.Body, nil
			},
			want: "Failed to validate Chef credentials: Request failed with status code 401",
		},
		{
			kind: "Venafi TPP",
			body: func(_ *testing.T, _, credential string) map[string]any {
				return map[string]any{"method": "oauth", "credentials": map[string]any{
					"tppUrl": venafitpp.URL(credential), "clientId": "infisical",
					"username": credential, "password": "wrong-" + venafitpp.Password(credential),
				}}
			},
			create: func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
				res, err := c.CreateVenafiTppAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
				if err != nil {
					return 0, nil, err
				}
				return res.StatusCode(), res.Body, nil
			},
			want: "Failed to validate Venafi TPP credentials: Username/password combination not valid",
		},
		{
			kind: "Azure AD CS",
			body: func(_ *testing.T, _, credential string) map[string]any {
				return map[string]any{"method": "username-password", "credentials": map[string]any{
					"adcsUrl": azureadcs.URL(credential), "username": credential,
					"password": "wrong-" + azureadcs.Password(credential),
				}}
			},
			create: func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
				res, err := c.CreateAzureAdcsAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
				if err != nil {
					return 0, nil, err
				}
				return res.StatusCode(), res.Body, nil
			},
			why: `[BUG?] The server answers the wrong password with an NTLM 401, yet the refusal
				says the server could not be reached rather than that the credentials were wrong.`,
			want: "Could not connect to ADCS server. Please verify the server URL and that Web Enrollment is enabled.",
		},
		{
			kind: "GoDaddy",
			body: func(_ *testing.T, _, credential string) map[string]any {
				return map[string]any{"method": "api-key", "credentials": map[string]any{
					"apiKey": credential, "apiSecret": "wrong-" + godaddy.APISecret(credential),
				}}
			},
			create: func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
				res, err := c.CreateGodaddyAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
				if err != nil {
					return 0, nil, err
				}
				return res.StatusCode(), res.Body, nil
			},
			want: "GoDaddy rejected the credentials (401 Unauthorized) \u2014 verify the API key and secret",
		},
		{
			// The fake accepts any API key, so the test has DigiCert refuse this one.
			kind: "DigiCert",
			body: func(t *testing.T, admin, credential string) map[string]any {
				digicert.Open(t, admin, credential).Fail(t, http.MethodGet, "/services/v2/organization", http.StatusUnauthorized,
					fakenet.Body(`{"errors":[{"code":"invalid_api_key","message":"The specified API key is invalid."}]}`))
				return map[string]any{"method": "api-key", "credentials": map[string]any{"apiKey": credential, "region": "us"}}
			},
			create: func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
				res, err := c.CreateDigicertAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
				if err != nil {
					return 0, nil, err
				}
				return res.StatusCode(), res.Body, nil
			},
			want: "Failed to validate credentials: The specified API key is invalid. (invalid_api_key)",
		},
		{
			// The fake grants a token for any client secret, so the test has the tenant
			// refuse this one.
			kind: "Azure Key Vault",
			body: func(t *testing.T, admin, credential string) map[string]any {
				tenant := uuid.NewSHA1(uuid.NameSpaceURL, []byte("refused-tenant/"+credential)).String()
				azure.Open(t, admin, tenant).Fail(t, http.MethodPost, "/"+tenant+"/oauth2/v2.0/token", http.StatusUnauthorized,
					fakenet.Body(`{"error":"invalid_client","error_description":"AADSTS7000215: Invalid client secret provided."}`))
				return map[string]any{"method": "client-secret", "credentials": map[string]any{
					"tenantId": tenant, "clientId": fixture.AzureClientID(credential), "clientSecret": "wrong-" + credential,
				}}
			},
			create: func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
				res, err := c.CreateAzureKeyVaultAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
				if err != nil {
					return 0, nil, err
				}
				return res.StatusCode(), res.Body, nil
			},
			want: "Failed to get access token: AADSTS7000215: Invalid client secret provided.",
		},
	}

	for _, c := range cases {
		t.Run("should refuse a "+c.kind+" connection whose credentials the provider rejects and store nothing", func(t *testing.T) {
			t.Parallel()
			if c.why != "" {
				spec.Why(t, c.why)
			}

			// Setup
			tn := h.NewTenant(t)
			name := "refused-" + id.Short()
			body := c.body(t, fixture.FakenetAdmin(t, tn), id.Nonce())
			body["name"] = name
			raw, err := json.Marshal(body)
			require.NoError(t, err)

			// Action
			code, resBody, err := c.create(t.Context(), tn.Admin.API, raw)

			// Assert
			require.NoError(t, err)
			require.Equalf(t, http.StatusBadRequest, code, "answered: %s", apierr.Body(resBody))
			require.Equal(t, c.want, apierr.Message(resBody))
			require.NotContains(t, connectionNames(t, tn), name)
		})
	}
}

func TestPkiAppConnection_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse and keep a connection a certificate sync uses", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		conn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
		aws.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		g := pki.NewApplicationGraph(t, tn, pki.AllowAll(t))
		body := api.CreateAwsCertificateManagerPkiSyncJSONRequestBody{
			Name:          "acm-" + id.Short(),
			ConnectionId:  conn.ID.String(),
			ApplicationId: &g.App.ID,
		}
		body.DestinationConfig.Region = api.CreateAwsCertificateManagerPkiSyncJSONBodyDestinationConfigRegionUsEast1
		body.SyncOptions.CertificateNameSchema = "Infisical-{{certificateId}}"
		sync, err := tn.Admin.API.CreateAwsCertificateManagerPkiSyncWithResponse(t.Context(), body)
		require.NoError(t, err)
		require.NotNilf(t, sync.JSON200, "creating the sync returned %d: %s", sync.StatusCode(), apierr.Body(sync.Body))

		// Action
		res, err := tn.Admin.API.DeleteAwsAppConnectionWithResponse(t.Context(), conn.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusBadRequest, res.StatusCode(), "deleting returned %s", apierr.Body(res.Body))
		require.Equal(t, "Cannot delete App Connection with existing connections. Remove all existing connections and try again.", apierr.Message(res.Body))
		require.Contains(t, connectionNames(t, tn), conn.Name)
		got, err := tn.Admin.API.GetAwsCertificateManagerPkiSyncWithResponse(t.Context(), sync.JSON200.Id.String())
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, got.StatusCode(), "reading the sync returned %s", apierr.Body(got.Body))
	})
}

func rsaKey(t *testing.T) *rsa.PrivateKey {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(t, err)
	return key
}

// connectionNames is the name of every connection the organization holds, read from
// the raw body: each item is a union whose As… methods accept any branch.
func connectionNames(t *testing.T, tn *harness.Tenant) []string {
	t.Helper()
	res, err := tn.Admin.API.ListAppConnectionsWithResponse(t.Context(), nil)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "listing connections returned %s", apierr.Body(res.Body))
	var out struct {
		AppConnections []struct {
			Name string `json:"name"`
		} `json:"appConnections"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &out))
	names := make([]string, 0, len(out.AppConnections))
	for _, c := range out.AppConnections {
		names = append(names, c.Name)
	}
	return names
}
