package scep_test

import (
	"bytes"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/smallstep/scep"
	"github.com/stretchr/testify/require"
)

func TestScepEnrollment_Enroll(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should issue a certificate for the CSR's name from the profile's CA when the challenge password matches", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, staticChallenge("testpassword123"))

		// Action
		got, _ := p.enroll(t, newDevice(t, "test-device.example.com"), "test-device.example.com", "testpassword123")

		// Assert
		require.Equal(t, scep.SUCCESS, got.status)
		require.Equal(t, "test-device.example.com", got.cert.Subject.CommonName)
		require.NoError(t, got.cert.CheckSignatureFrom(p.ca))
	})

	t.Run("should issue for a name in another domain under another challenge password", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, staticChallenge("mySecurePass99"))

		// Action
		got, _ := p.enroll(t, newDevice(t, "router-01.corp.local"), "router-01.corp.local", "mySecurePass99")

		// Assert
		require.Equal(t, scep.SUCCESS, got.status)
		require.Equal(t, "router-01.corp.local", got.cert.Subject.CommonName)
	})

	t.Run("should issue the same way when the PKIOperation arrives over GET", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, staticChallenge("testpassword123"))
		signer := newDevice(t, "get-device.example.com")
		req := p.pkcsReq(t, signer, "get-device.example.com", "testpassword123")

		// Action
		res := p.operation(t, "PKIOperation", req.msg.Raw)

		// Assert
		require.Equal(t, http.StatusOK, res.StatusCode())
		got := readCertRep(t, res.Body, req, signer)
		require.Equal(t, scep.SUCCESS, got.status)
		require.Equal(t, "get-device.example.com", got.cert.Subject.CommonName)
	})

	t.Run("should issue a separate certificate for each device enrolling on one profile", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, staticChallenge("testpassword123"))
		first := p.mustEnroll(t, "device-01.example.com", "testpassword123")

		// Action
		second := p.mustEnroll(t, "device-02.example.com", "testpassword123")

		// Assert
		require.Equal(t, "device-01.example.com", first.cert.Subject.CommonName)
		require.Equal(t, "device-02.example.com", second.cert.Subject.CommonName)
		require.NotEqual(t, first.cert.SerialNumber, second.cert.SerialNumber)
	})

	t.Run("should refuse with badRequest when the challenge password is wrong", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, staticChallenge("testpassword123"))

		// Action
		got, _ := p.enroll(t, newDevice(t, "router-01.corp.local"), "router-01.corp.local", "wrongpassword99")

		// Assert
		require.Equal(t, scep.FAILURE, got.status)
		require.Equal(t, scep.BadRequest, got.failInfo)
	})

	t.Run("should refuse with badRequest when the CSR carries no challenge password", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := newScepProfile(t, tn, staticChallenge("testpassword123"))

		// Action
		got, _ := p.enroll(t, newDevice(t, "router-01.corp.local"), "router-01.corp.local", "")

		// Assert
		require.Equal(t, scep.FAILURE, got.status)
		require.Equal(t, scep.BadRequest, got.failInfo)
	})

	t.Run("should refuse with 400 naming the name and issue nothing when the profile's policy does not allow it", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] A wrong challenge password gets a failure CertRep, as RFC 8894 expects
			for a request the server decoded, but a policy refusal escapes as an HTTP 400 JSON body
			that no SCEP client reads.`)

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		policy := pki.AllowAll(t)
		var cn api.CreateCertificatePolicyJSONBody_Subject_Item
		require.NoError(t, cn.FromCreateCertificatePolicyJSONBodySubject0(api.CreateCertificatePolicyJSONBodySubject0{
			Type:    api.CreateCertificatePolicyJSONBodySubject0TypeCommonName,
			Allowed: &[]string{"*.allowed.test"},
		}))
		policy.Subject = &[]api.CreateCertificatePolicyJSONBody_Subject_Item{cn}
		profile := pki.NewProfile(t, proj, pki.NewInternalCA(t, proj), pki.NewPolicy(t, proj, policy))
		app := pki.NewApplication(t, proj, profile)
		pki.EnableSCEP(t, app, profile, staticChallenge("testpassword123"))
		p := scepProfile{api: tn.Anonymous(t), project: proj, app: app, profile: profile}

		req := p.pkcsReq(t, newDevice(t, "x.denied.test"), "x.denied.test", "testpassword123")

		// Action
		res, err := p.api.PostScepApplicationOperationWithBodyWithResponse(t.Context(), app.ID, profile.ID,
			&api.PostScepApplicationOperationParams{Operation: new("PKIOperation")}, "application/x-pki-message", bytes.NewReader(req.msg.Raw))

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Certificate request validation failed: common_name value 'x.denied.test' does not match allowed patterns: *.allowed.test", apierr.Message(res.Body))
		require.Zero(t, pki.Requests(t, proj, profile))
	})
}
