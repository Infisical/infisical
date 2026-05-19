package sqln

import (
	"testing"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/fn"
)

type Tag struct {
	ID   uuid.UUID
	Slug string
}

type Secret struct {
	ID   uuid.UUID
	Key  string
	Tags []Tag
}

func TestGroupRows_Empty(t *testing.T) {
	var rows []Secret
	grouper := Grouper[Secret, uuid.UUID]{
		Key:   func(s *Secret) uuid.UUID { return s.ID },
		Merge: func(existing, row *Secret) {},
	}

	result := GroupRows(rows, grouper)

	if len(result) != 0 {
		t.Errorf("expected 0 items, got %d", len(result))
	}
}

func TestGroupRows_NoMergeNeeded(t *testing.T) {
	id1 := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	id2 := uuid.MustParse("22222222-2222-2222-2222-222222222222")

	rows := []Secret{
		{ID: id1, Key: "SECRET_1"},
		{ID: id2, Key: "SECRET_2"},
	}

	grouper := Grouper[Secret, uuid.UUID]{
		Key:   func(s *Secret) uuid.UUID { return s.ID },
		Merge: func(existing, row *Secret) {},
	}

	result := GroupRows(rows, grouper)

	if len(result) != 2 {
		t.Errorf("expected 2 items, got %d", len(result))
	}
}

func TestGroupRows_MergesTags(t *testing.T) {
	secretID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	tagID1 := uuid.MustParse("aaaa1111-1111-1111-1111-111111111111")
	tagID2 := uuid.MustParse("bbbb2222-2222-2222-2222-222222222222")

	rows := []Secret{
		{ID: secretID, Key: "SECRET_1", Tags: []Tag{{ID: tagID1, Slug: "tag1"}}},
		{ID: secretID, Key: "SECRET_1", Tags: []Tag{{ID: tagID2, Slug: "tag2"}}},
	}

	grouper := Grouper[Secret, uuid.UUID]{
		Key: func(s *Secret) uuid.UUID { return s.ID },
		Merge: func(existing, row *Secret) {
			if len(row.Tags) > 0 {
				existing.Tags = fn.AppendUnique(existing.Tags, row.Tags[0], func(t Tag) uuid.UUID { return t.ID })
			}
		},
	}

	result := GroupRows(rows, grouper)

	if len(result) != 1 {
		t.Fatalf("expected 1 secret, got %d", len(result))
	}
	if len(result[0].Tags) != 2 {
		t.Errorf("expected 2 tags, got %d", len(result[0].Tags))
	}
}

func TestGroupRows_PreservesOrder(t *testing.T) {
	id1 := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	id2 := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	id3 := uuid.MustParse("33333333-3333-3333-3333-333333333333")

	rows := []Secret{
		{ID: id2, Key: "SECOND"},
		{ID: id1, Key: "FIRST"},
		{ID: id3, Key: "THIRD"},
		{ID: id2, Key: "SECOND_DUP"},
	}

	grouper := Grouper[Secret, uuid.UUID]{
		Key:   func(s *Secret) uuid.UUID { return s.ID },
		Merge: func(existing, row *Secret) {},
	}

	result := GroupRows(rows, grouper)

	if len(result) != 3 {
		t.Fatalf("expected 3 secrets, got %d", len(result))
	}
	if result[0].ID != id2 {
		t.Errorf("expected first result ID %v, got %v", id2, result[0].ID)
	}
	if result[1].ID != id1 {
		t.Errorf("expected second result ID %v, got %v", id1, result[1].ID)
	}
	if result[2].ID != id3 {
		t.Errorf("expected third result ID %v, got %v", id3, result[2].ID)
	}
}

func TestGroupRows_SkipsDuplicateTags(t *testing.T) {
	secretID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	tagID := uuid.MustParse("aaaa1111-1111-1111-1111-111111111111")

	rows := []Secret{
		{ID: secretID, Key: "SECRET_1", Tags: []Tag{{ID: tagID, Slug: "tag1"}}},
		{ID: secretID, Key: "SECRET_1", Tags: []Tag{{ID: tagID, Slug: "tag1"}}},
		{ID: secretID, Key: "SECRET_1", Tags: []Tag{{ID: tagID, Slug: "tag1"}}},
	}

	grouper := Grouper[Secret, uuid.UUID]{
		Key: func(s *Secret) uuid.UUID { return s.ID },
		Merge: func(existing, row *Secret) {
			if len(row.Tags) > 0 {
				existing.Tags = fn.AppendUnique(existing.Tags, row.Tags[0], func(t Tag) uuid.UUID { return t.ID })
			}
		},
	}

	result := GroupRows(rows, grouper)

	if len(result) != 1 {
		t.Fatalf("expected 1 secret, got %d", len(result))
	}
	if len(result[0].Tags) != 1 {
		t.Errorf("expected 1 tag (deduplicated), got %d", len(result[0].Tags))
	}
}

func TestGroupRows_ComplexMerge(t *testing.T) {
	type Meta struct {
		ID    uuid.UUID
		Key   string
		Value string
	}

	type ComplexSecret struct {
		ID       uuid.UUID
		Key      string
		Tags     []Tag
		Metadata []Meta
	}

	secretID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	tagID1 := uuid.MustParse("aaaa1111-1111-1111-1111-111111111111")
	tagID2 := uuid.MustParse("bbbb2222-2222-2222-2222-222222222222")
	metaID1 := uuid.MustParse("cccc3333-3333-3333-3333-333333333333")
	metaID2 := uuid.MustParse("dddd4444-4444-4444-4444-444444444444")

	rows := []ComplexSecret{
		{ID: secretID, Key: "SECRET", Tags: []Tag{{ID: tagID1, Slug: "t1"}}, Metadata: []Meta{{ID: metaID1, Key: "k1", Value: "v1"}}},
		{ID: secretID, Key: "SECRET", Tags: []Tag{{ID: tagID2, Slug: "t2"}}, Metadata: []Meta{{ID: metaID1, Key: "k1", Value: "v1"}}},
		{ID: secretID, Key: "SECRET", Tags: []Tag{{ID: tagID1, Slug: "t1"}}, Metadata: []Meta{{ID: metaID2, Key: "k2", Value: "v2"}}},
	}

	grouper := Grouper[ComplexSecret, uuid.UUID]{
		Key: func(s *ComplexSecret) uuid.UUID { return s.ID },
		Merge: func(existing, row *ComplexSecret) {
			if len(row.Tags) > 0 {
				existing.Tags = fn.AppendUnique(existing.Tags, row.Tags[0], func(t Tag) uuid.UUID { return t.ID })
			}
			if len(row.Metadata) > 0 {
				existing.Metadata = fn.AppendUnique(existing.Metadata, row.Metadata[0], func(m Meta) uuid.UUID { return m.ID })
			}
		},
	}

	result := GroupRows(rows, grouper)

	if len(result) != 1 {
		t.Fatalf("expected 1 secret, got %d", len(result))
	}
	if len(result[0].Tags) != 2 {
		t.Errorf("expected 2 tags, got %d", len(result[0].Tags))
	}
	if len(result[0].Metadata) != 2 {
		t.Errorf("expected 2 metadata entries, got %d", len(result[0].Metadata))
	}
}
