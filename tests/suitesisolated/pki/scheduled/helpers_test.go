package scheduled_test

import (
	"net/http"
	"testing"

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
