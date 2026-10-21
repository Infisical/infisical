package keystore

import (
	"context"
	"testing"
)

func TestMemoryKeyStore_IncrementBy(t *testing.T) {
	ctx := context.Background()

	t.Run("starts from zero on a missing key", func(t *testing.T) {
		store := NewMemoryKeyStore()
		got, err := store.IncrementBy(ctx, "counter", 5)
		if err != nil {
			t.Fatalf("IncrementBy returned error: %v", err)
		}
		if got != 5 {
			t.Fatalf("IncrementBy = %d, want 5", got)
		}
	})

	t.Run("accumulates across calls and persists the value", func(t *testing.T) {
		store := NewMemoryKeyStore()
		if _, err := store.IncrementBy(ctx, "counter", 65); err != nil {
			t.Fatalf("IncrementBy returned error: %v", err)
		}
		got, err := store.IncrementBy(ctx, "counter", 2)
		if err != nil {
			t.Fatalf("IncrementBy returned error: %v", err)
		}
		if got != 67 {
			t.Fatalf("IncrementBy = %d, want 67", got)
		}

		// reading the persisted value back must round-trip to the same integer,
		// which the previous string(rune(n)) serialization broke (65 -> "A" -> 0).
		raw, err := store.GetItem(ctx, "counter")
		if err != nil {
			t.Fatalf("GetItem returned error: %v", err)
		}
		if stringToInt(raw) != 67 {
			t.Fatalf("persisted value = %q (parsed %d), want 67", raw, stringToInt(raw))
		}
	})

	t.Run("supports decrement", func(t *testing.T) {
		store := NewMemoryKeyStore()
		if _, err := store.IncrementBy(ctx, "counter", 10); err != nil {
			t.Fatalf("IncrementBy returned error: %v", err)
		}
		got, err := store.IncrementBy(ctx, "counter", -1)
		if err != nil {
			t.Fatalf("IncrementBy returned error: %v", err)
		}
		if got != 9 {
			t.Fatalf("IncrementBy = %d, want 9", got)
		}
	})
}

func TestIntToString_RoundTrip(t *testing.T) {
	for _, n := range []int64{0, 1, 9, 10, 65, 127, -1, -65, 1234567890} {
		if got := stringToInt(intToString(n)); got != n {
			t.Errorf("round-trip for %d failed: got %d (serialized %q)", n, got, intToString(n))
		}
	}
}
