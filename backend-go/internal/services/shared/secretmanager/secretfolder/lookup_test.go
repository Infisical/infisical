package secretfolder

import (
	"database/sql"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Fixed UUIDs for deterministic tests.
var (
	devEnvID  = uuid.MustParse("00000000-0000-0000-0000-000000000001")
	prodEnvID = uuid.MustParse("00000000-0000-0000-0000-000000000002")

	rootDevID  = uuid.MustParse("10000000-0000-0000-0000-000000000001")
	rootProdID = uuid.MustParse("10000000-0000-0000-0000-000000000002")
	folderA    = uuid.MustParse("20000000-0000-0000-0000-000000000001")
	folderB    = uuid.MustParse("20000000-0000-0000-0000-000000000002")
	folderC    = uuid.MustParse("20000000-0000-0000-0000-000000000003")
	folderD    = uuid.MustParse("20000000-0000-0000-0000-000000000004")
)

func nullUUID(id uuid.UUID) sql.Null[uuid.UUID] {
	return sql.Null[uuid.UUID]{V: id, Valid: true}
}

// buildTestTree builds:
//
//	dev:  root -> a -> b -> c
//	prod: root -> d
func buildTestTree() *FolderLookup {
	rows := []folderRow{
		{ID: rootDevID, Name: "root", ParentID: sql.Null[uuid.UUID]{}, EnvID: devEnvID, EnvSlug: "dev", EnvName: "Development"},
		{ID: folderA, Name: "a", ParentID: nullUUID(rootDevID), EnvID: devEnvID, EnvSlug: "dev", EnvName: "Development"},
		{ID: folderB, Name: "b", ParentID: nullUUID(folderA), EnvID: devEnvID, EnvSlug: "dev", EnvName: "Development"},
		{ID: folderC, Name: "c", ParentID: nullUUID(folderB), EnvID: devEnvID, EnvSlug: "dev", EnvName: "Development"},
		{ID: rootProdID, Name: "root", ParentID: sql.Null[uuid.UUID]{}, EnvID: prodEnvID, EnvSlug: "prod", EnvName: "Production"},
		{ID: folderD, Name: "d", ParentID: nullUUID(rootProdID), EnvID: prodEnvID, EnvSlug: "prod", EnvName: "Production"},
	}
	return newFolderLookup(rows)
}

// ---------------------------------------------------------------------------
// Path normalization (splitPath)
// ---------------------------------------------------------------------------

func TestSplitPath(t *testing.T) {
	tests := []struct {
		input    string
		expected []string
	}{
		{"/a/b/c", []string{"a", "b", "c"}},
		{"a/b/c", []string{"a", "b", "c"}},
		{"/a/b/c/", []string{"a", "b", "c"}},
		{"a/b/c/", []string{"a", "b", "c"}},
		{"/", nil},
		{"", nil},
		{"///", nil},
		{"/a", []string{"a"}},
		{"a", []string{"a"}},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			assert.Equal(t, tt.expected, splitPath(tt.input))
		})
	}
}

// ---------------------------------------------------------------------------
// GetByPathEnvSlug
// ---------------------------------------------------------------------------

