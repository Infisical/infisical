package license

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestPlan_Payload(t *testing.T) {
	t.Parallel()

	t.Run("should turn on every known feature when the plan is enterprise", func(t *testing.T) {
		t.Parallel()

		// Action
		p := Enterprise()

		// Assert: projectV2ToFeatureSet layers over the OSS defaults, so an omitted
		// feature stays off.
		for _, f := range All {
			require.Containsf(t, p.Features, f.V2, "enterprise omits %s", f.V2)
		}
	})

	t.Run("should carry no features when the plan is free", func(t *testing.T) {
		t.Parallel()
		require.Empty(t, Free.Features, "a downgraded customer gets the OSS defaults, not explicit falses")
	})

	t.Run("should entitle a cap as a number", func(t *testing.T) {
		t.Parallel()

		// Action
		p := Enterprise()

		// Assert
		for _, f := range []Feature{MaxInternalCAs, AuditRetentionDays} {
			require.IsTypef(t, 0, p.Features[f.V2], "%s projects onto a numeric field", f.V2)
		}
	})

	t.Run("should raise the plan rate limits rather than merely enable them", func(t *testing.T) {
		t.Parallel()

		// Action
		p := Enterprise()

		// Assert
		for _, f := range []Feature{ReadRateLimit, WriteRateLimit, SecretsRateLimit} {
			got, ok := p.Features[f.V2].(int)
			require.Truef(t, ok, "%s is not a number", f.V2)
			require.GreaterOrEqualf(t, got, 100_000, "%s would throttle the suite", f.V2)
		}
	})

	t.Run("should leave the original untouched when Without is called", func(t *testing.T) {
		t.Parallel()

		// Setup
		base := Enterprise()

		// Action
		_ = base.Without(RBAC)

		// Assert
		require.Equal(t, true, base.Features[RBAC.V2], "Without mutated the plan it was called on")
	})

	t.Run("should only expect features that have a plan field", func(t *testing.T) {
		t.Parallel()

		// Action
		expect := Enterprise().Expect()

		// Assert
		require.NotContains(t, expect, "")
		require.Contains(t, expect, RBAC.V1)
	})
}

func TestServiceKey_IsParseablePEM(t *testing.T) {
	t.Parallel()

	// Action
	key := serviceKey()

	// Assert: the license client parses it before sending anything.
	require.Regexp(t, `^-----BEGIN PRIVATE KEY-----`, key)
}

func TestOrg_UsageReports(t *testing.T) {
	t.Parallel()
	spec.Why(t, `A refused report is retried by the instance ten times per metered dimension,
		which shows up as a slower run rather than a failing one.`)

	t.Run("should accept a usage snapshot", func(t *testing.T) {
		t.Parallel()

		// Setup
		req := httptest.NewRequest(http.MethodPost, "/v1/organizations/org-1/usage-snapshots",
			strings.NewReader(`{"snapshots":[{"dimension_key":"identities","value":3}]}`))
		rec := httptest.NewRecorder()

		// Action
		(&Org{plan: Enterprise()}).ServeHTTP(rec, req)

		// Assert
		require.Equal(t, http.StatusOK, rec.Code)
	})

	t.Run("should accept every usage event and name each by its id", func(t *testing.T) {
		t.Parallel()

		// Setup
		req := httptest.NewRequest(http.MethodPost, "/v1/organizations/org-1/usage-events",
			strings.NewReader(`{"events":[{"event_id":"a"},{"event_id":"b"}]}`))
		rec := httptest.NewRecorder()

		// Action
		(&Org{plan: Enterprise()}).ServeHTTP(rec, req)

		// Assert
		require.Equal(t, http.StatusOK, rec.Code)
		var body struct {
			Results []map[string]string `json:"results"`
		}
		require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &body))
		require.Equal(t, []map[string]string{
			{"event_id": "a", "status": "accepted"},
			{"event_id": "b", "status": "accepted"},
		}, body.Results)
	})
}
