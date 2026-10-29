package sharedsecrets_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSharedSecret_List(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list only the caller's own shares, newest first, up to the limit", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := tn.NewMachineIdentity(t)
		for _, name := range []string{"first", "second", "third"} {
			share(t, tn.Admin.API, api.CreateSharedSecretJSONRequestBody{SecretValue: "v", Name: new(name)})
		}
		share(t, other.API, api.CreateSharedSecretJSONRequestBody{SecretValue: "v", Name: new("not-mine")})

		// Action
		names, total := shareNames(t, tn.Admin, new(float32(2)))

		// Assert
		require.Equal(t, []string{"third", "second"}, names)
		require.Equal(t, 3, total)
	})
}
