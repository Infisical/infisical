package crypto_test

import (
	"crypto/sha256"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestKmsKey_SignVerify(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	ecdsa := []string{"ECDSA_SHA_512", "ECDSA_SHA_384", "ECDSA_SHA_256"}
	offered := map[string][]string{
		"RSA_4096": {"RSASSA_PSS_SHA_512", "RSASSA_PSS_SHA_384", "RSASSA_PSS_SHA_256",
			"RSASSA_PKCS1_V1_5_SHA_512", "RSASSA_PKCS1_V1_5_SHA_384", "RSASSA_PKCS1_V1_5_SHA_256"},
		"ECC_NIST_P256": ecdsa,
		"ECC_NIST_P384": ecdsa,
		"ECC_NIST_P521": ecdsa,
		"ED25519":       {"ED25519"},
		"ML_DSA_44":     {"ML_DSA_44"},
		"ML_DSA_65":     {"ML_DSA_65"},
		"ML_DSA_87":     {"ML_DSA_87"},
	}

	for keyAlgorithm, signingAlgorithms := range offered {
		t.Run("should offer exactly its signing algorithms, and sign with each so both Infisical and a standard library verify, for "+keyAlgorithm, func(t *testing.T) {
			t.Parallel()

			// Setup
			tn := h.NewTenant(t)
			proj := newProject(t, tn)
			key := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm(keyAlgorithm))
			publicKey := publicKey(t, proj, key.ID)
			data := []byte("release-v1.2.3.tar.gz")

			// Action
			listed, err := tn.Admin.API.ListKmsKeySigningAlgorithmsWithResponse(t.Context(), key.ID)
			require.NoError(t, err)
			signatures := map[string][]byte{}
			for _, algorithm := range signingAlgorithms {
				signatures[algorithm] = signOK(t, tn.Admin.API, key.ID, algorithm, data)
			}

			// Assert
			requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
			require.Equal(t, signingAlgorithms, kms.Decode[struct{ SigningAlgorithms []string }](t, listed.Body).SigningAlgorithms)
			for algorithm, signature := range signatures {
				require.Truef(t, verify(t, tn.Admin.API, key.ID, algorithm, data, signature, false), "%s", algorithm)
				require.NoErrorf(t, verifyLocally(t, publicKey, algorithm, data, signature), "%s", algorithm)
			}
		})
	}

	t.Run("should report the signature invalid when the data was changed or the signature came from another key, and log the failed verification", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ECC_NIST_P256"))
		other := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ECC_NIST_P256"))
		signature := signOK(t, tn.Admin.API, key.ID, "ECDSA_SHA_256", []byte("original"))
		otherSignature := signOK(t, tn.Admin.API, other.ID, "ECDSA_SHA_256", []byte("original"))

		// Action
		changedData := verify(t, tn.Admin.API, key.ID, "ECDSA_SHA_256", []byte("changed"), signature, false)
		otherKey := verify(t, tn.Admin.API, key.ID, "ECDSA_SHA_256", []byte("original"), otherSignature, false)

		// Assert
		require.False(t, changedData)
		require.False(t, otherKey)
		require.True(t, verify(t, tn.Admin.API, key.ID, "ECDSA_SHA_256", []byte("original"), signature, false))
		failed := fixture.WaitForAuditEvents(t, tn, "cmek-verify", 2, func(e fixture.AuditEvent) bool {
			return e.Metadata["keyId"] == key.ID.String() && e.Metadata["signatureValid"] == false
		})
		require.Len(t, failed, 2)
		require.Equal(t, tn.Admin.ID.String(), failed[0].Actor["userId"])
	})

	t.Run("should verify a raw message against a signature made over its SHA-256 digest", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		rsaKey := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("RSA_4096"))
		ecKey := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ECC_NIST_P256"))
		message := []byte("a large artifact")
		digest := sha256.Sum256(message)

		for key, algorithm := range map[*kms.Key]string{&rsaKey: "RSASSA_PKCS1_V1_5_SHA_256", &ecKey: "ECDSA_SHA_256"} {
			// Action
			res, out := sign(t, tn.Admin.API, key.ID, algorithm, digest[:], true)

			// Assert
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
			require.Truef(t, verify(t, tn.Admin.API, key.ID, algorithm, message, unb64(t, out.Signature), false), "%s", algorithm)
		}
	})

	t.Run("should refuse digest input for ED25519, ML-DSA and RSA-PSS", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		digest := sha256.Sum256([]byte("message"))
		cases := map[string]struct{ keyAlgorithm, message string }{
			"ED25519":            {"ED25519", "ED25519 does not support digested input"},
			"ML_DSA_44":          {"ML_DSA_44", "ML-DSA does not support digested input"},
			"RSASSA_PSS_SHA_256": {"RSA_4096", "RSA PSS does not support digested input"},
		}

		for signingAlgorithm, c := range cases {
			key := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm(c.keyAlgorithm))

			// Action
			res, _ := sign(t, tn.Admin.API, key.ID, signingAlgorithm, digest[:], true)

			// Assert
			requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
			require.Equal(t, c.message, apierr.Message(res.Body))
		}
	})

	t.Run("should refuse a signing algorithm the key does not support", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ED25519"))

		// Action
		res, _ := sign(t, tn.Admin.API, key.ID, "ECDSA_SHA_256", []byte("message"), false)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "KMS ED25519 key cannot be used with ECDSA_SHA_256 signing algorithm", apierr.Message(res.Body))
	})

	t.Run("should keep signing and verifying with an existing ML-DSA key once the plan no longer includes kms_pqc", func(t *testing.T) {
		t.Parallel()
		spec.Ref(t, "backend/CODE_QUALITY.md#license-checks: existing objects keep working, only creating and editing is blocked")

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ML_DSA_44"))
		tn.SetPlan(t, license.Enterprise().Without(license.KMSPQC))

		// Action
		signature := signOK(t, tn.Admin.API, key.ID, "ML_DSA_44", []byte("message"))

		// Assert
		require.True(t, verify(t, tn.Admin.API, key.ID, "ML_DSA_44", []byte("message"), signature, false))
		require.NoError(t, verifyLocally(t, publicKey(t, proj, key.ID), "ML_DSA_44", []byte("message"), signature))
	})
}
