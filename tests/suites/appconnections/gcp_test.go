package appconnections_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/gcp"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	openapi_types "github.com/oapi-codegen/runtime/types"
	"github.com/stretchr/testify/require"
)

const gcpProviderID = "infisical"

func TestGcpAppConnection_WorkloadIdentityFederationCreate(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the issuer, subject and audience to configure without contacting GCP when created", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		pool := newGcpPool(t, tn)
		provider := pool.Provider(gcpProviderID)

		// Action
		res, err := tn.Admin.API.CreateGcpAppConnectionWithBodyWithResponse(t.Context(), "application/json",
			gcpWIFCreateBody(t, "", provider, "deployer@acme.iam.gserviceaccount.com"))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "creating the connection returned %s", apierr.Body(res.Body))
		conn := readGcpWIF(t, res.Body)
		require.Equal(t, gcpFederatedCredential{
			IssuerURL:         gcpIssuer(h, tn),
			SubjectIdentifier: "app-connection:" + conn.ID.String(),
			Audience:          "https://iam.googleapis.com/" + provider,
		}, conn.Credentials.FederatedCredential)
		require.Empty(t, pool.STS.Calls(t), "creating the connection called GCP's Security Token Service")
		require.Empty(t, pool.IAMCredentials.Calls(t), "creating the connection called GCP's IAM Credentials API")
	})
}

func TestGcpAppConnection_WorkloadIdentityFederationVerify(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should verify when the service account trusts the connection's subject", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		pool := newGcpPool(t, tn)
		sa := "deployer@acme.iam.gserviceaccount.com"
		conn := newGcpWIFConnection(t, tn, proj.ID, pool, sa)
		trustGcpIssuer(t, h, pool, conn)
		subject := conn.Credentials.FederatedCredential.SubjectIdentifier
		pool.GrantWorkloadIdentityUser(t, sa, pool.Principal(subject))

		// Action
		res := verifyGcpWIF(t, tn, conn)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "verifying returned %s", apierr.Body(res.Body))
		exchanged := pool.STS.ExpectEvent[gcp.TokenExchanged](t, nil)
		require.Equal(t, subject, exchanged.Subject)
		require.Equal(t, []string{conn.Credentials.FederatedCredential.Audience}, exchanged.Audience)
		require.Equal(t, map[string]string{"project_id": proj.ID}, exchanged.Attributes)
		issued := pool.IAMCredentials.ExpectEvent[gcp.AccessTokenIssued](t, nil)
		require.Equal(t, sa, issued.ServiceAccount)
		require.Equal(t, subject, issued.Subject)
	})

	t.Run("should refuse and keep the connection when the service account only trusts another project's connection", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		trusted := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		other := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		pool := newGcpPool(t, tn)
		sa := "deployer@acme.iam.gserviceaccount.com"
		trustedConn := newGcpWIFConnection(t, tn, trusted.ID, pool, sa)
		conn := newGcpWIFConnection(t, tn, other.ID, pool, sa)
		trustGcpIssuer(t, h, pool, conn)
		pool.GrantWorkloadIdentityUser(t, sa, pool.Principal(trustedConn.Credentials.FederatedCredential.SubjectIdentifier))

		// Action
		res := verifyGcpWIF(t, tn, conn)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, gcpDeniedMessage(sa, conn), apierr.Message(res.Body))
		require.Equal(t, conn, getGcpWIF(t, tn, conn.ID))
		pool.IAMCredentials.ExpectNoEvent[gcp.AccessTokenIssued](t, nil)
	})

	t.Run("should verify every connection in a project when the service account trusts that project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		pool := newGcpPool(t, tn)
		sa := "deployer@acme.iam.gserviceaccount.com"
		first := newGcpWIFConnection(t, tn, proj.ID, pool, sa)
		second := newGcpWIFConnection(t, tn, proj.ID, pool, sa)
		trustGcpIssuer(t, h, pool, first)
		pool.GrantWorkloadIdentityUser(t, sa, pool.PrincipalSet("project_id", proj.ID))

		// Action
		firstRes := verifyGcpWIF(t, tn, first)
		secondRes := verifyGcpWIF(t, tn, second)

		// Assert
		require.Equalf(t, http.StatusOK, firstRes.StatusCode(), "verifying the first returned %s", apierr.Body(firstRes.Body))
		require.Equalf(t, http.StatusOK, secondRes.StatusCode(), "verifying the second returned %s", apierr.Body(secondRes.Body))
		for _, c := range []gcpWIF{first, second} {
			subject := c.Credentials.FederatedCredential.SubjectIdentifier
			pool.IAMCredentials.ExpectEvent[gcp.AccessTokenIssued](t, func(e gcp.AccessTokenIssued) bool { return e.Subject == subject })
		}
	})

	t.Run("should refuse an organization connection when the service account only trusts a project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		pool := newGcpPool(t, tn)
		sa := "deployer@acme.iam.gserviceaccount.com"
		conn := newGcpWIFConnection(t, tn, "", pool, sa)
		trustGcpIssuer(t, h, pool, conn)
		pool.GrantWorkloadIdentityUser(t, sa, pool.PrincipalSet("project_id", proj.ID))

		// Action
		res := verifyGcpWIF(t, tn, conn)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, gcpDeniedMessage(sa, conn), apierr.Message(res.Body))
		exchanged := pool.STS.ExpectEvent[gcp.TokenExchanged](t, nil)
		require.NotContains(t, exchanged.Attributes, "project_id", "an organization connection's token carried a project_id")
		require.Equal(t, conn, getGcpWIF(t, tn, conn.ID))
	})

	t.Run("should refuse and keep the connection when the provider trusts another organization's issuer", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn, otherOrg := h.NewTenant(t), h.NewTenant(t)
		pool := newGcpPool(t, tn)
		sa := "deployer@acme.iam.gserviceaccount.com"
		conn := newGcpWIFConnection(t, tn, "", pool, sa)
		pool.TrustIssuer(t, gcpProviderID, gcpIssuer(h, otherOrg), h.App().BaseURL(infra.Internal))
		pool.GrantWorkloadIdentityUser(t, sa, pool.Principal(conn.Credentials.FederatedCredential.SubjectIdentifier))

		// Action
		res := verifyGcpWIF(t, tn, conn)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		issuer := gcpIssuer(h, tn)
		require.Equal(t, "GCP workload identity provider '"+conn.Credentials.WorkloadIdentityProvider+"' rejected the connection's token: "+
			"The issuer in ID Token "+issuer+" does not match the expected ones: "+gcpIssuer(h, otherOrg)+
			". Check that the provider exists and trusts the issuer '"+issuer+"'.", apierr.Message(res.Body))
		require.Equal(t, conn, getGcpWIF(t, tn, conn.ID))
		pool.STS.ExpectNoEvent[gcp.TokenExchanged](t, nil)
	})

	t.Run("should verify with the token exchange alone when no service account is set", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		pool := newGcpPool(t, tn)
		conn := newGcpWIFConnection(t, tn, "", pool, "")
		trustGcpIssuer(t, h, pool, conn)

		// Action
		res := verifyGcpWIF(t, tn, conn)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "verifying returned %s", apierr.Body(res.Body))
		exchanged := pool.STS.ExpectEvent[gcp.TokenExchanged](t, nil)
		require.Equal(t, conn.Credentials.FederatedCredential.SubjectIdentifier, exchanged.Subject)
		require.Empty(t, pool.IAMCredentials.Calls(t), "Infisical asked for a service account token with none configured")
	})
}

