package jitter

import (
	"testing"
	"time"
)

func TestApply_NonPositiveOffsetReturnsDelay(t *testing.T) {
	delay := 10 * time.Minute
	for _, offset := range []time.Duration{0, -1, -5 * time.Minute} {
		if got := Apply(delay, offset); got != delay {
			t.Errorf("Apply(%v, %v) = %v, want %v unchanged", delay, offset, got, delay)
		}
	}
}

func TestApply_WithinBounds(t *testing.T) {
	delay := 10 * time.Minute
	offset := 2 * time.Minute
	lower := delay - offset
	upper := delay + offset // exclusive

	for i := 0; i < 10000; i++ {
		got := Apply(delay, offset)
		if got < lower || got >= upper {
			t.Fatalf("Apply(%v, %v) = %v, outside [%v, %v)", delay, offset, got, lower, upper)
		}
	}
}

func TestApply_SymmetricSpread(t *testing.T) {
	delay := 10 * time.Minute
	offset := 2 * time.Minute

	var below, above bool
	for i := 0; i < 10000; i++ {
		switch got := Apply(delay, offset); {
		case got < delay:
			below = true
		case got > delay:
			above = true
		}
		if below && above {
			return
		}
	}
	t.Errorf("expected jitter on both sides of delay, got below=%v above=%v", below, above)
}
