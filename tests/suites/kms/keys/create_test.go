package keys_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestKmsKey_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should create an exportable aes-256-gcm encrypt-decrypt key at version 1 when only a name is given", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))

		// Action
		key := kms.NewKey(t, proj, kms.WithName("payments"))

		// Assert
		require.Equal(t, "payments", key.Name)
		require.Equal(t, kms.EncryptDecrypt, key.KeyUsage)
		require.Equal(t, "aes-256-gcm", key.Algorithm)
		require.Equal(t, 1, key.Version)
		require.True(t, key.IsExportable)
		require.False(t, key.HasDeleteProtection)
		require.False(t, key.IsDisabled)
	})

	t.Run("should create sign-verify and MAC keys when the algorithm matches the usage", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))

		// Action
		signing := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ECC_NIST_P256"))
		mac := kms.NewKey(t, proj, kms.WithUsage(kms.MAC), kms.WithAlgorithm("HMAC_SHA_512"))

		// Assert
		require.Equal(t, []string{kms.SignVerify, "ECC_NIST_P256"}, []string{signing.KeyUsage, signing.Algorithm})
		require.Equal(t, []string{kms.MAC, "HMAC_SHA_512"}, []string{mac.KeyUsage, mac.Algorithm})
	})

	t.Run("should refuse and store nothing when the algorithm does not match the usage", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)

		// Action
		res, err := tn.Admin.API.CreateKmsKeyWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t,
			kms.CreateBody(proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("aes-256-gcm"))))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "algorithm must be a valid asymmetric sign-verify algorithm")
		require.Empty(t, keyNames(t, proj))
	})

	t.Run("should refuse and keep the original when a name is reused in the same project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		original := kms.NewKey(t, proj, kms.WithName("orders"))

		// Action
		res, err := tn.Admin.API.CreateKmsKeyWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t,
			kms.CreateBody(proj, kms.WithName("orders"), kms.WithUsage(kms.MAC), kms.WithAlgorithm("HMAC_SHA_256"))))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, `A KMS key with the name "orders" already exists for the project with ID "`+proj.ID+`"`,
			apierr.Message(res.Body))
		require.Equal(t, []string{"orders"}, keyNames(t, proj))
		require.Equal(t, kms.EncryptDecrypt, kms.GetKey(t, proj, original.ID).KeyUsage)
	})

	t.Run("should allow the same name in another project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		first, second := newProject(t, tn), newProject(t, tn)
		kms.NewKey(t, first, kms.WithName("shared-name"))

		// Action
		key := kms.NewKey(t, second, kms.WithName("shared-name"))

		// Assert
		require.Equal(t, second.ID, key.ProjectID)
		require.Equal(t, []string{"shared-name"}, keyNames(t, first))
	})

	t.Run("should refuse a name that is not a lowercase slug and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)

		// Action
		res, err := tn.Admin.API.CreateKmsKeyWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t,
			kms.CreateBody(proj, kms.WithName("Payments_Key"))))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnprocessableEntity, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Name field can only contain lowercase letters, numbers, and hyphens")
		require.Empty(t, keyNames(t, proj))
	})

	t.Run("should store a 255-character description and refuse 256 characters with a validation message", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		body := func(name string, length int) map[string]any {
			b := kms.CreateBody(proj, kms.WithName(name))
			b["description"] = strings.Repeat("d", length)
			return b
		}

		// Action
		fits, err := tn.Admin.API.CreateKmsKeyWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t, body("fits", 255)))
		require.NoError(t, err)
		tooLong, err := tn.Admin.API.CreateKmsKeyWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t, body("too-long", 256)))
		require.NoError(t, err)

		// Assert
		requireStatus(t, http.StatusOK, fits.StatusCode(), fits.Body)
		requireStatus(t, http.StatusUnprocessableEntity, tooLong.StatusCode(), tooLong.Body)
		require.Contains(t, string(tooLong.Body), "String must contain at most 255 character(s)")
		require.Equal(t, []string{"fits"}, keyNames(t, proj))
	})

	t.Run("should refuse creating a key in a project that is not a KMS project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		res, err := tn.Admin.API.CreateKmsKeyWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t, kms.CreateBody(proj)))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "The project is of type secret-manager. Operations of type kms are not allowed.", apierr.Message(res.Body))
	})

	t.Run("should refuse a viewer and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))
		viewer := proj.NewMachineIdentity(t, fixture.WithRoles("viewer"))

		// Action
		res, err := viewer.API.CreateKmsKeyWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t, kms.CreateBody(proj)))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, "You are not allowed to create on cmek", apierr.Message(res.Body))
		require.Empty(t, keyNames(t, proj))
	})

	t.Run("should refuse an ML-DSA key and store nothing when the plan does not include kms_pqc", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.KMSPQC)))
		proj := newProject(t, tn)

		// Action
		res, err := tn.Admin.API.CreateKmsKeyWithBodyWithResponse(t.Context(), "application/json", kms.JSON(t,
			kms.CreateBody(proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ML_DSA_65"))))

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Equal(t, "Your license does not include PQC algorithms. Please upgrade to the Enterprise plan to use a PQC algorithm.",
			apierr.Message(res.Body))
		require.Empty(t, keyNames(t, proj))
	})

	t.Run("should create an ML-DSA key when the plan includes kms_pqc", func(t *testing.T) {
		t.Parallel()

		// Setup
		proj := newProject(t, h.NewTenant(t))

		// Action
		key := kms.NewKey(t, proj, kms.WithUsage(kms.SignVerify), kms.WithAlgorithm("ML_DSA_65"))

		// Assert
		require.Equal(t, "ML_DSA_65", key.Algorithm)
	})
}