// newGcpPool invents a workload identity pool. Its id is the fake's credential, so it
// carries the nonce prefix, cut to GCP's 32 character limit.
func newGcpPool(tt *testing.T, tn *harness.Tenant) *gcp.ControlPlane {
	tt.Helper()
	return gcp.Open(tt, fixture.FakenetAdmin(tt, tn), id.Nonce()[:32])
}

// trustGcpIssuer configures the pool's provider with the issuer the connection reports,
// as the customer would. The fake reaches the issuer at the instance's internal
// address: SITE_URL names https, and the instance serves plain http.
func trustGcpIssuer(tt *testing.T, h *harness.Stack, pool *gcp.ControlPlane, conn gcpWIF) {
	tt.Helper()
	pool.TrustIssuer(tt, gcpProviderID, conn.Credentials.FederatedCredential.IssuerURL, h.App().BaseURL(infra.Internal))
}

func gcpDeniedMessage(serviceAccount string, conn gcpWIF) string {
	return "GCP denied the connection access to service account '" + serviceAccount + "'. " +
		"Grant the Workload Identity User role (roles/iam.workloadIdentityUser) on the service account to the connection's principal, " +
		"subject 'app-connection:" + conn.ID.String() + "'."
}

func gcpIssuer(h *harness.Stack, tn *harness.Tenant) string {
	return h.App().SiteURL() + "/api/v1/oidc-issuer/organizations/" + tn.OrgID.String()
}