func TestGetByPathEnvSlug(t *testing.T) {
	l := buildTestTree()

	t.Run("root path with leading slash", func(t *testing.T) {
		node, ok := l.GetByPathEnvSlug("dev", "/")
		require.True(t, ok)
		assert.Equal(t, rootDevID, node.ID)
	})

	t.Run("root path empty string", func(t *testing.T) {
		node, ok := l.GetByPathEnvSlug("dev", "")
		require.True(t, ok)
		assert.Equal(t, rootDevID, node.ID)
	})

	t.Run("nested path with leading slash", func(t *testing.T) {
		node, ok := l.GetByPathEnvSlug("dev", "/a/b/c")
		require.True(t, ok)
		assert.Equal(t, folderC, node.ID)
	})

	t.Run("nested path without leading slash", func(t *testing.T) {
		node, ok := l.GetByPathEnvSlug("dev", "a/b/c")
		require.True(t, ok)
		assert.Equal(t, folderC, node.ID)
	})

	t.Run("nested path with trailing slash", func(t *testing.T) {
		node, ok := l.GetByPathEnvSlug("dev", "/a/b/c/")
		require.True(t, ok)
		assert.Equal(t, folderC, node.ID)
	})

	t.Run("partial path", func(t *testing.T) {
		node, ok := l.GetByPathEnvSlug("dev", "/a/b")
		require.True(t, ok)
		assert.Equal(t, folderB, node.ID)
	})

	t.Run("nonexistent path", func(t *testing.T) {
		_, ok := l.GetByPathEnvSlug("dev", "/a/x")
		assert.False(t, ok)
	})

	t.Run("nonexistent env slug", func(t *testing.T) {
		_, ok := l.GetByPathEnvSlug("staging", "/a")
		assert.False(t, ok)
	})

	t.Run("path exists in dev but not prod", func(t *testing.T) {
		_, ok := l.GetByPathEnvSlug("prod", "/a/b/c")
		assert.False(t, ok)
	})

	t.Run("prod env first-level folder", func(t *testing.T) {
		node, ok := l.GetByPathEnvSlug("prod", "/d")
		require.True(t, ok)
		assert.Equal(t, folderD, node.ID)
	})
}

// ---------------------------------------------------------------------------
// GetByPathEnvID
// ---------------------------------------------------------------------------

func TestGetByPathEnvID(t *testing.T) {
	l := buildTestTree()

	t.Run("resolves by env ID", func(t *testing.T) {
		node, ok := l.GetByPathEnvID(devEnvID, "/a/b")
		require.True(t, ok)
		assert.Equal(t, folderB, node.ID)
	})

	t.Run("root by env ID", func(t *testing.T) {
		node, ok := l.GetByPathEnvID(prodEnvID, "/")
		require.True(t, ok)
		assert.Equal(t, rootProdID, node.ID)
	})

	t.Run("unknown env ID", func(t *testing.T) {
		_, ok := l.GetByPathEnvID(uuid.MustParse("99999999-9999-9999-9999-999999999999"), "/a")
		assert.False(t, ok)
	})
}

// ---------------------------------------------------------------------------
// GetByIDAndEnvID
// ---------------------------------------------------------------------------

func TestGetByIDAndEnvID(t *testing.T) {
	l := buildTestTree()

	t.Run("matching env", func(t *testing.T) {
		node, ok := l.GetByIDAndEnvID(devEnvID, folderA)
		require.True(t, ok)
		assert.Equal(t, folderA, node.ID)
	})

	t.Run("wrong env", func(t *testing.T) {
		_, ok := l.GetByIDAndEnvID(prodEnvID, folderA)
		assert.False(t, ok)
	})

	t.Run("nonexistent folder ID", func(t *testing.T) {
		_, ok := l.GetByIDAndEnvID(devEnvID, uuid.MustParse("99999999-9999-9999-9999-999999999999"))
		assert.False(t, ok)
	})
}

// ---------------------------------------------------------------------------
// GetByIDAndEnvSlug
// ---------------------------------------------------------------------------

func TestGetByIDAndEnvSlug(t *testing.T) {
	l := buildTestTree()

	t.Run("matching slug", func(t *testing.T) {
		node, ok := l.GetByIDAndEnvSlug("dev", folderB)
		require.True(t, ok)
		assert.Equal(t, folderB, node.ID)
	})

	t.Run("wrong slug", func(t *testing.T) {
		_, ok := l.GetByIDAndEnvSlug("prod", folderB)
		assert.False(t, ok)
	})

	t.Run("nonexistent slug", func(t *testing.T) {
		_, ok := l.GetByIDAndEnvSlug("staging", folderB)
		assert.False(t, ok)
	})
}

// ---------------------------------------------------------------------------
// GetPathByID / GetPath
// ---------------------------------------------------------------------------

