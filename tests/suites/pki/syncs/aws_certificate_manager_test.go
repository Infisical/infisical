package syncs_test

import (
	"bytes"
	"crypto"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
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

// acmSync is an auto-syncing ACM sync holding certificates of the graph's application.
type acmSync struct {
	id   string
	get  cloudSyncGet
	acct *aws.ControlPlane
	conn *fixture.AppConnection
}

// newACMSync creates the sync over a new AWS connection; prepare runs on the account
// before Infisical is handed the sync, to seed or deny something.
func newACMSync(t *testing.T, tn *harness.Tenant, g *pki.Graph, prepare func(*aws.ControlPlane), certs ...pki.Certificate) acmSync {
	t.Helper()
	conn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
	acct := aws.Open(t, conn.FakenetAdmin(t), conn.Nonce())
	if prepare != nil {
		prepare(acct)
	}
	ids := make([]uuid.UUID, 0, len(certs))
	for _, c := range certs {
		ids = append(ids, c.ID)
	}
	body := api.CreateAwsCertificateManagerPkiSyncJSONRequestBody{
		Name:           "acm-" + id.Short(),
		ConnectionId:   conn.ID.String(),
		ApplicationId:  &g.App.ID,
		CertificateIds: &ids,
	}
	body.DestinationConfig.Region = api.CreateAwsCertificateManagerPkiSyncJSONBodyDestinationConfigRegionUsEast1
	body.SyncOptions.CertificateNameSchema = "Infisical-{{certificateId}}"
	res, err := tn.Admin.API.CreateAwsCertificateManagerPkiSyncWithResponse(t.Context(), body)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating the sync returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return acmSync{id: res.JSON200.Id.String(), get: tn.Admin.API.GetAwsCertificateManagerPkiSync, acct: acct, conn: conn}
}

// acmCertificateFor is the certificate ACM holds with cert's leaf, nil when none does.
func acmCertificateFor(t *testing.T, acct *aws.ControlPlane, cert pki.Certificate) *aws.ACMCertificate {
	t.Helper()
	want := pki.ParseLeaf(t, cert.Certificate).Raw
	for _, c := range acct.Certificates(t) {
		if bytes.Equal(pki.ParseLeaf(t, c.Certificate).Raw, want) {
			return c
		}
	}
	return nil
}

func (s acmSync) trigger(t *testing.T, tn *harness.Tenant) {
	t.Helper()
	res, err := tn.Admin.API.SyncAwsCertificateManagerPkiSyncWithResponse(t.Context(), s.id)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "triggering the sync: %s", apierr.Body(res.Body))
}