type gcpFederatedCredential struct {
	IssuerURL         string `json:"issuerUrl"`
	SubjectIdentifier string `json:"subjectIdentifier"`
	Audience          string `json:"audience"`
}

// gcpWIF is a workload identity federation connection as the API returns it, read from
// the body because the generated union's As… methods accept any branch.
type gcpWIF struct {
	ID          uuid.UUID `json:"id"`
	Method      string    `json:"method"`
	Version     float64   `json:"version"`
	UpdatedAt   string    `json:"updatedAt"`
	Credentials struct {
		WorkloadIdentityProvider string                 `json:"workloadIdentityProvider"`
		ServiceAccountEmail      string                 `json:"serviceAccountEmail"`
		FederatedCredential      gcpFederatedCredential `json:"federatedCredential"`
	} `json:"credentials"`
}

func readGcpWIF(tt *testing.T, body []byte) gcpWIF {
	tt.Helper()
	var out struct {
		AppConnection gcpWIF `json:"appConnection"`
	}
	require.NoError(tt, json.Unmarshal(body, &out))
	require.Equalf(tt, "workload-identity-federation", out.AppConnection.Method, "unexpected connection: %s", apierr.Body(body))
	return out.AppConnection
}

// gcpWIFCreateBody is the create request. Bytes rather than the typed body, which is a
// defined type over the union and so would serialise as {}.
func gcpWIFCreateBody(tt *testing.T, projectID, provider, serviceAccount string) *bytes.Reader {
	tt.Helper()
	branch := api.CreateGcpAppConnectionJSONBody1{Method: api.CreateGcpAppConnectionJSONBody1MethodWorkloadIdentityFederation}
	branch.Credentials.WorkloadIdentityProvider = provider
	if serviceAccount != "" {
		branch.Credentials.ServiceAccountEmail = new(openapi_types.Email(serviceAccount))
	}
	var body api.CreateGcpAppConnectionJSONBody
	require.NoError(tt, body.FromCreateGcpAppConnectionJSONBody1(branch))
	body.Name = "gcp-" + id.Short()
	if projectID != "" {
		body.ProjectId = &projectID
	}
	raw, err := json.Marshal(body)
	require.NoError(tt, err)
	return bytes.NewReader(raw)
}

// newGcpWIFConnection creates a connection on the pool's provider, in a project or,
// with no project id, in the organization.
func newGcpWIFConnection(tt *testing.T, tn *harness.Tenant, projectID string, pool *gcp.ControlPlane, serviceAccount string) gcpWIF {
	tt.Helper()
	res, err := tn.Admin.API.CreateGcpAppConnectionWithBodyWithResponse(tt.Context(), "application/json",
		gcpWIFCreateBody(tt, projectID, pool.Provider(gcpProviderID), serviceAccount))
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "creating the connection returned %s", apierr.Body(res.Body))
	return readGcpWIF(tt, res.Body)
}

// verifyGcpWIF reconnects with the connection's own credentials, which is what runs the
// exchange: a new connection has no subject GCP could have been told to trust.
func verifyGcpWIF(tt *testing.T, tn *harness.Tenant, conn gcpWIF) *api.UpdateGcpAppConnectionResponse {
	tt.Helper()
	creds := api.UpdateGcpAppConnectionJSONBodyCredentials0{WorkloadIdentityProvider: conn.Credentials.WorkloadIdentityProvider}
	if conn.Credentials.ServiceAccountEmail != "" {
		creds.ServiceAccountEmail = new(openapi_types.Email(conn.Credentials.ServiceAccountEmail))
	}
	var union api.UpdateGcpAppConnectionJSONBody_Credentials
	require.NoError(tt, union.FromUpdateGcpAppConnectionJSONBodyCredentials0(creds))
	res, err := tn.Admin.API.UpdateGcpAppConnectionWithResponse(tt.Context(), conn.ID,
		api.UpdateGcpAppConnectionJSONRequestBody{Credentials: &union})
	require.NoError(tt, err)
	return res
}

func getGcpWIF(tt *testing.T, tn *harness.Tenant, connID uuid.UUID) gcpWIF {
	tt.Helper()
	res, err := tn.Admin.API.GetGcpAppConnectionWithResponse(tt.Context(), connID)
	require.NoError(tt, err)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "reading the connection returned %s", apierr.Body(res.Body))
	return readGcpWIF(tt, res.Body)
}
