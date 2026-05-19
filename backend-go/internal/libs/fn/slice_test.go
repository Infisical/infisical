package fn

import (
	"testing"

	"github.com/google/uuid"
)

type testItem struct {
	ID   uuid.UUID
	Name string
}

func TestAppendUnique_AddsNewItem(t *testing.T) {
	id1 := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	id2 := uuid.MustParse("22222222-2222-2222-2222-222222222222")

	slice := []testItem{{ID: id1, Name: "first"}}
	newItem := testItem{ID: id2, Name: "second"}

	result := AppendUnique(slice, newItem, func(t testItem) uuid.UUID { return t.ID })

	if len(result) != 2 {
		t.Errorf("expected 2 items, got %d", len(result))
	}
	if result[1].ID != id2 {
		t.Errorf("expected second item ID %v, got %v", id2, result[1].ID)
	}
}

func TestAppendUnique_SkipsDuplicate(t *testing.T) {
	id1 := uuid.MustParse("11111111-1111-1111-1111-111111111111")

	slice := []testItem{{ID: id1, Name: "first"}}
	duplicate := testItem{ID: id1, Name: "duplicate"}

	result := AppendUnique(slice, duplicate, func(t testItem) uuid.UUID { return t.ID })

	if len(result) != 1 {
		t.Errorf("expected 1 item, got %d", len(result))
	}
	if result[0].Name != "first" {
		t.Errorf("expected original name 'first', got %q", result[0].Name)
	}
}

func TestAppendUnique_EmptySlice(t *testing.T) {
	id1 := uuid.MustParse("11111111-1111-1111-1111-111111111111")

	var slice []testItem
	newItem := testItem{ID: id1, Name: "first"}

	result := AppendUnique(slice, newItem, func(t testItem) uuid.UUID { return t.ID })

	if len(result) != 1 {
		t.Errorf("expected 1 item, got %d", len(result))
	}
}

func TestAppendUnique_StringKey(t *testing.T) {
	type item struct {
		Slug string
		Val  int
	}

	slice := []item{{Slug: "a", Val: 1}}
	result := AppendUnique(slice, item{Slug: "b", Val: 2}, func(i item) string { return i.Slug })
	result = AppendUnique(result, item{Slug: "a", Val: 3}, func(i item) string { return i.Slug })

	if len(result) != 2 {
		t.Errorf("expected 2 items, got %d", len(result))
	}
	if result[0].Val != 1 {
		t.Errorf("expected first item Val 1, got %d", result[0].Val)
	}
}

func TestAppendUniqueSlice_MergesSlices(t *testing.T) {
	id1 := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	id2 := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	id3 := uuid.MustParse("33333333-3333-3333-3333-333333333333")

	dst := []testItem{{ID: id1, Name: "first"}}
	src := []testItem{
		{ID: id2, Name: "second"},
		{ID: id1, Name: "duplicate"},
		{ID: id3, Name: "third"},
	}

	result := AppendUniqueSlice(dst, src, func(t testItem) uuid.UUID { return t.ID })

	if len(result) != 3 {
		t.Errorf("expected 3 items, got %d", len(result))
	}
}

func TestAppendUniqueSlice_EmptySrc(t *testing.T) {
	id1 := uuid.MustParse("11111111-1111-1111-1111-111111111111")

	dst := []testItem{{ID: id1, Name: "first"}}
	var src []testItem

	result := AppendUniqueSlice(dst, src, func(t testItem) uuid.UUID { return t.ID })

	if len(result) != 1 {
		t.Errorf("expected 1 item, got %d", len(result))
	}
}

func TestAppendUniqueSlice_EmptyDst(t *testing.T) {
	id1 := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	id2 := uuid.MustParse("22222222-2222-2222-2222-222222222222")

	var dst []testItem
	src := []testItem{
		{ID: id1, Name: "first"},
		{ID: id2, Name: "second"},
	}

	result := AppendUniqueSlice(dst, src, func(t testItem) uuid.UUID { return t.ID })

	if len(result) != 2 {
		t.Errorf("expected 2 items, got %d", len(result))
	}
}
