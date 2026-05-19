package qb

import (
	"testing"
)

func TestNewWhere(t *testing.T) {
	w := NewWhere()
	if w == nil {
		t.Fatal("NewWhere returned nil")
	}
	if !w.IsEmpty() {
		t.Error("new Where should be empty")
	}
	if w.String() != "" {
		t.Errorf("empty Where.String() = %q, want empty string", w.String())
	}
}

func TestWhere_Add(t *testing.T) {
	tests := []struct {
		name     string
		clauses  []string
		expected string
	}{
		{
			name:     "single clause",
			clauses:  []string{"id = @id"},
			expected: "id = @id",
		},
		{
			name:     "multiple clauses joined with AND",
			clauses:  []string{"id = @id", "name = @name", "active = true"},
			expected: "id = @id AND name = @name AND active = true",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := NewWhere()
			for _, clause := range tt.clauses {
				w.Add(clause)
			}
			if got := w.String(); got != tt.expected {
				t.Errorf("Where.String() = %q, want %q", got, tt.expected)
			}
			if w.IsEmpty() && len(tt.clauses) > 0 {
				t.Error("Where should not be empty after Add")
			}
		})
	}
}

func TestWhere_AddIf(t *testing.T) {
	tests := []struct {
		name      string
		condition bool
		clause    string
		expected  string
		isEmpty   bool
	}{
		{
			name:      "condition true adds clause",
			condition: true,
			clause:    "id = @id",
			expected:  "id = @id",
			isEmpty:   false,
		},
		{
			name:      "condition false skips clause",
			condition: false,
			clause:    "id = @id",
			expected:  "",
			isEmpty:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := NewWhere()
			w.AddIf(tt.condition, tt.clause)
			if got := w.String(); got != tt.expected {
				t.Errorf("Where.String() = %q, want %q", got, tt.expected)
			}
			if w.IsEmpty() != tt.isEmpty {
				t.Errorf("Where.IsEmpty() = %v, want %v", w.IsEmpty(), tt.isEmpty)
			}
		})
	}
}

func TestWhere_AddIfMultiple(t *testing.T) {
	w := NewWhere()
	w.Add("base = @base")
	w.AddIf(true, "included = @included")
	w.AddIf(false, "excluded = @excluded")
	w.AddIf(true, "also_included = @also")

	expected := "base = @base AND included = @included AND also_included = @also"
	if got := w.String(); got != expected {
		t.Errorf("Where.String() = %q, want %q", got, expected)
	}
}

func TestWhere_Or(t *testing.T) {
	w := NewWhere()
	w.Add("a = 1")
	w.Or("b = 2")
	w.Or("c = 3")

	expected := "a = 1 OR b = 2 OR c = 3"
	if got := w.String(); got != expected {
		t.Errorf("Where.String() = %q, want %q", got, expected)
	}
}

func TestWhere_Group(t *testing.T) {
	outer := NewWhere()
	outer.Add("active = true")

	inner := newOrWhere()
	inner.Add("role = @role1")
	inner.Add("role = @role2")

	outer.Group(inner)

	expected := "active = true AND (role = @role1 OR role = @role2)"
	if got := outer.String(); got != expected {
		t.Errorf("Where.String() = %q, want %q", got, expected)
	}
}

func TestWhere_GroupEmpty(t *testing.T) {
	outer := NewWhere()
	outer.Add("active = true")

	inner := NewWhere()
	outer.Group(inner)

	expected := "active = true"
	if got := outer.String(); got != expected {
		t.Errorf("empty group should not be added: got %q, want %q", got, expected)
	}
}

func TestWhere_OrGroup(t *testing.T) {
	w := NewWhere()
	w.Add("folder_id = @folderID")
	w.OrGroup(func(sub *Where) {
		sub.Add("key LIKE @search")
		sub.Add("name LIKE @search")
	})

	expected := "folder_id = @folderID AND (key LIKE @search OR name LIKE @search)"
	if got := w.String(); got != expected {
		t.Errorf("Where.String() = %q, want %q", got, expected)
	}
}

func TestWhere_AndGroup(t *testing.T) {
	w := NewWhere()
	w.Add("active = true")
	w.AndGroup(func(sub *Where) {
		sub.Add("role = @role")
		sub.Add("org_id = @orgID")
	})

	expected := "active = true AND (role = @role AND org_id = @orgID)"
	if got := w.String(); got != expected {
		t.Errorf("Where.String() = %q, want %q", got, expected)
	}
}

func TestWhere_OrGroupEmpty(t *testing.T) {
	w := NewWhere()
	w.Add("active = true")
	w.OrGroup(func(sub *Where) {
		// empty - nothing added
	})

	expected := "active = true"
	if got := w.String(); got != expected {
		t.Errorf("empty OrGroup should not affect result: got %q, want %q", got, expected)
	}
}

func TestWhere_NestedGroups(t *testing.T) {
	w := NewWhere()
	w.Add("a = 1")
	w.OrGroup(func(outer *Where) {
		outer.Add("b = 2")
		outer.AndGroup(func(inner *Where) {
			inner.Add("c = 3")
			inner.Add("d = 4")
		})
	})

	expected := "a = 1 AND (b = 2 OR (c = 3 AND d = 4))"
	if got := w.String(); got != expected {
		t.Errorf("nested groups: got %q, want %q", got, expected)
	}
}

func TestWhere_Chaining(t *testing.T) {
	w := NewWhere().
		Add("a = 1").
		AddIf(true, "b = 2").
		AddIf(false, "c = 3")

	expected := "a = 1 AND b = 2"
	if got := w.String(); got != expected {
		t.Errorf("chained Where.String() = %q, want %q", got, expected)
	}
}
