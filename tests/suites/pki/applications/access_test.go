package applications_test

import (
	"math/big"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestApplicationAccess_Operator(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a certificate through the application", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)

		// Action
		res := pki.Request(t, g.Operator, g.App, g.Profile, pki.ServerCertificate(id.Short()+".app.test"))

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "issuing: %s", apierr.Body(res.Body))
		require.NotNil(t, res.JSON200.Certificate)
	})

	t.Run("should renew a certificate of the application", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		name := id.Short() + ".app.test"
		cert := g.Issue(t, pki.ServerCertificate(name))

		// Action
		res := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "renewing: %s", apierr.Body(res.Body))
		renewed := pki.ParseLeaf(t, res.JSON200.Certificate)
		require.Equal(t, []string{name}, renewed.DNSNames)
		serial, ok := new(big.Int).SetString(res.JSON200.SerialNumber, 16)
		require.Truef(t, ok, "serial %q is not hex", res.JSON200.SerialNumber)
		require.Zero(t, serial.Cmp(renewed.SerialNumber))
		require.NotEqual(t, cert.SerialNumber, res.JSON200.SerialNumber)
	})

}

func TestApplicationAccess_Auditor(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should read a certificate of the application", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		cert := g.Issue(t, pki.ServerCertificate(id.Short()+".app.test"))
		auditor := member(t, tn, g, "auditor")

		// Action
		res, err := auditor.API.GetCertificateWithResponse(t.Context(), cert.ID, nil)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "reading: %s", apierr.Body(res.Body))
		require.Equal(t, cert.SerialNumber, res.JSON200.Certificate.SerialNumber)
	})

	t.Run("should refuse the private key of a certificate of the application in every form", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		cert := g.Issue(t, pki.ServerCertificate(id.Short()+".app.test"))
		auditor := member(t, tn, g, "auditor")

		// Action
		key, err := auditor.API.GetCertificatePrivateKeyWithResponse(t.Context(), cert.ID)
		require.NoError(t, err)
		bundle, err := auditor.API.GetCertificateBundleWithResponse(t.Context(), cert.ID)
		require.NoError(t, err)
		p12, err := auditor.API.ExportCertificatePkcs12WithResponse(t.Context(), cert.ID, api.ExportCertificatePkcs12JSONRequestBody{
			Alias:    "server",
			Password: "correct-horse-battery-9",
		})
		require.NoError(t, err)

		// Assert
		const refused = "You don't have permission to read this certificate's private key"
		for name, res := range map[string]struct {
			status int
			body   []byte
		}{
			"private key": {key.StatusCode(), key.Body},
			"bundle":      {bundle.StatusCode(), bundle.Body},
			"PKCS#12":     {p12.StatusCode(), p12.Body},
		} {
			require.Equalf(t, http.StatusForbidden, res.status, "%s answered: %s", name, apierr.Body(res.body))
			require.Equalf(t, refused, apierr.Message(res.body), "%s", name)
		}
	})

	t.Run("should refuse to issue a certificate and issue nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		auditor := member(t, tn, g, "auditor")

		// Action
		res := pki.Request(t, auditor, g.App, g.Profile, pki.ServerCertificate(id.Short()+".app.test"))

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to issue-cert on certificate-profiles", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, g.Project, g.Profile))
	})

	t.Run("should refuse to revoke a certificate and leave it active", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		cert := g.Issue(t, pki.ServerCertificate(id.Short()+".app.test"))
		auditor := member(t, tn, g, "auditor")

		// Action
		res := pki.RevokeRequest(t, auditor, cert.ID, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not allowed to request-revocation on certificates", apierr.Message(res.Body))
		require.Equal(t, "active", pki.ReadCertificate(t, tn.Admin, cert.ID).JSON200.Certificate.Status)
	})
}

func TestApplicationAccess_NonMember(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a Product Member outside the application issuing through it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		outsider := member(t, tn, g, "")

		// Action
		res := pki.Request(t, outsider, g.App, g.Profile, pki.ServerCertificate(id.Short()+".app.test"))

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not a member of this certificate-application.", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, g.Project, g.Profile))
	})

	t.Run("should refuse a Product Member outside the application reading its certificates", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		cert := g.Issue(t, pki.ServerCertificate(id.Short()+".app.test"))
		outsider := member(t, tn, g, "")

		// Action
		res, err := outsider.API.GetCertificateWithResponse(t.Context(), cert.ID, nil)

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not a member of this certificate-application.", apierr.Message(res.Body))
	})

	t.Run("should refuse an operator of one application issuing through another", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		other := pki.NewApplication(t, g.Project, g.Profile)
		pki.EnableAPI(t, other, g.Profile, api.SetPkiApplicationApiEnrollmentJSONRequestBody{})

		// Action
		res := pki.Request(t, g.Operator, other, g.Profile, pki.ServerCertificate(id.Short()+".app.test"))

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not a member of this certificate-application.", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, g.Project, g.Profile))
	})
}

func TestApplicationAccess_Membership(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should let a member of a group that is an operator issue", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		user, _ := operatorGroupMember(t, tn, g)
		name := id.Short() + ".app.test"

		// Action
		res := pki.Request(t, user, g.App, g.Profile, pki.ServerCertificate(name))

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "issuing: %s", apierr.Body(res.Body))
		require.NotNil(t, res.JSON200.Certificate)
		require.Equal(t, []string{name}, pki.ParseLeaf(t, res.JSON200.Certificate.Certificate).DNSNames)
	})

	t.Run("should refuse a removed operator issuing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		rm, err := tn.Admin.API.RemovePkiApplicationUserMemberWithResponse(t.Context(), g.App.ID, g.Operator.ID)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, rm.StatusCode(), "removing the operator: %s", apierr.Body(rm.Body))

		// Action
		res := pki.Request(t, g.Operator, g.App, g.Profile, pki.ServerCertificate(id.Short()+".app.test"))

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not a member of this certificate-application.", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, g.Project, g.Profile))
	})
}

func TestApplicationAccess_KnownIssues(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should revoke a certificate of the application", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `The access control docs give the operator role issue, renew and revoke.
			Revocation checks the Delete action on certificates (revokeCertificate in
			certificate-service.ts), which buildApplicationOperatorPermissionRules does not grant.`)

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		cert := g.Issue(t, pki.ServerCertificate(id.Short()+".app.test"))

		// Action
		res := pki.RevokeRequest(t, g.Operator, cert.ID, api.RevokeCertificateJSONBodyRevocationReasonKEYCOMPROMISE)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "revoking: %s", apierr.Body(res.Body))
		require.Equal(t, "revoked", pki.ReadCertificate(t, tn.Admin, cert.ID).JSON200.Certificate.Status)
	})
}
