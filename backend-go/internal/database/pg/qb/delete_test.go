package qb

import (
	"testing"

	"github.com/google/uuid"
)

func TestDelete_Basic(t *testing.T) {
	sql, args := Delete("users").Build()

	expectedSQL := "DELETE FROM users"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if len(args) != 0 {
		t.Errorf("args should be empty, got %v", args)
	}
}

func TestDelete_WithWhere(t *testing.T) {
	id := uuid.MustParse("11111111-1111-1111-1111-111111111111")

	sql, args := Delete("users").
		Where("id = @id", "id", id).
		Build()

	expectedSQL := "DELETE FROM users WHERE id = @id"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if args["id"] != id {
		t.Errorf("args[id] = %v, want %v", args["id"], id)
	}
}

func TestDelete_MultipleWhere(t *testing.T) {
	id := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	orgID := uuid.MustParse("22222222-2222-2222-2222-222222222222")

	sql, args := Delete("users").
		Where("id = @id", "id", id).
		Where("org_id = @orgID", "orgID", orgID).
		Build()

	expectedSQL := "DELETE FROM users WHERE id = @id AND org_id = @orgID"
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

func TestDelete_WithReturning(t *testing.T) {
	id := uuid.MustParse("11111111-1111-1111-1111-111111111111")

	sql, _ := Delete("users").
		Where("id = @id", "id", id).
		Returning("*").
		Build()

	expectedSQL := "DELETE FROM users WHERE id = @id RETURNING *"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
}

func TestDelete_ReturningSpecificColumns(t *testing.T) {
	sql, _ := Delete("users").
		Where("id = @id", "id", uuid.New()).
		Returning("id, name").
		Build()

	expectedSQL := "DELETE FROM users WHERE id = @id RETURNING id, name"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
}

func TestDelete_WhereIf(t *testing.T) {
	tests := []struct {
		name        string
		condition   bool
		expectedSQL string
		hasOrgID    bool
	}{
		{
			name:        "condition true includes where clause",
			condition:   true,
			expectedSQL: "DELETE FROM users WHERE id = @id AND org_id = @orgID",
			hasOrgID:    true,
		},
		{
			name:        "condition false excludes where clause",
			condition:   false,
			expectedSQL: "DELETE FROM users WHERE id = @id",
			hasOrgID:    false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			id := uuid.New()
			orgID := uuid.New()

			sql, args := Delete("users").
				Where("id = @id", "id", id).
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

func TestDelete_WhereClause(t *testing.T) {
	sql, _ := Delete("users").
		WhereClause("deleted_at IS NOT NULL").
		WhereClause("active = false").
		Build()

	expectedSQL := "DELETE FROM users WHERE deleted_at IS NOT NULL AND active = false"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
}

func TestDelete_WhereClauseWithWhere(t *testing.T) {
	id := uuid.New()

	sql, args := Delete("users").
		Where("id = @id", "id", id).
		WhereClause("active = false").
		Build()

	expectedSQL := "DELETE FROM users WHERE id = @id AND active = false"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if args["id"] != id {
		t.Errorf("args[id] = %v, want %v", args["id"], id)
	}
}

func TestDelete_WhereWithEmptyArgName(t *testing.T) {
	sql, args := Delete("users").
		Where("active = true", "", nil).
		Build()

	expectedSQL := "DELETE FROM users WHERE active = true"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if len(args) != 0 {
		t.Errorf("args should be empty when argName is empty, got %v", args)
	}
}

func TestDelete_Chaining(t *testing.T) {
	id := uuid.New()

	builder := Delete("users")
	builder.Where("id = @id", "id", id)
	builder.WhereClause("active = false")
	builder.Returning("*")

	sql, args := builder.Build()

	expectedSQL := "DELETE FROM users WHERE id = @id AND active = false RETURNING *"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if args["id"] != id {
		t.Errorf("args[id] = %v, want %v", args["id"], id)
	}
}

func TestDelete_ComplexExample(t *testing.T) {
	userID := uuid.New()
	orgID := uuid.New()
	includeOrg := true

	sql, args := Delete("secrets").
		Where("user_id = @userID", "userID", userID).
		WhereIf(includeOrg, "org_id = @orgID", "orgID", orgID).
		WhereClause("expired_at < NOW()").
		Returning("id, key").
		Build()

	expectedSQL := "DELETE FROM secrets WHERE user_id = @userID AND org_id = @orgID AND expired_at < NOW() RETURNING id, key"
	if sql != expectedSQL {
		t.Errorf("SQL = %q, want %q", sql, expectedSQL)
	}
	if args["userID"] != userID {
		t.Errorf("args[userID] = %v, want %v", args["userID"], userID)
	}
	if args["orgID"] != orgID {
		t.Errorf("args[orgID] = %v, want %v", args["orgID"], orgID)
	}
}
