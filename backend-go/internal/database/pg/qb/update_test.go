package qb

import (
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestUpdate_Basic(t *testing.T) {
	sql, args := Update("users").
		Set("name", "John").
		Build()

	expectedSQL := "UPDATE users SET name = @name"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if args["name"] != "John" {
		t.Errorf("args[name] = %v, want %q", args["name"], "John")
	}
}

func TestUpdate_MultipleSet(t *testing.T) {
	now := time.Now()

	sql, args := Update("users").
		Set("name", "John").
		Set("email", "john@example.com").
		Set("updated_at", now).
		Build()

	expectedSQL := "UPDATE users SET name = @name, email = @email, updated_at = @updatedAt"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if args["name"] != "John" {
		t.Errorf("args[name] = %v, want %q", args["name"], "John")
	}
	if args["email"] != "john@example.com" {
		t.Errorf("args[email] = %v, want %q", args["email"], "john@example.com")
	}
	if args["updatedAt"] != now {
		t.Errorf("args[updatedAt] = %v, want %v", args["updatedAt"], now)
	}
}

func TestUpdate_WithWhere(t *testing.T) {
	id := uuid.MustParse("11111111-1111-1111-1111-111111111111")

	sql, args := Update("users").
		Set("name", "John").
		Where("id = @id", "id", id).
		Build()

	expectedSQL := "UPDATE users SET name = @name WHERE id = @id"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if args["id"] != id {
		t.Errorf("args[id] = %v, want %v", args["id"], id)
	}
}

func TestUpdate_MultipleWhere(t *testing.T) {
	id := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	orgID := uuid.MustParse("22222222-2222-2222-2222-222222222222")

	sql, args := Update("users").
		Set("name", "John").
		Where("id = @id", "id", id).
		Where("org_id = @orgID", "orgID", orgID).
		Build()

	expectedSQL := "UPDATE users SET name = @name WHERE id = @id AND org_id = @orgID"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if args["id"] != id {
		t.Errorf("args[id] = %v, want %v", args["id"], id)
	}
	if args["orgID"] != orgID {
		t.Errorf("args[orgID] = %v, want %v", args["orgID"], orgID)
	}
}

func TestUpdate_WithReturning(t *testing.T) {
	sql, _ := Update("users").
		Set("name", "John").
		Where("id = @id", "id", uuid.New()).
		Returning("*").
		Build()

	expectedSQL := "UPDATE users SET name = @name WHERE id = @id RETURNING *"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
}

func TestUpdate_ReturningSpecificColumns(t *testing.T) {
	sql, _ := Update("users").
		Set("name", "John").
		Where("id = @id", "id", uuid.New()).
		Returning("id, name, updated_at").
		Build()

	expectedSQL := "UPDATE users SET name = @name WHERE id = @id RETURNING id, name, updated_at"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
}

func TestUpdate_SetIf(t *testing.T) {
	tests := []struct {
		name        string
		condition   bool
		expectedSQL string
		hasEmail    bool
	}{
		{
			name:        "condition true includes column",
			condition:   true,
			expectedSQL: "UPDATE users SET name = @name, email = @email",
			hasEmail:    true,
		},
		{
			name:        "condition false excludes column",
			condition:   false,
			expectedSQL: "UPDATE users SET name = @name",
			hasEmail:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sql, args := Update("users").
				Set("name", "John").
				SetIf(tt.condition, "email", "john@example.com").
				Build()

			if sql != tt.expectedSQL {
				t.Errorf("SQL = %q, want %q", sql, tt.expectedSQL)
			}
			_, hasEmail := args["email"]
			if hasEmail != tt.hasEmail {
				t.Errorf("has email arg = %v, want %v", hasEmail, tt.hasEmail)
			}
		})
	}
}

func TestUpdate_SetMap(t *testing.T) {
	values := map[string]any{
		"name":  "John",
		"email": "john@example.com",
	}

	sql, args := Update("users").
		SetMap(values).
		Build()

	if args["name"] != "John" {
		t.Errorf("args[name] = %v, want %q", args["name"], "John")
	}
	if args["email"] != "john@example.com" {
		t.Errorf("args[email] = %v, want %q", args["email"], "john@example.com")
	}

	// SQL should contain both SET clauses (order may vary due to map iteration)
	if sql == "" {
		t.Error("SQL should not be empty")
	}
}

func TestUpdate_WhereIf(t *testing.T) {
	tests := []struct {
		name        string
		condition   bool
		expectedSQL string
		hasOrgID    bool
	}{
		{
			name:        "condition true includes where clause",
			condition:   true,
			expectedSQL: "UPDATE users SET name = @name WHERE id = @id AND org_id = @orgID",
			hasOrgID:    true,
		},
		{
			name:        "condition false excludes where clause",
			condition:   false,
			expectedSQL: "UPDATE users SET name = @name WHERE id = @id",
			hasOrgID:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			orgID := uuid.New()

			sql, args := Update("users").
				Set("name", "John").
				Where("id = @id", "id", uuid.New()).
				WhereIf(tt.condition, "org_id = @orgID", "orgID", orgID).
				Build()

			if sql != tt.expectedSQL {
				t.Errorf("SQL = %q, want %q", sql, tt.expectedSQL)
			}
			_, hasOrgID := args["orgID"]
			if hasOrgID != tt.hasOrgID {
				t.Errorf("has orgID arg = %v, want %v", hasOrgID, tt.hasOrgID)
			}
		})
	}
}

func TestUpdate_WhereClause(t *testing.T) {
	sql, _ := Update("users").
		Set("name", "John").
		WhereClause("deleted_at IS NULL").
		Build()

	expectedSQL := "UPDATE users SET name = @name WHERE deleted_at IS NULL"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
}

func TestUpdate_NoSet_Panics(t *testing.T) {
	defer func() {
		if r := recover(); r == nil {
			t.Error("Update.Build() with no SET should panic")
		}
	}()

	Update("users").
		Where("id = @id", "id", uuid.New()).
		Build()
}

func TestUpdate_NoWhere(t *testing.T) {
	sql, _ := Update("users").
		Set("active", false).
		Build()

	expectedSQL := "UPDATE users SET active = @active"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
}

func TestToArgName(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"name", "name"},
		{"user_id", "userId"},
		{"created_at", "createdAt"},
		{"org_member_id", "orgMemberId"},
		{"id", "id"},
		{"a_b_c", "aBC"},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := toArgName(tt.input)
			if got != tt.expected {
				t.Errorf("toArgName(%q) = %q, want %q", tt.input, got, tt.expected)
			}
		})
	}
}
