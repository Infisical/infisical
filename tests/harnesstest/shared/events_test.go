package harnesstest_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/fakes/oauth"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/spec"
)

func TestEvents_DerivedScopes(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should deliver an event published under a scope derived from the credential", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `GCP scopes by a service account email and Key Vault by a client UUID, neither
			of which carries the binary's prefix, so the stream has to take those hosts whole.`)

		// Setup
		tn := h.NewTenant(t)

		// Action
		conn := fixture.NewAppConnection(t, tn, fixture.GCPServiceAccountAppConnection(tn))

		// Assert
		gcp := oauth.OpenGCP(t, conn.FakenetAdmin(t), fixture.GCPServiceAccountEmail(tn, conn.Nonce()))
		gcp.IAM.ExpectEvent[oauth.AccessTokenGenerated](t, nil)
	})
}
