package scheduled_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// runJob runs a scheduled job once, as the instance admin, and returns when its
// handler has finished. Jobs whose handler only queues work return before that work.
func runJob(t *testing.T, h *harness.Stack, job api.TriggerAdminCronJobParamsJobName) {
	t.Helper()
	res, err := h.InstanceAdmin(t).API.TriggerAdminCronJobWithResponse(t.Context(), job)
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "running %s returned %s", job, apierr.Body(res.Body))
}

// Daily fire times of the jobs these tests trigger, in UTC.
const (
	certificateRenewalFire = 0
	caRenewalFire          = 0
	signerRenewalFire      = 10 * time.Minute
)

// avoidScheduledFire waits until the job's own daily run, scheduled at fire past
// midnight UTC, can no longer land between the test's setup and its trigger. The
// isolated instance keeps its schedule, and a scheduled run would renew the fixture
// first. The cron manager fires up to 5 minutes late, and the margin before covers setup.
// It skips the test when the wait would outlast the test binary's deadline.
func avoidScheduledFire(t *testing.T, fire time.Duration) {
	t.Helper()
	now := time.Now().UTC()
	midnight := now.Truncate(24 * time.Hour)
	for _, day := range []time.Time{midnight.AddDate(0, 0, -1), midnight, midnight.AddDate(0, 0, 1)} {
		from, until := day.Add(fire-3*time.Minute), day.Add(fire+6*time.Minute)
		if now.Before(from) || !now.Before(until) {
			continue
		}
		if deadline, ok := t.Deadline(); ok && until.After(deadline) {
			t.Skipf("the scheduled run at %s UTC could renew the fixture first, and waiting until %s would pass the test deadline", day.Add(fire).Format("15:04"), until.Format("15:04:05"))
		}
		t.Logf("waiting until %s UTC so the scheduled run at %s can't renew the fixture first", until.Format("15:04:05"), day.Add(fire).Format("15:04"))
		time.Sleep(until.Sub(now))
		return
	}
}
