package honeytokens_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestHoneyToken_Create(t *testing.T) {
	t.Parallel()

	t.Run("should create an IAM user with one key and plant the key in the mapped secrets", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)

		// Action
		res := e.create(t)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		users := e.honeyUsers(t)
		require.Len(t, users, 1)
		for _, u := range users {
			require.Len(t, u.AccessKeys, 1)
			require.Equal(t, u.AccessKeys[0].AccessKeyID, e.planted(t, accessKeyIDKey))
			require.Equal(t, u.AccessKeys[0].SecretAccessKey, e.planted(t, secretAccessKeyKey))
		}
		require.ElementsMatch(t, []string{accessKeyIDKey, secretAccessKeyKey}, e.secretKeys(t))
	})

	t.Run("should refuse naming the pending verification and create nothing when the stack is not deployed", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t, stackIn(""))

		// Action
		res := e.create(t)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, apierr.Body(res.Body), "stack verification is still pending")
		require.Empty(t, e.honeyUsers(t))
		require.Empty(t, e.secretKeys(t))
	})
}

func TestHoneyToken_Trigger(t *testing.T) {
	t.Parallel()

	t.Run("should record the event and mark the token triggered when the signature is valid", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		tokenID := e.newHoneyToken(t)

		// Action
		res := e.trigger(t, e.planted(t, accessKeyIDKey), e.signingKey)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.True(t, res.JSON200.Acknowledged)
		require.Equal(t, "triggered", e.status(t, tokenID))
		require.Equal(t, 1, e.eventCount(t, tokenID))
	})

	t.Run("should refuse with 401 and record nothing when the signature is made with another key", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		tokenID := e.newHoneyToken(t)

		// Action
		res := e.trigger(t, e.planted(t, accessKeyIDKey), randomHex(t, 32))

		// Assert
		require.Equal(t, http.StatusUnauthorized, res.StatusCode())
		require.Equal(t, "active", e.status(t, tokenID))
		require.Equal(t, 0, e.eventCount(t, tokenID))
	})
}

func TestHoneyToken_Revoke(t *testing.T) {
	t.Parallel()

	t.Run("should delete the IAM key and user and the mapped secrets when revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		tokenID := e.newHoneyToken(t)

		// Action
		res := e.revoke(t, tokenID)

		// Assert
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		e.cp.IAM.ExpectEvent[aws.UserDeleted](t, nil)
		require.Empty(t, e.honeyUsers(t))
		require.Empty(t, e.secretKeys(t))
		require.Equal(t, "revoked", e.status(t, tokenID))
	})

	t.Run("should refuse a revoke and keep the key when the plan does not include honey tokens", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Today's gating, pinned for the license clean-up: a downgrade blocks the
			revoke, so a planted key stays live in AWS.`)

		// Setup
		e := setup(t)
		tokenID := e.newHoneyToken(t)
		planted := e.planted(t, accessKeyIDKey)
		e.tn.SetPlan(t, license.Enterprise().Without(license.HoneyTokens))

		// Action
		res := e.revoke(t, tokenID)

		// Assert
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Contains(t, apierr.Body(res.Body), "Failed to revoke honey token due to plan restriction")
		require.Equal(t, planted, e.planted(t, accessKeyIDKey))
		require.Len(t, e.honeyUsers(t), 1)
	})
}