func TestAwsCertificateManagerPkiSync_Sync(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should import the linked certificate with its chain, key and Infisical tags when auto-sync is on", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newACMSync(t, tn, g, nil, cert)

		// Assert
		cloudSyncSucceeded(t, s.get, s.id, nil)
		got := acmCertificateFor(t, s.acct, cert)
		require.NotNil(t, got, "ACM should hold the certificate")
		require.Equal(t, "IMPORTED", got.Type)
		require.Equal(t, pki.ParseLeaf(t, cert.Chain).Raw, pki.ParseLeaf(t, got.CertificateChain).Raw)
		require.Equal(t, pki.ParseLeaf(t, cert.Certificate).PublicKey, acmPublicKey(t, got.PrivateKey))
		require.Equal(t, s.id, got.Tags["InfisicalPkiSyncId"])
		require.NotEmpty(t, got.Tags["InfisicalCertificate"])
	})

	t.Run("should push a certificate added to the sync and record its ARN", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, first := issued(t, tn)
		s := newACMSync(t, tn, g, nil, first)
		done := cloudSyncSucceeded(t, s.get, s.id, nil)
		second := g.Issue(t, pki.ServerCertificate(id.Short()+".sync.test"))

		// Action
		res, err := tn.Admin.API.AddCertificatesToPkiSyncWithResponse(t.Context(), uuid.MustParse(s.id), api.AddCertificatesToPkiSyncJSONRequestBody{CertificateIds: []uuid.UUID{second.ID}})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "adding the certificate: %s", apierr.Body(res.Body))
		cloudSyncSucceeded(t, s.get, s.id, done.LastSyncedAt)
		got := acmCertificateFor(t, s.acct, second)
		require.NotNil(t, got, "ACM should hold the added certificate")
		require.Equal(t, got.ARN, acmExternalID(t, tn, s.id, second.ID))
	})

	t.Run("should reimport a renewed certificate over the same ARN", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newACMSync(t, tn, g, nil, cert)
		done := cloudSyncSucceeded(t, s.get, s.id, nil)
		arn := acmCertificateFor(t, s.acct, cert).ARN

		// Action
		renewed := pki.Renew(t, g.Operator, cert.ID, map[string]any{})

		// Assert
		require.NotNilf(t, renewed.JSON200, "renewing returned %d: %s", renewed.StatusCode(), apierr.Body(renewed.Body))
		s.trigger(t, tn)
		cloudSyncSucceeded(t, s.get, s.id, done.LastSyncedAt)
		s.acct.ACM.ExpectEvent[aws.CertificateImported](t, func(e aws.CertificateImported) bool { return e.ARN == arn && e.Reimported })
		got := s.acct.Certificates(t)[arn]
		require.NotNil(t, got, "the ARN should still exist")
		require.Equal(t, pki.ParseLeaf(t, renewed.JSON200.Certificate).Raw, pki.ParseLeaf(t, got.Certificate).Raw)
	})

	t.Run("should import the certificate again when a manual sync finds it deleted at the destination", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newACMSync(t, tn, g, nil, cert)
		done := cloudSyncSucceeded(t, s.get, s.id, nil)
		s.acct.Seed(t, aws.RemoveACMCertificate(acmCertificateFor(t, s.acct, cert).ARN))

		// Action
		s.trigger(t, tn)

		// Assert
		cloudSyncSucceeded(t, s.get, s.id, done.LastSyncedAt)
		require.NotNil(t, acmCertificateFor(t, s.acct, cert), "ACM should hold the certificate again")
	})

	t.Run("should delete the sync's certificates from ACM and leave ones Infisical did not import", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newACMSync(t, tn, g, func(a *aws.ControlPlane) { a.Seed(t, aws.SeedACMCertificate("unmanaged.test")) }, cert)
		cloudSyncSucceeded(t, s.get, s.id, nil)
		arn := acmCertificateFor(t, s.acct, cert).ARN

		// Action
		res, err := tn.Admin.API.RemoveAwsCertificateManagerPkiSyncCertificatesWithResponse(t.Context(), s.id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "removing the certificates: %s", apierr.Body(res.Body))
		s.acct.ACM.ExpectEvent[aws.CertificateDeleted](t, func(e aws.CertificateDeleted) bool { return e.ARN == arn }, cloudSyncRemoval)
		left := s.acct.Certificates(t)
		require.Len(t, left, 1)
		for _, c := range left {
			require.Equal(t, "unmanaged.test", c.DomainName)
		}
	})

	t.Run("should mark the sync and the certificate failed, with the destination's reason, when ACM refuses the import", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)

		// Action
		s := newACMSync(t, tn, g, func(a *aws.ControlPlane) { a.Seed(t, aws.Deny(aws.ACM, "ImportCertificate")) }, cert)

		// Assert
		cloudSyncAwait(t, s.get, s.id, nil, "failed")
		require.Equal(t, "Failed to sync certificate: Failed to import certificate Infisical-"+strings.ReplaceAll(cert.ID.String(), "-", "")+
			" to AWS Certificate Manager: User: arn:aws:iam::"+aws.AccountID(s.conn.Nonce())+":user/infisical is not authorized to perform: "+
			"acm:ImportCertificate because no identity-based policy allows the acm:ImportCertificate action", failureMessage(t, tn, s.id))
		require.Empty(t, s.acct.Certificates(t))
	})
}

