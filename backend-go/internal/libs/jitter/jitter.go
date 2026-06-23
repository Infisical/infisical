// Package jitter applies random jitter to time durations, used to spread out
// otherwise-synchronized timers (e.g. cache TTLs) and avoid thundering herds.
package jitter

import (
	"math/rand/v2"
	"time"
)

// amount uniformly drawn from [-offset, +offset), yielding a symmetric
// [delay-offset, delay+offset) spread. Returns delay unchanged when offset <= 0.
func Apply(delay, offset time.Duration) time.Duration {
	if offset <= 0 {
		return delay
	}
	return delay + time.Duration(rand.Int64N(2*int64(offset))-int64(offset))
}
