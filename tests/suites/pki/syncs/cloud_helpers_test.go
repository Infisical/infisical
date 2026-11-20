package syncs_test

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// cloudSyncState is what every destination's get route reports about the last run.
type cloudSyncState struct {
	SyncStatus      string     `json:"syncStatus"`
	LastSyncMessage *string    `json:"lastSyncMessage"`
	LastSyncedAt    *time.Time `json:"lastSyncedAt"`
}

// cloudSyncGet is a destination's generated get method, the one returning the unread
// response.
type cloudSyncGet func(ctx context.Context, pkiSyncId string, reqEditors ...api.RequestEditorFn) (*http.Response, error)

// cloudSyncRead reads a sync once, decoding it only when the read succeeded.
func cloudSyncRead(get cloudSyncGet, syncID string) func(ctx context.Context) (cloudSyncState, int, []byte, error) {
	return func(ctx context.Context) (cloudSyncState, int, []byte, error) {
		var state cloudSyncState
		res, err := get(ctx, syncID)
		if err != nil {
			return state, 0, nil, err
		}
		defer func() { _ = res.Body.Close() }()
		body, err := io.ReadAll(res.Body)
		if err != nil {
			return state, 0, nil, err
		}
		if res.StatusCode == http.StatusOK {
			if err := json.Unmarshal(body, &state); err != nil {
				return state, res.StatusCode, body, fmt.Errorf("decoding the sync: %w", err)
			}
		}
		return state, res.StatusCode, body, nil
	}
}

// cloudSyncRunWait is how long a run may take to finish. A run starts after up to 10
// seconds of jitter, and one that finds the sync locked by another run, such as the
// re-push a renewal queues racing a manual trigger, is requeued 30 to 40 seconds later,
// past the default 30 second wait.
const cloudSyncRunWait = 75 * time.Second

var cloudSyncRun = wait.Timeout(cloudSyncRunWait)

// cloudSyncRemoval waits for the provider call a removal makes. A run marks the sync
// succeeded before it releases the sync's lock, so a removal sent right after can find
// the lock held and be requeued like a run.
var cloudSyncRemoval = fakenet.Within(cloudSyncRunWait)

// cloudSyncAwait waits for a run that finished after the one recorded at previous
// (nil for the first run) and fails unless it ended in want. A failed status ends the
// wait at once, since a failure is never followed by success without a new trigger.
// The job starts after a random delay of up to 10 seconds.
func cloudSyncAwait(t *testing.T, get cloudSyncGet, syncID string, previous *time.Time, want string) cloudSyncState {
	t.Helper()
	got := pki.Poll(t, "reading the sync", cloudSyncRead(get, syncID), func(s cloudSyncState) bool {
		return s.SyncStatus == "failed" || (s.SyncStatus == "succeeded" && s.LastSyncedAt != nil &&
			(previous == nil || s.LastSyncedAt.After(*previous)))
	}, cloudSyncRun)
	if got.SyncStatus != want {
		msg := "<none>"
		if got.LastSyncMessage != nil {
			msg = *got.LastSyncMessage
		}
		require.FailNowf(t, "the sync ended in the wrong status", "want %s, got %s: %s", want, got.SyncStatus, msg)
	}
	return got
}

// cloudSyncSucceeded waits for the next run to succeed, failing with the run's message
// when it fails instead.
func cloudSyncSucceeded(t *testing.T, get cloudSyncGet, syncID string, previous *time.Time) cloudSyncState {
	t.Helper()
	return cloudSyncAwait(t, get, syncID, previous, "succeeded")
}

// failureMessage is the message on the sync's one certificate row, which must be marked
// failed.
func failureMessage(t *testing.T, tn *harness.Tenant, syncID string) string {
	t.Helper()
	res, err := tn.Admin.API.ListPkiSyncCertificatesWithResponse(t.Context(), uuid.MustParse(syncID), nil)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "listing the sync's certificates returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	require.Len(t, res.JSON200.Certificates, 1)
	got := res.JSON200.Certificates[0]
	require.Equal(t, api.ListPkiSyncCertificates200JSONResponseBodyCertificatesSyncStatusFailed, got.SyncStatus)
	require.NotNil(t, got.LastSyncMessage)
	return *got.LastSyncMessage
}
