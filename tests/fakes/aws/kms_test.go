package aws

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestKMSAccount_Seed(t *testing.T) {
	seed := func(t *testing.T, keyID string) error {
		t.Helper()
		raw, err := json.Marshal(map[string]any{"keys": map[string]any{keyID: map[string]any{}}})
		require.NoError(t, err)
		return (&KMSAccount{Keys: map[string]*KMSKey{}}).Seed(raw)
	}

	t.Run("should seed a key id in its 36-character form", func(t *testing.T) {
		// Action
		err := seed(t, uuid.NewString())

		// Assert
		require.NoError(t, err)
	})

	t.Run("should refuse key ids in UUID forms a ciphertext cannot name", func(t *testing.T) {
		id := uuid.NewString()
		for _, keyID := range []string{strings.ReplaceAll(id, "-", ""), "{" + id + "}", "urn:uuid:" + id} {
			// Action
			err := seed(t, keyID)

			// Assert
			require.ErrorContains(t, err, "36-character form", keyID)
		}
	})
}
