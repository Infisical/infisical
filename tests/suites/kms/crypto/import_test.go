package crypto_test

import (
	"crypto/ecdsa"
	"crypto/ed25519"
	"crypto/elliptic"
	"crypto/hmac"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/pem"
	"net/http"
	"sort"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type importEntry struct {
	Name        string `json:"name"`
	KeyUsage    string `json:"keyUsage"`
	Algorithm   string `json:"algorithm"`
	KeyMaterial string `json:"keyMaterial"`
}

type importResult struct {
	Keys []struct {
		ID   uuid.UUID
		Name string
	}
	Errors []struct{ Name, Message string }
}

func bulkImport(t *testing.T, client *api.ClientWithResponses, p *fixture.Project, entries ...importEntry) (*api.BulkImportKmsKeysResponse, importResult) {
	t.Helper()
	res, err := client.BulkImportKmsKeysWithBodyWithResponse(t.Context(), "application/json",
		kms.JSON(t, map[string]any{"projectId": p.ID, "keys": entries}))
	require.NoError(t, err)
	var out importResult
	if res.StatusCode() == http.StatusOK {
		out = kms.Decode[importResult](t, res.Body)
	}
	return res, out
}

func pkcs8PEM(t *testing.T, key any) string {
	t.Helper()
	der, err := x509.MarshalPKCS8PrivateKey(key)
	require.NoError(t, err)
	return b64(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
}

func randomBytes(t *testing.T, n int) []byte {
	t.Helper()
	b := make([]byte, n)
	_, err := rand.Read(b)
	require.NoError(t, err)
	return b
}

func importedIDs(t *testing.T, result importResult) map[string]uuid.UUID {
	t.Helper()
	require.Empty(t, result.Errors)
	out := map[string]uuid.UUID{}
	for _, k := range result.Keys {
		out[k.Name] = k.ID
	}
	return out
}

func TestKmsKey_BulkImport(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should import key material of every classical usage so each imported key uses that material", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		aes, mac := randomBytes(t, 32), randomBytes(t, 32)
		rsaKey, err := rsa.GenerateKey(rand.Reader, 4096)
		require.NoError(t, err)
		ecKey, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
		require.NoError(t, err)
		_, edKey, err := ed25519.GenerateKey(rand.Reader)
		require.NoError(t, err)

		// Action
		res, result := bulkImport(t, tn.Admin.API, proj,
			importEntry{"aes", kms.EncryptDecrypt, "aes-256-gcm", b64(aes)},
			importEntry{"rsa", kms.SignVerify, "RSA_4096", pkcs8PEM(t, rsaKey)},
			importEntry{"ec", kms.SignVerify, "ECC_NIST_P256", pkcs8PEM(t, ecKey)},
			importEntry{"ed", kms.SignVerify, "ED25519", pkcs8PEM(t, edKey)},
			importEntry{"mac", kms.MAC, "HMAC_SHA_256", b64(mac)},
		)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		ids := importedIDs(t, result)
		require.Equal(t, aes, kms.ExportPrivateKey(t, proj, ids["aes"]))
		data := []byte("message")
		for name, c := range map[string]struct {
			algorithm string
			public    any
		}{"rsa": {"RSASSA_PSS_SHA_256", rsaKey.Public()}, "ec": {"ECDSA_SHA_256", ecKey.Public()}, "ed": {"ED25519", edKey.Public()}} {
			publicDER, err := x509.MarshalPKIXPublicKey(c.public)
			require.NoError(t, err)
			signature := signOK(t, tn.Admin.API, ids[name], c.algorithm, data)
			require.NoErrorf(t, verifyLocally(t, publicDER, c.algorithm, data, signature), "%s", name)
		}
		_, gotMac := generateMac(t, tn.Admin.API, ids["mac"], data)
		local := hmac.New(sha256.New, mac)
		local.Write(data)
		require.Equal(t, local.Sum(nil), gotMac)
	})

	t.Run("should carry exported keys into another project, where they decrypt and sign as the originals", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source, target := newProject(t, tn), newProject(t, tn)
		aes := kms.NewKey(t, source)
		mldsa := kms.NewKey(t, source, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ML_DSA_65"))
		ciphertext := kms.Encrypt(t, source, aes.ID, []byte("carried over"))

		// Action
		res, result := bulkImport(t, tn.Admin.API, target,
			importEntry{"aes", kms.EncryptDecrypt, "aes-256-gcm", b64(kms.ExportPrivateKey(t, source, aes.ID))},
			importEntry{"mldsa", kms.SignVerify, "ML_DSA_65", b64(kms.ExportPrivateKey(t, source, mldsa.ID))},
		)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		ids := importedIDs(t, result)
		require.Equal(t, []byte("carried over"), kms.Decrypt(t, target, ids["aes"], ciphertext))
		signature := signOK(t, tn.Admin.API, ids["mldsa"], "ML_DSA_65", []byte("message"))
		require.NoError(t, verifyLocally(t, publicKey(t, source, mldsa.ID), "ML_DSA_65", []byte("message"), signature))
	})

	t.Run("should import the valid entries, report each invalid one by name, and leave a colliding key unchanged", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		existing := kms.NewKey(t, proj, kms.WithName("existing"))
		rsa2048, err := rsa.GenerateKey(rand.Reader, 2048)
		require.NoError(t, err)

		// Action
		res, result := bulkImport(t, tn.Admin.API, proj,
			importEntry{"fresh", kms.EncryptDecrypt, "aes-256-gcm", b64(randomBytes(t, 32))},
			importEntry{"existing", kms.EncryptDecrypt, "aes-256-gcm", b64(randomBytes(t, 32))},
			importEntry{"short-rsa", kms.SignVerify, "RSA_4096", pkcs8PEM(t, rsa2048)},
			importEntry{"short-aes", kms.EncryptDecrypt, "aes-256-gcm", b64(randomBytes(t, 16))},
		)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Len(t, result.Keys, 1)
		require.Equal(t, "fresh", result.Keys[0].Name)
		errs := map[string]string{}
		for _, e := range result.Errors {
			errs[e.Name] = e.Message
		}
		require.Equal(t, map[string]string{
			"existing":  `A key with the name "existing" already exists in this project`,
			"short-rsa": "Key material does not match the declared algorithm. Expected an RSA 4096-bit key.",
			"short-aes": "Invalid key material length for aes-256-gcm. Expected 32 bytes, got 16.",
		}, errs)
		require.Equal(t, existing, kms.GetKey(t, proj, existing.ID))
	})

	t.Run("should refuse only the ML-DSA entries when the plan does not include kms_pqc", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		source := newProject(t, tn)
		mldsa := kms.NewKey(t, source, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ML_DSA_44"))
		material := b64(kms.ExportPrivateKey(t, source, mldsa.ID))
		target := newProject(t, tn)
		tn.SetPlan(t, license.Enterprise().Without(license.KMSPQC))

		// Action
		res, result := bulkImport(t, tn.Admin.API, target,
			importEntry{"classical", kms.EncryptDecrypt, "aes-256-gcm", b64(randomBytes(t, 32))},
			importEntry{"post-quantum", kms.SignVerify, "ML_DSA_44", material},
		)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Len(t, result.Errors, 1)
		require.Equal(t, "post-quantum", result.Errors[0].Name)
		require.Equal(t, "Your license does not include PQC algorithms. Please upgrade to the Enterprise plan to use a PQC algorithm.",
			result.Errors[0].Message)
		page, err := tn.Admin.API.ListKmsKeysWithResponse(t.Context(), &api.ListKmsKeysParams{ProjectId: target.ID})
		require.NoError(t, err)
		require.Equal(t, []string{"classical"}, listedNames(t, page.Body))
	})

	t.Run("should refuse a viewer and create nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		res, _ := bulkImport(t, viewer.API, proj, importEntry{"aes", kms.EncryptDecrypt, "aes-256-gcm", b64(randomBytes(t, 32))})

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, "You are not allowed to create on cmek", apierr.Message(res.Body))
		page, err := proj.Tenant().Admin.API.ListKmsKeysWithResponse(t.Context(), &api.ListKmsKeysParams{ProjectId: proj.ID})
		require.NoError(t, err)
		require.Empty(t, listedNames(t, page.Body))
	})
}

func listedNames(t *testing.T, body []byte) []string {
	t.Helper()
	page := kms.Decode[struct{ Keys []kms.Key }](t, body)
	out := make([]string, 0, len(page.Keys))
	for _, k := range page.Keys {
		out = append(out, k.Name)
	}
	sort.Strings(out)
	return out
}
