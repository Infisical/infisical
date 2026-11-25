package aws

import (
	"encoding/json"
	"testing"

	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

// hostedZones builds the fake and releases it when the test ends, since Seed registers
// it in the process-wide publicCNAMEs.
func hostedZones(t *testing.T, events fakenet.Emitter) *HostedZones {
	t.Helper()
	z := newHostedZones(service{}, events).(*HostedZones)
	t.Cleanup(z.Release)
	return z
}

func TestHostedZones_Release(t *testing.T) {
	t.Run("should keep a validation CNAME withdrawn when a request finishes after the scope is released", func(t *testing.T) {
		// Setup
		z := hostedZones(t, fakenet.Emitter{})
		seed, err := json.Marshal(map[string]any{"zones": map[string]any{"ZR": map[string]any{"name": "released.test",
			"records": []map[string]any{{"name": "_x.Released.test", "type": "CNAME", "values": []string{"_y.acm-validations.aws."}}}}}})
		require.NoError(t, err)
		require.NoError(t, z.Seed(seed))
		require.True(t, cnameServed("_x.released.test.", "_y.acm-validations.aws"))

		// Action
		z.Release()
		require.NoError(t, z.Seed(seed))

		// Assert
		require.False(t, cnameServed("_x.released.test.", "_y.acm-validations.aws"))
	})
}

func TestHostedZones_TXT(t *testing.T) {
	txtSeed := func(t *testing.T, values ...string) []byte {
		t.Helper()
		records := []map[string]any{}
		if len(values) > 0 {
			records = append(records, map[string]any{"name": "_acme-challenge.Txt.test", "type": "TXT", "values": values})
		}
		raw, err := json.Marshal(map[string]any{"zones": map[string]any{"ZT": map[string]any{"name": "txt.test", "records": records}}})
		require.NoError(t, err)
		return raw
	}
	const name = "_acme-challenge.txt.test"

	t.Run("should serve a seeded TXT record and withdraw it on a reseed that drops it", func(t *testing.T) {
		// Setup
		srv := fakenet.New()
		z := hostedZones(t, srv.Emitter("route53.amazonaws.com", "a"))

		// Action
		require.NoError(t, z.Seed(txtSeed(t, `"token-a"`)))
		served := srv.Emitter("", "").LookupTXT(name)
		require.NoError(t, z.Seed(txtSeed(t)))

		// Assert
		require.Equal(t, []string{"token-a"}, served)
		require.Empty(t, srv.Emitter("", "").LookupTXT(name))
	})

	t.Run("should withdraw the TXT answer on release and not republish it from a late reseed", func(t *testing.T) {
		// Setup
		srv := fakenet.New()
		z := hostedZones(t, srv.Emitter("route53.amazonaws.com", "a"))
		require.NoError(t, z.Seed(txtSeed(t, `"token-a"`)))

		// Action
		z.Release()
		require.NoError(t, z.Seed(txtSeed(t, `"token-a"`)))

		// Assert
		require.Empty(t, srv.Emitter("", "").LookupTXT(name))
	})

	t.Run("should leave another publisher's later TXT answer on release", func(t *testing.T) {
		// Setup
		srv := fakenet.New()
		a := hostedZones(t, srv.Emitter("route53.amazonaws.com", "a"))
		b := hostedZones(t, srv.Emitter("route53.amazonaws.com", "b"))
		require.NoError(t, a.Seed(txtSeed(t, `"token-a"`)))
		require.NoError(t, b.Seed(txtSeed(t, `"token-b"`)))

		// Action
		a.Release()

		// Assert
		require.Equal(t, []string{"token-b"}, srv.Emitter("", "").LookupTXT(name))
	})

	t.Run("should leave another publisher's later TXT answer when a reseed drops one of two records at the name", func(t *testing.T) {
		// Setup
		srv := fakenet.New()
		a := hostedZones(t, srv.Emitter("route53.amazonaws.com", "a"))
		b := hostedZones(t, srv.Emitter("route53.amazonaws.com", "b"))
		second, err := json.Marshal(map[string]any{"zones": map[string]any{"ZU": map[string]any{"name": "txt.test",
			"records": []map[string]any{{"name": name, "type": "TXT", "values": []string{`"token-a2"`}}}}}})
		require.NoError(t, err)
		require.NoError(t, a.Seed(txtSeed(t, `"token-a1"`)))
		require.NoError(t, a.Seed(second))
		require.NoError(t, b.Seed(txtSeed(t, `"token-b"`)))

		// Action
		require.NoError(t, a.Seed(txtSeed(t)))

		// Assert
		require.Equal(t, []string{"token-b"}, srv.Emitter("", "").LookupTXT(name))
	})

	t.Run("should answer with the TXT values left when a reseed drops one of two records at the name", func(t *testing.T) {
		// Setup
		srv := fakenet.New()
		a := hostedZones(t, srv.Emitter("route53.amazonaws.com", "a"))
		second, err := json.Marshal(map[string]any{"zones": map[string]any{"ZU": map[string]any{"name": "txt.test",
			"records": []map[string]any{{"name": name, "type": "TXT", "values": []string{`"token-a2"`}}}}}})
		require.NoError(t, err)
		require.NoError(t, a.Seed(txtSeed(t, `"token-a1"`)))
		require.NoError(t, a.Seed(second))

		// Action
		require.NoError(t, a.Seed(txtSeed(t)))

		// Assert
		require.Equal(t, []string{"token-a2"}, srv.Emitter("", "").LookupTXT(name))
	})

	t.Run("should not rewrite TXT answers on a seed that changes only the policy", func(t *testing.T) {
		// Setup
		srv := fakenet.New()
		a := hostedZones(t, srv.Emitter("route53.amazonaws.com", "a"))
		b := hostedZones(t, srv.Emitter("route53.amazonaws.com", "b"))
		require.NoError(t, a.Seed(txtSeed(t, `"token-a"`)))
		require.NoError(t, b.Seed(txtSeed(t, `"token-b"`)))

		// Action
		require.NoError(t, a.Seed([]byte(`{"denied":["route53:ChangeResourceRecordSets"]}`)))

		// Assert
		require.Equal(t, []string{"token-b"}, srv.Emitter("", "").LookupTXT(name))
	})
}
