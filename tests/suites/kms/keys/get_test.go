package keys_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/kms"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// keyOperation sends one key-id route with a body that passes validation, so the answer is about the key.
type keyOperation func(t *testing.T, client *api.ClientWithResponses, keyID uuid.UUID) (int, []byte)

func keyOperations() map[string]keyOperation {
	return map[string]keyOperation{
		"get": func(t *testing.T, c *api.ClientWithResponses, id uuid.UUID) (int, []byte) {
			res, err := c.GetKmsKeyByIdWithResponse(t.Context(), id)
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		},
		"update": func(t *testing.T, c *api.ClientWithResponses, id uuid.UUID) (int, []byte) {
			res, err := c.UpdateKmsKeyWithBodyWithResponse(t.Context(), id, "application/json",
				kms.JSON(t, map[string]any{"description": "changed"}))
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		},
		"rotate": func(t *testing.T, c *api.ClientWithResponses, id uuid.UUID) (int, []byte) {
			res, err := c.RotateKmsKeyWithResponse(t.Context(), id)
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		},
		"delete": func(t *testing.T, c *api.ClientWithResponses, id uuid.UUID) (int, []byte) {
			res, err := c.DeleteKmsKeyWithResponse(t.Context(), id)
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		},
		"encrypt": func(t *testing.T, c *api.ClientWithResponses, id uuid.UUID) (int, []byte) {
			res, err := c.EncryptWithKmsKeyWithBodyWithResponse(t.Context(), id, "application/json",
				kms.JSON(t, map[string]any{"plaintext": b64("secret")}))
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		},
		"decrypt": func(t *testing.T, c *api.ClientWithResponses, id uuid.UUID) (int, []byte) {
			res, err := c.DecryptWithKmsKeyWithBodyWithResponse(t.Context(), id, "application/json",
				kms.JSON(t, map[string]any{"ciphertext": b64("not-really-ciphertext")}))
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		},
		"public key": func(t *testing.T, c *api.ClientWithResponses, id uuid.UUID) (int, []byte) {
			res, err := c.GetKmsKeyPublicKeyWithResponse(t.Context(), id)
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		},
		"private key": func(t *testing.T, c *api.ClientWithResponses, id uuid.UUID) (int, []byte) {
			res, err := c.GetKmsKeyPrivateKeyWithResponse(t.Context(), id)
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		},
		"signing algorithms": func(t *testing.T, c *api.ClientWithResponses, id uuid.UUID) (int, []byte) {
			res, err := c.ListKmsKeySigningAlgorithmsWithResponse(t.Context(), id)
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		},
		"sign": func(t *testing.T, c *api.ClientWithResponses, id uuid.UUID) (int, []byte) {
			res, err := c.SignWithKmsKeyWithBodyWithResponse(t.Context(), id, "application/json",
				kms.JSON(t, map[string]any{"signingAlgorithm": "RSASSA_PSS_SHA_256", "data": b64("message")}))
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		},
		"verify": func(t *testing.T, c *api.ClientWithResponses, id uuid.UUID) (int, []byte) {
			res, err := c.VerifyWithKmsKeyWithBodyWithResponse(t.Context(), id, "application/json",
				kms.JSON(t, map[string]any{"signingAlgorithm": "RSASSA_PSS_SHA_256", "data": b64("message"), "signature": b64("sig")}))
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		},
		"generate mac": func(t *testing.T, c *api.ClientWithResponses, id uuid.UUID) (int, []byte) {
			res, err := c.GenerateMacWithKmsKeyWithBodyWithResponse(t.Context(), id, "application/json",
				kms.JSON(t, map[string]any{"data": b64("message")}))
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		},
		"verify mac": func(t *testing.T, c *api.ClientWithResponses, id uuid.UUID) (int, []byte) {
			res, err := c.VerifyMacWithKmsKeyWithBodyWithResponse(t.Context(), id, "application/json",
				kms.JSON(t, map[string]any{"data": b64("message"), "mac": b64("mac")}))
			require.NoError(t, err)
			return res.StatusCode(), res.Body
		},
	}
}

func TestKmsKey_Get(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the key by id and by name within its project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := newProject(t, tn)
		key := kms.NewKey(t, proj, kms.WithName("billing"))

		// Action
		byName, err := tn.Admin.API.GetKmsKeyByNameWithResponse(t.Context(), "billing", &api.GetKmsKeyByNameParams{ProjectId: proj.ID})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, byName.StatusCode(), byName.Body)
		require.Equal(t, key, kms.Decode[struct{ Key kms.Key }](t, byName.Body).Key)
		require.Equal(t, key, kms.GetKey(t, proj, key.ID))
	})

	t.Run("should not find a key by name through a different project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		owner, other := newProject(t, tn), newProject(t, tn)
		kms.NewKey(t, owner, kms.WithName("billing"))

		// Action
		res, err := tn.Admin.API.GetKmsKeyByNameWithResponse(t.Context(), "billing", &api.GetKmsKeyByNameParams{ProjectId: other.ID})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, res.StatusCode(), res.Body)
		require.Equal(t, `Key with name "billing" not found for project with ID "`+other.ID+`"`, apierr.Message(res.Body))
	})

	t.Run("should not expose or operate on the organization's internal key", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		secretmanager.CreateSecret(t, fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager")), "dev", "TOKEN", "value")
		org, err := tn.Admin.API.GetOrganizationByIdWithResponse(t.Context(), tn.OrgID.String())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, org.StatusCode(), org.Body)
		internalKeyID := kms.Decode[struct {
			Organization struct {
				KmsDefaultKeyID uuid.UUID `json:"kmsDefaultKeyId"`
			}
		}](t, org.Body).Organization.KmsDefaultKeyID
		require.NotEqual(t, uuid.Nil, internalKeyID)
		ops := keyOperations()

		// Action
		statuses := map[string]int{}
		for _, name := range []string{"get", "encrypt", "private key"} {
			statuses[name], _ = ops[name](t, tn.Admin.API, internalKeyID)
		}

		// Assert
		require.Equal(t, map[string]int{
			"get": http.StatusNotFound, "encrypt": http.StatusBadRequest, "private key": http.StatusNotFound,
		}, statuses)
	})

	t.Run("should answer another organization's key id with the same 404 as an unknown id on every key route", func(t *testing.T) {
		t.Parallel()

		// Setup
		owner, outsider := h.NewTenant(t), h.NewTenant(t)
		proj := newProject(t, owner)
		key := kms.NewKey(t, proj)
		unknownID := uuid.New()

		for name, op := range keyOperations() {
			// Action
			crossStatus, crossBody := op(t, outsider.Admin.API, key.ID)
			unknownStatus, unknownBody := op(t, outsider.Admin.API, unknownID)

			// Assert
			require.Equalf(t, http.StatusNotFound, crossStatus, "%s: %s", name, apierr.Body(crossBody))
			require.Equalf(t, http.StatusNotFound, unknownStatus, "%s: %s", name, apierr.Body(unknownBody))
			require.Equalf(t, strings.ReplaceAll(apierr.Message(unknownBody), unknownID.String(), key.ID.String()),
				apierr.Message(crossBody), "%s", name)
		}
		byName, err := outsider.Admin.API.GetKmsKeyByNameWithResponse(t.Context(), key.Name, &api.GetKmsKeyByNameParams{ProjectId: proj.ID})
		require.NoError(t, err)
		requireStatus(t, http.StatusNotFound, byName.StatusCode(), byName.Body)
		require.Equal(t, key, kms.GetKey(t, proj, key.ID))
	})
}
