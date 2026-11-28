package kmip_test

import (
	"encoding/base64"
	"net/http"
	"sort"
	"testing"

	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type locatedObjects struct {
	Objects []kmipAttributes
}

func locatedIDs(objects locatedObjects) []string {
	out := make([]string, 0, len(objects.Objects))
	for _, o := range objects.Objects {
		out = append(out, o.ID.String())
	}
	sort.Strings(out)
	return out
}

func TestKmipOperation(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create a key that the KMS key API lists and can encrypt with, and log it under the KMIP client", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		s, client := newSession(t, proj, "create")

		// Action
		created := callOK[struct{ ID uuid.UUID }](t, s, "create", map[string]any{"algorithm": "aes-256-gcm"})

		// Assert
		key := kms.GetKey(t, proj, created.ID)
		require.Equal(t, []string{kms.EncryptDecrypt, "aes-256-gcm"}, []string{key.KeyUsage, key.Algorithm})
		ciphertext := kms.Encrypt(t, proj, key.ID, []byte("from the api"))
		require.Equal(t, []byte("from the api"), kms.Decrypt(t, proj, key.ID, ciphertext))
		events := fixture.WaitForAuditEvents(t, tn, "kmip-operation-create", 1, func(e fixture.AuditEvent) bool {
			return e.Metadata["id"] == created.ID.String()
		})
		require.Len(t, events, 1)
		require.Equal(t, "kmipClient", events[0].ActorType)
		require.Equal(t, client.ID, events[0].Actor["clientId"])
	})

	t.Run("should register key material and return the same material on get", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		s, _ := newSession(t, proj, "register", "get")
		material := make([]byte, 32)
		material[0] = 7

		// Action
		registered := callOK[struct{ ID uuid.UUID }](t, s, "register", map[string]any{
			"key": base64.StdEncoding.EncodeToString(material), "name": "Array Key", "algorithm": "aes-256-gcm",
		})

		// Assert
		got := callOK[struct{ Value string }](t, s, "get", map[string]any{"id": registered.ID})
		require.Equal(t, base64.StdEncoding.EncodeToString(material), got.Value)
		require.Equal(t, "array-key", kms.GetKey(t, proj, registered.ID).Name)
	})

	t.Run("should refuse registering key material of the wrong length", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		s, _ := newSession(t, proj, "register")

		// Action
		status, body := s.call(t, "register", map[string]any{
			"key": base64.StdEncoding.EncodeToString(make([]byte, 16)), "name": "short", "algorithm": "aes-256-gcm",
		})

		// Assert
		requireStatus(t, http.StatusBadRequest, status, body)
		require.Equal(t, "Invalid key material length for aes-256-gcm. Expected 32 bytes, got 16.", apierr.Message(body))
	})

	t.Run("should locate and describe only this project's encrypt-decrypt keys", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj, other := newProject(t, tn), newProject(t, tn)
		s, _ := newSession(t, proj, "locate", "get-attributes")
		aes := kms.NewKey(t, proj)
		kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ED25519"))
		kms.NewKey(t, proj, kms.WithUsage(kms.MAC), kms.WithAlgorithm("HMAC_SHA_256"))
		kms.NewKey(t, other)

		// Action
		located := callOK[locatedObjects](t, s, "locate", nil)

		// Assert
		require.Equal(t, []string{aes.ID.String()}, locatedIDs(located))
		attributes := callOK[kmipAttributes](t, s, "get-attributes", map[string]any{"id": aes.ID})
		require.Equal(t, kmipAttributes{ID: aes.ID, Algorithm: "aes-256-gcm", IsActive: true}, attributes)
	})

	t.Run("should answer 404 to every key operation on a sign-verify or MAC key and leave the key unchanged", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		s, _ := newSession(t, proj, allOperations...)
		signing := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ED25519"))
		mac := kms.NewKey(t, proj, kms.WithUsage(kms.MAC), kms.WithAlgorithm("HMAC_SHA_256"))

		for _, key := range []kms.Key{signing, mac} {
			for _, operation := range []string{"get", "get-attributes", "revoke", "destroy", "activate"} {
				// Action
				status, body := s.call(t, operation, map[string]any{"id": key.ID})

				// Assert
				require.Equalf(t, http.StatusNotFound, status, "%s on %s: %s", operation, key.KeyUsage, apierr.Body(body))
				require.Equal(t, "Key with ID "+key.ID.String()+" not found", apierr.Message(body))
			}
			require.Equal(t, key, kms.GetKey(t, proj, key.ID))
		}
	})

	t.Run("should get, revoke and destroy an encrypt-decrypt key created through the KMS key API in the same project", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		s, _ := newSession(t, proj, "get", "revoke", "destroy")
		key := kms.NewKey(t, proj)
		material := base64.StdEncoding.EncodeToString(kms.ExportPrivateKey(t, proj, key.ID))

		// Action
		got := callOK[struct{ Value string }](t, s, "get", map[string]any{"id": key.ID})
		callOK[struct{}](t, s, "revoke", map[string]any{"id": key.ID})
		callOK[struct{}](t, s, "destroy", map[string]any{"id": key.ID})

		// Assert
		require.Equal(t, material, got.Value)
		res, err := proj.Tenant().Admin.API.GetKmsKeyByIdWithResponse(t.Context(), key.ID)
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
	})

	t.Run("should disable a key on revoke, so encryption is refused, while get still returns its material", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		s, _ := newSession(t, proj, "revoke", "get", "get-attributes")
		key := kms.NewKey(t, proj)
		material := base64.StdEncoding.EncodeToString(kms.ExportPrivateKey(t, proj, key.ID))

		// Action
		callOK[struct{}](t, s, "revoke", map[string]any{"id": key.ID})

		// Assert
		require.False(t, callOK[kmipAttributes](t, s, "get-attributes", map[string]any{"id": key.ID}).IsActive)
		encrypt, err := tn.Admin.API.EncryptWithKmsKeyWithBodyWithResponse(t.Context(), key.ID, "application/json",
			kms.JSON(t, map[string]any{"plaintext": base64.StdEncoding.EncodeToString([]byte("new data"))}))
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, encrypt.StatusCode(), encrypt.Body)
		require.Equal(t, "Key is disabled", apierr.Message(encrypt.Body))
		require.Equal(t, material, callOK[struct{ Value string }](t, s, "get", map[string]any{"id": key.ID}).Value)
	})

	t.Run("should refuse destroying an active key, and remove the key once it is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		s, _ := newSession(t, proj, "create", "revoke", "destroy", "locate")
		created := callOK[struct{ ID uuid.UUID }](t, s, "create", map[string]any{"algorithm": "aes-128-gcm"})

		// Action
		activeStatus, activeBody := s.call(t, "destroy", map[string]any{"id": created.ID})
		callOK[struct{}](t, s, "revoke", map[string]any{"id": created.ID})
		callOK[struct{}](t, s, "destroy", map[string]any{"id": created.ID})

		// Assert
		requireStatus(t, http.StatusBadRequest, activeStatus, activeBody)
		require.Equal(t, "Cannot destroy active keys", apierr.Message(activeBody))
		require.Empty(t, callOK[locatedObjects](t, s, "locate", nil).Objects)
	})

	t.Run("should refuse destroying a delete-protected key and getting a non-exportable key", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		s, _ := newSession(t, proj, "revoke", "destroy", "get")
		protected := kms.NewKey(t, proj, kms.WithDeleteProtection())
		locked := kms.NewKey(t, proj, kms.NotExportable())
		callOK[struct{}](t, s, "revoke", map[string]any{"id": protected.ID})

		// Action
		destroyStatus, destroyBody := s.call(t, "destroy", map[string]any{"id": protected.ID})
		getStatus, getBody := s.call(t, "get", map[string]any{"id": locked.ID})

		// Assert
		requireStatus(t, http.StatusBadRequest, destroyStatus, destroyBody)
		require.Equal(t, "Key with ID "+protected.ID.String()+" has delete protection enabled. Disable delete protection on the key before destroying it.",
			apierr.Message(destroyBody))
		require.Equal(t, protected.ID, kms.GetKey(t, proj, protected.ID).ID)
		requireStatus(t, http.StatusBadRequest, getStatus, getBody)
		require.Equal(t, "You are not allowed to export this key", apierr.Message(getBody))
		require.NotContains(t, string(getBody), "value")
	})

	t.Run("should not find a key from another project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj, other := newProject(t, tn), newProject(t, tn)
		s, _ := newSession(t, proj, "get")
		elsewhere := kms.NewKey(t, other)

		// Action
		status, body := s.call(t, "get", map[string]any{"id": elsewhere.ID})

		// Assert
		requireStatus(t, http.StatusNotFound, status, body)
		require.Equal(t, "Key with ID "+elsewhere.ID.String()+" not found", apierr.Message(body))
	})

	t.Run("should refuse every operation the client was not granted", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		s, _ := newSession(t, proj)
		key := kms.NewKey(t, proj)
		names := map[string]string{"get-attributes": "get attributes"}

		for _, operation := range allOperations {
			// Action
			status, body := s.call(t, operation, sampleBody(operation, key.ID))

			// Assert
			require.Equalf(t, http.StatusForbidden, status, "%s: %s", operation, apierr.Body(body))
			name := operation
			if n, ok := names[operation]; ok {
				name = n
			}
			require.Equal(t, "Client does not have sufficient permission to perform KMIP "+name, apierr.Message(body))
		}
		require.Equal(t, key, kms.GetKey(t, proj, key.ID))
	})

	t.Run("should refuse a request that does not prove which client and server are talking", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		s, _ := newSession(t, proj, "locate")
		otherClient := newClient(t, proj, "locate")
		_, otherCert := issueCertificate(t, proj, otherClient.ID, map[string]any{"keyAlgorithm": "RSA_2048", "ttl": "1d"})
		foreignServer := enrollServer(t, h.NewTenant(t))
		cases := map[string]struct {
			overrides map[string]string
			message   string
		}{
			"no server serial":      {map[string]string{"x-kmip-server-certificate-serial-number": ""}, "Missing server certificate serial number from request"},
			"no client serial":      {map[string]string{"x-kmip-client-certificate-serial-number": ""}, "Missing client certificate serial number from request"},
			"no client id":          {map[string]string{"x-kmip-client-id": ""}, "Missing client ID from request"},
			"no project id":         {map[string]string{"x-kmip-project-id": ""}, "Missing project ID from request"},
			"another client's cert": {map[string]string{"x-kmip-client-certificate-serial-number": otherCert.SerialNumber}, "Client certificate does not match the specified KMIP client"},
			"unknown client serial": {map[string]string{"x-kmip-client-certificate-serial-number": "abcdef"}, "Client certificate does not match the specified KMIP client"},
			"another org's server":  {map[string]string{"x-kmip-server-certificate-serial-number": foreignServer.serial}, "Invalid KMIP server certificate"},
			"unknown server serial": {map[string]string{"x-kmip-server-certificate-serial-number": "abcdef"}, "Invalid KMIP server certificate"},
		}

		for name, c := range cases {
			// Action
			status, body := s.with(c.overrides).call(t, "locate", nil)

			// Assert
			require.Equalf(t, http.StatusForbidden, status, "%s: %s", name, apierr.Body(body))
			require.Equalf(t, c.message, apierr.Message(body), "%s", name)
		}
	})

	t.Run("should not let a client reach another project's keys by naming that project in the request", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj, other := newProject(t, tn), newProject(t, tn)
		s, _ := newSession(t, proj, "get", "revoke", "locate")
		elsewhere := kms.NewKey(t, other)
		asOther := s.with(map[string]string{"x-kmip-project-id": other.ID})

		for _, operation := range []string{"get", "revoke", "locate"} {
			// Action
			status, body := asOther.call(t, operation, sampleBody(operation, elsewhere.ID))

			// Assert
			require.Equalf(t, http.StatusNotFound, status, "%s: %s", operation, apierr.Body(body))
			require.Equalf(t, "KMIP client cannot be found.", apierr.Message(body), "%s", operation)
		}
		require.Equal(t, elsewhere, kms.GetKey(t, other, elsewhere.ID))
	})

	t.Run("should accept an organization identity with KMIP proxy permission and refuse one without it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		s, _ := newSession(t, proj, "locate")
		proxy := tn.NewMachineIdentity(t, harness.OrgRole("admin"))
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))

		// Action
		allowedStatus, allowedBody := session{client: proxy.API, headers: s.headers}.call(t, "locate", nil)
		refusedStatus, refusedBody := session{client: member.API, headers: s.headers}.call(t, "locate", nil)

		// Assert
		requireStatus(t, http.StatusOK, allowedStatus, allowedBody)
		requireStatus(t, http.StatusForbidden, refusedStatus, refusedBody)
		require.Equal(t, "You are not allowed to proxy on kmip", apierr.Message(refusedBody))
	})

	t.Run("should report an active key as active, and refuse activating a revoked key", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "a revoked KMIP object is deactivated for good; activate applies only to a key that was never active")

		// Setup
		proj := newProject(t, h.NewTenant(t))
		s, _ := newSession(t, proj, "revoke", "activate", "get-attributes")
		active, revoked := kms.NewKey(t, proj), kms.NewKey(t, proj)
		callOK[struct{}](t, s, "revoke", map[string]any{"id": revoked.ID})

		// Action
		activeResult := callOK[kmipAttributes](t, s, "activate", map[string]any{"id": active.ID})
		status, body := s.call(t, "activate", map[string]any{"id": revoked.ID})

		// Assert
		require.True(t, activeResult.IsActive)
		requireStatus(t, http.StatusBadRequest, status, body)
		require.Equal(t, "Key with ID "+revoked.ID.String()+" is revoked and cannot be activated again", apierr.Message(body))
		require.False(t, callOK[kmipAttributes](t, s, "get-attributes", map[string]any{"id": revoked.ID}).IsActive)
	})

	t.Run("should refuse registering a name already used in the project, naming the stored name, and keep the existing key", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		s, _ := newSession(t, proj, "register")
		existing := kms.NewKey(t, proj, kms.WithName("array-key"))

		// Action
		status, body := s.call(t, "register", map[string]any{
			"key": base64.StdEncoding.EncodeToString(make([]byte, 32)), "name": "Array Key", "algorithm": "aes-256-gcm",
		})

		// Assert
		requireStatus(t, http.StatusBadRequest, status, body)
		require.Equal(t, `A key with the name "array-key" already exists in this project`, apierr.Message(body))
		require.Equal(t, existing, kms.GetKey(t, proj, existing.ID))
	})

	t.Run("should answer 401 to a request with every KMIP header and no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		s, _ := newSession(t, proj, "locate")

		// Action
		status, body := session{client: tn.Anonymous(t), headers: s.headers}.call(t, "locate", nil)

		// Assert
		requireStatus(t, http.StatusUnauthorized, status, body)
		require.Equal(t, "Token missing", apierr.Message(body))
	})

	t.Run("should answer a client id that is not a UUID as an unknown client, and refuse a key id that is not a UUID", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		s, _ := newSession(t, proj, "get")

		// Action
		clientStatus, clientBody := s.with(map[string]string{"x-kmip-client-id": "not-a-uuid"}).call(t, "get", map[string]any{"id": uuid.NewString()})
		keyStatus, keyBody := s.call(t, "get", map[string]any{"id": "not-a-uuid"})

		// Assert
		requireStatus(t, http.StatusNotFound, clientStatus, clientBody)
		require.Equal(t, "KMIP client cannot be found.", apierr.Message(clientBody))
		requireStatus(t, http.StatusUnprocessableEntity, keyStatus, keyBody)
		require.Contains(t, string(keyBody), "Invalid uuid")
	})
}
