package license

import (
	"strings"
	"testing"
)

func TestPlan_Payload(t *testing.T) {
	t.Parallel()

	t.Run("ok/enterprise turns on every feature the list knows", func(t *testing.T) {
		t.Parallel()
		p := Enterprise()
		for _, f := range All {
			if _, ok := p.Features[f.V2]; !ok {
				t.Fatalf("enterprise omits %s; projectV2ToFeatureSet layers over the OSS "+
					"defaults, so anything omitted stays off", f.V2)
			}
		}
	})

	t.Run("ok/free omits every feature rather than disabling them", func(t *testing.T) {
		t.Parallel()
		if len(Free.Features) != 0 {
			t.Fatalf("free carries %d features; a downgraded customer gets the OSS "+
				"defaults, not an explicit set of falses", len(Free.Features))
		}
	})

	t.Run("ok/a cap is a number, not a boolean", func(t *testing.T) {
		t.Parallel()
		p := Enterprise()
		for _, f := range []Feature{MaxInternalCAs, AuditRetentionDays} {
			if _, isBool := p.Features[f.V2].(bool); isBool {
				t.Errorf("%s is entitled as a boolean; it projects onto a numeric "+
					"TFeatureSet field", f.V2)
			}
		}
	})

	t.Run("ok/Without leaves the original untouched", func(t *testing.T) {
		t.Parallel()
		base := Enterprise()
		_ = base.Without(RBAC)
		if base.Features[RBAC.V2] != true {
			t.Fatal("Without mutated the plan it was called on, so one test would " +
				"change another's entitlements")
		}
	})

	t.Run("ok/Expect covers only features with somewhere to check them", func(t *testing.T) {
		t.Parallel()
		expect := Enterprise().Expect()
		if _, ok := expect[""]; ok {
			t.Fatal("Expect includes a feature with no TFeatureSet field")
		}
		if _, ok := expect[RBAC.V1]; !ok {
			t.Fatalf("Expect omits %s, which does map to a plan field", RBAC.V1)
		}
	})
}

func TestServiceKey_IsParseablePEM(t *testing.T) {
	t.Parallel()
	key := serviceKey()
	if !strings.HasPrefix(key, "-----BEGIN PRIVATE KEY-----") {
		t.Fatalf("service key is not PKCS#8 PEM; the license client parses it before "+
			"signing and fails before sending anything.\ngot: %.40s", key)
	}
}
