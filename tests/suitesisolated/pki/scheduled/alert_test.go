package scheduled_test

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// alertDispatch is how long a scheduled alert takes to reach its channel: the job only
// queues one dispatch per alert, which a worker then evaluates and delivers.
const alertDispatch = 30 * time.Second

// waitAlertLastRun polls the alert until done accepts the time of its last recorded run,
// zero before the first, and returns that time.
func waitAlertLastRun(t *testing.T, tn *harness.Tenant, alertID uuid.UUID, done func(time.Time) bool) time.Time {
	t.Helper()
	lastRun := func(res *api.GetAlertByIdResponse) time.Time {
		if res.JSON200.Alert.LastRun == nil {
			return time.Time{}
		}
		return res.JSON200.Alert.LastRun.Timestamp
	}
	res := pki.Poll(t, "reading the alert", func(ctx context.Context) (*api.GetAlertByIdResponse, int, []byte, error) {
		res, status, body, err := pki.ReadResponse(ctx, func(ctx context.Context) (*http.Response, error) {
			return tn.Admin.API.GetAlertById(ctx, alertID)
		}, api.ParseGetAlertByIdResponse)
		if err == nil && status == http.StatusOK && res.JSON200 == nil {
			err = fmt.Errorf("content type %q", res.HTTPResponse.Header.Get("Content-Type"))
		}
		return res, status, body, err
	}, func(res *api.GetAlertByIdResponse) bool { return done(lastRun(res)) }, wait.Timeout(alertDispatch), wait.Interval(time.Second))
	return lastRun(res)
}

func TestCertificateExpiryAlertJob(t *testing.T) {
	h := harness.From(t)

	t.Run("should post each certificate inside the alert window to the webhook once across two runs", func(t *testing.T) {
		spec.Why(t, "The second run posts a certificate issued after the first, which shows it evaluated the alert, so the first certificate's absence is deduplication.")

		// Setup
		tn := h.NewTenant(t)
		g := pki.NewGraph(t, tn)
		first := id.Short() + ".expiring.test"
		g.Issue(t, pki.ServerCertificate(first))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		alertID := fixture.NewCertificateExpiryAlert(t, tn.Admin, g.App.ID, "60d", sink.URL)
		runJob(t, h, api.DailyAlertProcessing)
		require.Contains(t, sink.ExpectEvent[webhook.DeliveryReceived](t, nil, fakenet.Within(alertDispatch)).Body, first)
		firstRun := waitAlertLastRun(t, tn, alertID, func(at time.Time) bool { return !at.IsZero() })
		second := id.Short() + ".expiring.test"
		g.Issue(t, pki.ServerCertificate(second))

		// Action
		// The dispatch records its run before its queued job is removed, and a trigger
		// while that job id is still held queues nothing, so trigger until a newer run is
		// recorded.
		waitAlertLastRun(t, tn, alertID, func(at time.Time) bool {
			if at.After(firstRun) {
				return true
			}
			runJob(t, h, api.DailyAlertProcessing)
			return false
		})

		// Assert
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, func(d webhook.DeliveryReceived) bool {
			return strings.Contains(d.Body, second)
		}, fakenet.Within(alertDispatch))
		require.NotContains(t, got.Body, first)
		sink.ExpectNoEvent[webhook.DeliveryReceived](t, func(d webhook.DeliveryReceived) bool {
			return strings.Contains(d.Body, first) || strings.Contains(d.Body, second)
		}, fakenet.Within(10*time.Second))
	})
}
