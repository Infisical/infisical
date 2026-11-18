package syncs_test

import (
	"context"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
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

// cloudSyncReadTimeout bounds one read, so one stuck response cannot use up the whole
// wait.
const cloudSyncReadTimeout = 10 * time.Second

// cloudSyncFetch reads a sync once. permanent reports an error that polling again
// cannot clear: any refusal other than a rate limit or a server error.
func cloudSyncFetch(ctx context.Context, get cloudSyncGet, syncID string) (state cloudSyncState, permanent bool, err error) {
	ctx, cancel := context.WithTimeout(ctx, cloudSyncReadTimeout)
	defer cancel()
	res, err := get(ctx, syncID)
	if err != nil {
		return state, false, fmt.Errorf("reading the sync: %w", err)
	}
	defer func() { _ = res.Body.Close() }()
	body, err := io.ReadAll(res.Body)
	if err != nil {
		return state, false, fmt.Errorf("reading the sync: %w", err)
	}
	if res.StatusCode != http.StatusOK {
		temporary := res.StatusCode == http.StatusTooManyRequests || res.StatusCode >= 500
		return state, !temporary, fmt.Errorf("reading the sync returned %d: %s", res.StatusCode, apierr.Body(body))
	}
	if err := json.Unmarshal(body, &state); err != nil {
		return state, true, fmt.Errorf("decoding the sync: %w", err)
	}
	return state, false, nil
}

// cloudSyncAwait waits for a run that finished after the one recorded at previous
// (nil for the first run) and fails unless it ended in want. A failed status ends the
// wait at once, since a failure is never followed by success without a new trigger.
// The job starts after a random delay of up to 10 seconds.
func cloudSyncAwait(t *testing.T, get cloudSyncGet, syncID string, previous *time.Time, want string) cloudSyncState {
	t.Helper()
	type outcome struct {
		state cloudSyncState
		err   error
	}
	got, err := wait.For(t.Context(), func(ctx context.Context) (outcome, bool, error) {
		s, permanent, err := cloudSyncFetch(ctx, get, syncID)
		if err != nil {
			return outcome{err: err}, permanent, err
		}
		finished := s.SyncStatus == "failed" || (s.SyncStatus == "succeeded" && s.LastSyncedAt != nil &&
			(previous == nil || s.LastSyncedAt.After(*previous)))
		return outcome{state: s}, finished, nil
	})
	require.NoError(t, err, "waiting for the sync to finish a run")
	require.NoError(t, got.err)
	if got.state.SyncStatus != want {
		msg := "<none>"
		if got.state.LastSyncMessage != nil {
			msg = *got.state.LastSyncMessage
		}
		require.FailNowf(t, "the sync ended in the wrong status", "want %s, got %s: %s", want, got.state.SyncStatus, msg)
	}
	return got.state
}

// cloudSyncSucceeded waits for the next run to succeed, failing with the run's message
// when it fails instead.
func cloudSyncSucceeded(t *testing.T, get cloudSyncGet, syncID string, previous *time.Time) cloudSyncState {
	t.Helper()
	return cloudSyncAwait(t, get, syncID, previous, "succeeded")
}

// cloudFirstPEM is the first certificate of a PEM bundle, re-encoded.
func cloudFirstPEM(t *testing.T, bundle string) string {
	t.Helper()
	return string(pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: pki.ParseLeaf(t, bundle).Raw}))
}