func TestAwsCertificateManagerPkiSync_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should delete the sync and leave its certificates in ACM", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `[BUG?] Deleting a certificate sync takes no option to remove what it synced, unlike
			deleting a secret sync, so its certificates stay in ACM. Removing them first is the only way.`)

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newACMSync(t, tn, g, nil, cert)
		cloudSyncSucceeded(t, s.get, s.id, nil)
		mark := s.acct.ACM.Mark(t)

		// Action
		res, err := tn.Admin.API.DeleteAwsCertificateManagerPkiSyncWithResponse(t.Context(), s.id)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the sync: %s", apierr.Body(res.Body))
		got, err := s.get(t.Context(), s.id)
		require.NoError(t, err)
		require.NoError(t, got.Body.Close())
		require.Equal(t, http.StatusNotFound, got.StatusCode)
		s.acct.ACM.ExpectNoEvent[aws.CertificateDeleted](t, nil, fakenet.Since(mark))
		require.NotNil(t, acmCertificateFor(t, s.acct, cert))
	})
}

// acmExternalID is the external identifier the sync recorded for a certificate.
func acmExternalID(t *testing.T, tn *harness.Tenant, syncID string, certID uuid.UUID) string {
	t.Helper()
	res, err := tn.Admin.API.ListPkiSyncCertificatesWithResponse(t.Context(), uuid.MustParse(syncID), nil)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing the sync's certificates returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	for _, c := range res.JSON200.Certificates {
		if c.CertificateId == certID && c.ExternalIdentifier != nil {
			return *c.ExternalIdentifier
		}
	}
	return ""
}

func acmPublicKey(t *testing.T, keyPEM string) crypto.PublicKey {
	t.Helper()
	block, _ := pem.Decode([]byte(keyPEM))
	require.NotNil(t, block, "not PEM: %q", keyPEM)
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	require.NoError(t, err)
	return key.(crypto.Signer).Public()
}

func TestAwsCertificateManagerPkiSync_Update(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should store new settings without calling ACM", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		g, cert := issued(t, tn)
		s := newACMSync(t, tn, g, nil, cert)
		cloudSyncSucceeded(t, s.get, s.id, nil)
		mark := s.acct.ACM.Mark(t)
		calls := len(s.acct.ACM.Calls(t))
		name := "acm-renamed-" + id.Short()
		var body api.UpdateAwsCertificateManagerPkiSyncJSONRequestBody
		fromJSON(t, &body, map[string]any{
			"name":              name,
			"description":       "rotated by the platform team",
			"isAutoSyncEnabled": false,
			"syncOptions":       map[string]any{"certificateNameSchema": "Renamed-{{certificateId}}", "preserveArn": false},
		})

		// Action
		res, err := tn.Admin.API.UpdateAwsCertificateManagerPkiSyncWithResponse(t.Context(), s.id, body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "updating the sync: %s", apierr.Body(res.Body))
		got := acmSyncSettings(t, tn, s.id)
		require.Equal(t, name, got.Name)
		require.Equal(t, "rotated by the platform team", got.Description)
		require.False(t, got.IsAutoSyncEnabled)
		require.Equal(t, "Renamed-{{certificateId}}", got.SyncOptions.CertificateNameSchema)
		require.False(t, got.SyncOptions.PreserveArn)
		s.acct.ACM.ExpectNoEvent[aws.CertificateImported](t, nil, fakenet.Since(mark))
		require.Len(t, s.acct.ACM.Calls(t), calls, "updating the settings should not reach ACM")
	})

	t.Run("should remove the certificates a changed filter no longer matches and push the ones it now matches", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		p := pki.CertManager(t, tn)
		ca := pki.NewIntermediateCA(t, p, pki.NewInternalCA(t, p))
		policy := pki.NewPolicy(t, p, pki.AllowAll(t))
		before, after := pki.NewProfile(t, p, ca, policy), pki.NewProfile(t, p, ca, policy)
		app := pki.NewApplication(t, p, before, after)
		pki.EnableAPI(t, app, before, api.SetPkiApplicationApiEnrollmentJSONRequestBody{})
		pki.EnableAPI(t, app, after, api.SetPkiApplicationApiEnrollmentJSONRequestBody{})
		dropped := pki.Issue(t, app, before, pki.ServerCertificate(id.Short()+".sync.test"))
		kept := pki.Issue(t, app, after, pki.ServerCertificate(id.Short()+".sync.test"))
		conn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
		acct := aws.Open(t, conn.FakenetAdmin(t), conn.Nonce())
		var create api.CreateAwsCertificateManagerPkiSyncJSONRequestBody
		fromJSON(t, &create, map[string]any{
			"name":              "acm-" + id.Short(),
			"connectionId":      conn.ID.String(),
			"applicationId":     app.ID,
			"filters":           map[string]any{"profileIds": []uuid.UUID{before.ID}},
			"destinationConfig": map[string]any{"region": "us-east-1"},
			"syncOptions":       map[string]any{"certificateNameSchema": "Infisical-{{certificateId}}"},
		})
		created, err := tn.Admin.API.CreateAwsCertificateManagerPkiSyncWithResponse(t.Context(), create)
		require.NoError(t, err)
		require.NotNilf(t, created.JSON200, "creating the sync returned %d: %s", created.StatusCode(), apierr.Body(created.Body))
		syncID := created.JSON200.Id.String()
		cloudSyncSucceeded(t, tn.Admin.API.GetAwsCertificateManagerPkiSync, syncID, nil)
		droppedARN := acmCertificateFor(t, acct, dropped).ARN
		mark := acct.ACM.Mark(t)
		var body api.UpdateAwsCertificateManagerPkiSyncJSONRequestBody
		fromJSON(t, &body, map[string]any{"filters": map[string]any{"profileIds": []uuid.UUID{after.ID}}})

		// Action
		res, err := tn.Admin.API.UpdateAwsCertificateManagerPkiSyncWithResponse(t.Context(), syncID, body)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "updating the filters: %s", apierr.Body(res.Body))
		acct.ACM.ExpectEvent[aws.CertificateDeleted](t, func(e aws.CertificateDeleted) bool { return e.ARN == droppedARN }, fakenet.Since(mark), cloudSyncRemoval)
		acct.ACM.ExpectEvent[aws.CertificateImported](t, func(e aws.CertificateImported) bool { return !e.Reimported }, fakenet.Since(mark), cloudSyncRemoval)
		held := acct.Certificates(t)
		require.Len(t, held, 1)
		require.NotNil(t, acmCertificateFor(t, acct, kept), "ACM should hold the certificate the new filter matches")
	})
}

// acmSyncSettingsView is what the get route reports of a sync's own settings.
type acmSyncSettingsView struct {
	Name              string `json:"name"`
	Description       string `json:"description"`
	IsAutoSyncEnabled bool   `json:"isAutoSyncEnabled"`
	SyncOptions       struct {
		CertificateNameSchema string `json:"certificateNameSchema"`
		PreserveArn           bool   `json:"preserveArn"`
	} `json:"syncOptions"`
}

func acmSyncSettings(t *testing.T, tn *harness.Tenant, syncID string) acmSyncSettingsView {
	t.Helper()
	res, err := tn.Admin.API.GetAwsCertificateManagerPkiSyncWithResponse(t.Context(), syncID)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "reading the sync: %s", apierr.Body(res.Body))
	var out acmSyncSettingsView
	require.NoError(t, json.Unmarshal(res.Body, &out))
	return out
}
