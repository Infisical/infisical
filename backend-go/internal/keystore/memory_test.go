package keystore

import (
	"context"
	"testing"
)

func TestIncrementBy_NewKey(t *testing.T) {
	store := NewMemoryKeyStore()
	ctx := context.Background()

	got, err := store.IncrementBy(ctx, "counter", 5)
	if err != nil {
		t.Fatalf("IncrementBy returned error: %v", err)
	}
	if got != 5 {
		t.Errorf("IncrementBy = %d, want 5", got)
	}

	val, err := store.GetItem(ctx, "counter")
	if err != nil {
		t.Fatalf("GetItem returned error: %v", err)
	}
	if val != "5" {
		t.Errorf("GetItem = %q, want %q", val, "5")
	}
}

func TestIncrementBy_ExistingKey(t *testing.T) {
	store := NewMemoryKeyStore()
	ctx := context.Background()

	if err := store.SetItem(ctx, "counter", "10"); err != nil {
		t.Fatalf("SetItem returned error: %v", err)
	}

	got, err := store.IncrementBy(ctx, "counter", 7)
	if err != nil {
		t.Fatalf("IncrementBy returned error: %v", err)
	}
	if got != 17 {
		t.Errorf("IncrementBy = %d, want 17", got)
	}

	val, err := store.GetItem(ctx, "counter")
	if err != nil {
		t.Fatalf("GetItem returned error: %v", err)
	}
	if val != "17" {
		t.Errorf("GetItem = %q, want %q", val, "17")
	}
}

func TestIncrementBy_MultipleIncrements(t *testing.T) {
	store := NewMemoryKeyStore()
	ctx := context.Background()

	for i := int64(1); i <= 3; i++ {
		got, err := store.IncrementBy(ctx, "counter", 100)
		if err != nil {
			t.Fatalf("IncrementBy iteration %d returned error: %v", i, err)
		}
		want := i * 100
		if got != want {
			t.Errorf("IncrementBy iteration %d = %d, want %d", i, got, want)
		}
	}

	val, err := store.GetItem(ctx, "counter")
	if err != nil {
		t.Fatalf("GetItem returned error: %v", err)
	}
	if val != "300" {
		t.Errorf("GetItem = %q, want %q", val, "300")
	}
}

func TestIncrementBy_NegativeValue(t *testing.T) {
	store := NewMemoryKeyStore()
	ctx := context.Background()

	if err := store.SetItem(ctx, "counter", "50"); err != nil {
		t.Fatalf("SetItem returned error: %v", err)
	}

	got, err := store.IncrementBy(ctx, "counter", -20)
	if err != nil {
		t.Fatalf("IncrementBy returned error: %v", err)
	}
	if got != 30 {
		t.Errorf("IncrementBy = %d, want 30", got)
	}
}

func TestIntToString_RoundTrip(t *testing.T) {
	cases := []int64{0, 1, 42, 65, 100, -1, -99, 1000000}
	for _, n := range cases {
		s := intToString(n)
		got := stringToInt(s)
		if got != n {
			t.Errorf("round-trip failed for %d: intToString=%q, stringToInt=%d", n, s, got)
		}
	}
}
