package qb

import (
	"reflect"
	"testing"

	"github.com/google/uuid"
)

func TestInsert_SingleRow(t *testing.T) {
	id := uuid.MustParse("11111111-1111-1111-1111-111111111111")

	sql, args := Insert("users", "id", "name", "email").
		Values(id, "John", "john@example.com").
		Build()

	expectedSQL := "INSERT INTO users (id, name, email) VALUES ($1, $2, $3)"
	expectedArgs := []any{id, "John", "john@example.com"}

	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if !reflect.DeepEqual(args, expectedArgs) {
		t.Errorf("args = %v, want %v", args, expectedArgs)
	}
}

func TestInsert_MultipleRows(t *testing.T) {
	id1 := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	id2 := uuid.MustParse("22222222-2222-2222-2222-222222222222")
	id3 := uuid.MustParse("33333333-3333-3333-3333-333333333333")

	sql, args := Insert("users", "id", "name").
		Values(id1, "Alice").
		Values(id2, "Bob").
		Values(id3, "Charlie").
		Build()

	expectedSQL := "INSERT INTO users (id, name) VALUES ($1, $2), ($3, $4), ($5, $6)"
	expectedArgs := []any{id1, "Alice", id2, "Bob", id3, "Charlie"}

	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if !reflect.DeepEqual(args, expectedArgs) {
		t.Errorf("args = %v, want %v", args, expectedArgs)
	}
}

func TestInsert_WithReturning(t *testing.T) {
	sql, args := Insert("users", "name", "email").
		Values("John", "john@example.com").
		Returning("*").
		Build()

	expectedSQL := "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *"
	expectedArgs := []any{"John", "john@example.com"}

	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if !reflect.DeepEqual(args, expectedArgs) {
		t.Errorf("args = %v, want %v", args, expectedArgs)
	}
}

func TestInsert_WithReturningSpecificColumns(t *testing.T) {
	sql, _ := Insert("users", "name", "email").
		Values("John", "john@example.com").
		Returning("id, created_at").
		Build()

	expectedSQL := "INSERT INTO users (name, email) VALUES ($1, $2) RETURNING id, created_at"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
}

func TestInsert_NilValues(t *testing.T) {
	sql, args := Insert("users", "name", "email", "phone").
		Values("John", "john@example.com", nil).
		Build()

	expectedSQL := "INSERT INTO users (name, email, phone) VALUES ($1, $2, $3)"
	expectedArgs := []any{"John", "john@example.com", nil}

	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if !reflect.DeepEqual(args, expectedArgs) {
		t.Errorf("args = %v, want %v", args, expectedArgs)
	}
}

func TestInsert_SingleColumn(t *testing.T) {
	sql, args := Insert("tags", "name").
		Values("important").
		Values("urgent").
		Build()

	expectedSQL := "INSERT INTO tags (name) VALUES ($1), ($2)"
	expectedArgs := []any{"important", "urgent"}

	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if !reflect.DeepEqual(args, expectedArgs) {
		t.Errorf("args = %v, want %v", args, expectedArgs)
	}
}

func TestInsert_NoValues_Panics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("Insert.Build() with no values should panic")
		}
	}()

	Insert("users", "name", "email").Build()
}

func TestInsert_MismatchedValuesCount_Panics(t *testing.T) {
	defer func() {
		r := recover()
		if r == nil {
			t.Error("Insert.Values() with wrong count should panic")
		}
		msg, ok := r.(string)
		if !ok {
			t.Errorf("panic value should be string, got %T", r)
		}
		if msg == "" {
			t.Error("panic message should not be empty")
		}
	}()

	Insert("users", "name", "email").
		Values("John"). // missing email
		Build()
}

func TestInsert_TooManyValues_Panics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("Insert.Values() with too many values should panic")
		}
	}()

	Insert("users", "name").
		Values("John", "extra"). // too many
		Build()
}

func TestInsert_Chaining(t *testing.T) {
	builder := Insert("users", "a", "b")
	builder.Values(1, 2)
	builder.Values(3, 4)
	builder.Returning("*")

	sql, args := builder.Build()

	expectedSQL := "INSERT INTO users (a, b) VALUES ($1, $2), ($3, $4) RETURNING *"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if len(args) != 4 {
		t.Errorf("args length = %d, want 4", len(args))
	}
}
