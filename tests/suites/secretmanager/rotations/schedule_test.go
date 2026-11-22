package rotations_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/stretchr/testify/require"
)

// nextRotation is the schedule the product documents: the configured time of day,
// the interval in days after the last rotation, plus a day when the rotation happened
// at or after that time, so a full interval always elapses.
func nextRotation(last time.Time, intervalDays, hours, minutes int) time.Time {
	last = last.UTC()
	next := time.Date(last.Year(), last.Month(), last.Day(), hours, minutes, 0, 0, time.UTC)
	days := intervalDays
	if last.Hour() > hours || (last.Hour() == hours && last.Minute() >= minutes) {
		days++
	}
	return next.AddDate(0, 0, days)
}

func TestSecretRotation_Schedule(t *testing.T) {
	t.Parallel()

	t.Run("should schedule the next rotation from the interval and the time of day", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		now := time.Now().UTC()

		// Action
		res := e.create(t, autoRotate(3, now.Hour(), 30))

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		got := decode(t, res.Body)
		require.NotNil(t, got.NextRotationAt)
		require.True(t, nextRotation(got.LastRotatedAt, 3, now.Hour(), 30).Equal(*got.NextRotationAt),
			"last rotated %v, next %v", got.LastRotatedAt, *got.NextRotationAt)
	})

	t.Run("should schedule nothing when auto-rotation is off", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)

		// Action
		res := e.create(t)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Nil(t, decode(t, res.Body).NextRotationAt)
	})

	t.Run("should move the next rotation when the interval is updated", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setup(t)
		r := e.newRotation(t, autoRotate(3, 12, 0))
		interval := float32(5)

		// Action
		res := r.update(t, api.UpdatePostgreSQLCredentialsRotationJSONRequestBody{RotationInterval: &interval})

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		got := decode(t, res.Body)
		require.NotNil(t, got.NextRotationAt)
		require.True(t, nextRotation(got.LastRotatedAt, 5, 12, 0).Equal(*got.NextRotationAt),
			"last rotated %v, next %v", got.LastRotatedAt, *got.NextRotationAt)
	})
}