func TestGetPathByID(t *testing.T) {
	l := buildTestTree()

	tests := []struct {
		name     string
		id       uuid.UUID
		expected string
		found    bool
	}{
		{"root returns /", rootDevID, "/", true},
		{"first level", folderA, "/a", true},
		{"second level", folderB, "/a/b", true},
		{"third level", folderC, "/a/b/c", true},
		{"prod first level", folderD, "/d", true},
		{"nonexistent ID", uuid.MustParse("99999999-9999-9999-9999-999999999999"), "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path, ok := l.GetPathByID(tt.id)
			assert.Equal(t, tt.found, ok)
			if ok {
				assert.Equal(t, tt.expected, path)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// GetEnv / GetEnvBySlug
// ---------------------------------------------------------------------------

func TestGetEnv(t *testing.T) {
	l := buildTestTree()

	t.Run("by ID", func(t *testing.T) {
		env, ok := l.GetEnv(devEnvID)
		require.True(t, ok)
		assert.Equal(t, "dev", env.Slug)
		assert.Equal(t, "Development", env.Name)
	})

	t.Run("by slug", func(t *testing.T) {
		env, ok := l.GetEnvBySlug("prod")
		require.True(t, ok)
		assert.Equal(t, prodEnvID, env.ID)
		assert.Equal(t, "Production", env.Name)
	})

	t.Run("unknown ID", func(t *testing.T) {
		_, ok := l.GetEnv(uuid.MustParse("99999999-9999-9999-9999-999999999999"))
		assert.False(t, ok)
	})

	t.Run("unknown slug", func(t *testing.T) {
		_, ok := l.GetEnvBySlug("staging")
		assert.False(t, ok)
	})
}

// ---------------------------------------------------------------------------
// FolderNode.GetEnv
// ---------------------------------------------------------------------------

func TestNodeGetEnv(t *testing.T) {
	l := buildTestTree()

	node, ok := l.GetByPathEnvSlug("prod", "/d")
	require.True(t, ok)

	env := node.GetEnv(l)
	require.NotNil(t, env)
	assert.Equal(t, "prod", env.Slug)
}

// ---------------------------------------------------------------------------
// Empty tree
// ---------------------------------------------------------------------------

func TestEmptyTree(t *testing.T) {
	l := newFolderLookup(nil)

	_, ok := l.GetByPathEnvSlug("dev", "/")
	assert.False(t, ok)

	_, ok = l.GetPathByID(uuid.New())
	assert.False(t, ok)

	_, ok = l.GetEnv(uuid.New())
	assert.False(t, ok)
}

// ---------------------------------------------------------------------------
// Environment isolation
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// GetTreeByPathEnvSlug / GetTreeByPathEnvID
// ---------------------------------------------------------------------------

func TestGetTreeByPathEnvSlug(t *testing.T) {
	l := buildTestTree()

	t.Run("root returns entire env subtree", func(t *testing.T) {
		nodes, ok := l.GetSubTreeByPathEnvSlug("dev", "/")
		require.True(t, ok)
		require.Len(t, nodes, 4) // root, a, b, c

		ids := make([]uuid.UUID, len(nodes))
		for i, n := range nodes {
			ids[i] = n.ID
		}
		assert.Equal(t, rootDevID, ids[0])
		assert.Equal(t, folderA, ids[1])
		assert.Equal(t, folderB, ids[2])
		assert.Equal(t, folderC, ids[3])
	})

	t.Run("subtree from mid-level", func(t *testing.T) {
		nodes, ok := l.GetSubTreeByPathEnvSlug("dev", "/a")
		require.True(t, ok)
		require.Len(t, nodes, 3) // a, b, c
		assert.Equal(t, folderA, nodes[0].ID)
		assert.Equal(t, folderB, nodes[1].ID)
		assert.Equal(t, folderC, nodes[2].ID)
	})

	t.Run("subtree from deeper level", func(t *testing.T) {
		nodes, ok := l.GetSubTreeByPathEnvSlug("dev", "/a/b")
		require.True(t, ok)
		require.Len(t, nodes, 2) // b, c
		assert.Equal(t, folderB, nodes[0].ID)
		assert.Equal(t, folderC, nodes[1].ID)
	})

	t.Run("leaf node returns single element", func(t *testing.T) {
		nodes, ok := l.GetSubTreeByPathEnvSlug("dev", "/a/b/c")
		require.True(t, ok)
		require.Len(t, nodes, 1)
		assert.Equal(t, folderC, nodes[0].ID)
	})

	t.Run("prod root subtree", func(t *testing.T) {
		nodes, ok := l.GetSubTreeByPathEnvSlug("prod", "/")
		require.True(t, ok)
		require.Len(t, nodes, 2) // root, d
		assert.Equal(t, rootProdID, nodes[0].ID)
		assert.Equal(t, folderD, nodes[1].ID)
	})

	t.Run("nonexistent path", func(t *testing.T) {
		_, ok := l.GetSubTreeByPathEnvSlug("dev", "/x/y")
		assert.False(t, ok)
	})

	t.Run("nonexistent env", func(t *testing.T) {
		_, ok := l.GetSubTreeByPathEnvSlug("staging", "/")
		assert.False(t, ok)
	})
}

func TestGetTreeByPathEnvID(t *testing.T) {
	l := buildTestTree()

	t.Run("returns subtree by env ID", func(t *testing.T) {
		nodes, ok := l.GetSubTreeByPathEnvID(devEnvID, "/a")
		require.True(t, ok)
		require.Len(t, nodes, 3)
		assert.Equal(t, folderA, nodes[0].ID)
	})

	t.Run("unknown env ID", func(t *testing.T) {
		_, ok := l.GetSubTreeByPathEnvID(uuid.MustParse("99999999-9999-9999-9999-999999999999"), "/")
		assert.False(t, ok)
	})
}

func TestGetTreeChildrenSortedByName(t *testing.T) {
	// Build a tree with multiple children at the same level to verify sort order.
	rows := []folderRow{
		{ID: rootDevID, Name: "root", EnvID: devEnvID, EnvSlug: "dev", EnvName: "Development"},
		{ID: folderC, Name: "cherry", ParentID: nullUUID(rootDevID), EnvID: devEnvID, EnvSlug: "dev", EnvName: "Development"},
		{ID: folderA, Name: "apple", ParentID: nullUUID(rootDevID), EnvID: devEnvID, EnvSlug: "dev", EnvName: "Development"},
		{ID: folderB, Name: "banana", ParentID: nullUUID(rootDevID), EnvID: devEnvID, EnvSlug: "dev", EnvName: "Development"},
	}
	l := newFolderLookup(rows)

	nodes, ok := l.GetSubTreeByPathEnvSlug("dev", "/")
	require.True(t, ok)
	require.Len(t, nodes, 4)

	assert.Equal(t, "root", nodes[0].Name)
	assert.Equal(t, "apple", nodes[1].Name)
	assert.Equal(t, "banana", nodes[2].Name)
	assert.Equal(t, "cherry", nodes[3].Name)
}

func TestGetTreeEmptyTree(t *testing.T) {
	l := newFolderLookup(nil)
	_, ok := l.GetSubTreeByPathEnvSlug("dev", "/")
	assert.False(t, ok)
}

func TestEnvironmentIsolation(t *testing.T) {
	l := buildTestTree()

	t.Run("same folder name in different envs are distinct", func(t *testing.T) {
		devRoot, ok := l.GetByPathEnvSlug("dev", "/")
		require.True(t, ok)

		prodRoot, ok := l.GetByPathEnvSlug("prod", "/")
		require.True(t, ok)

		assert.NotEqual(t, devRoot.ID, prodRoot.ID)
	})

	t.Run("folder from one env not reachable via other env path", func(t *testing.T) {
		// folderD belongs to prod
		_, ok := l.GetByIDAndEnvID(devEnvID, folderD)
		assert.False(t, ok)

		// folderA belongs to dev
		_, ok = l.GetByIDAndEnvSlug("prod", folderA)
		assert.False(t, ok)
	})
}
