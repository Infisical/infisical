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
		{ID: rootDevID, Name: "root", ParentID: sql.Null[uuid.UUID]{}, EnvID: devEnvID},
		{ID: folderA, Name: "a", ParentID: nullUUID(rootDevID), EnvID: devEnvID},
		{ID: folderB, Name: "b", ParentID: nullUUID(folderA), EnvID: devEnvID},
		{ID: folderC, Name: "c", ParentID: nullUUID(folderB), EnvID: devEnvID},
		{ID: rootProdID, Name: "root", ParentID: sql.Null[uuid.UUID]{}, EnvID: prodEnvID},
		{ID: folderD, Name: "d", ParentID: nullUUID(rootProdID), EnvID: prodEnvID},
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
// GetByPath
// ---------------------------------------------------------------------------

func TestGetByPath(t *testing.T) {
	l := buildTestTree()

	t.Run("root path with leading slash", func(t *testing.T) {
		node, ok := l.GetByPath(devEnvID, "/")
		require.True(t, ok)
		assert.Equal(t, rootDevID, node.ID)
	})

	t.Run("root path empty string", func(t *testing.T) {
		node, ok := l.GetByPath(devEnvID, "")
		require.True(t, ok)
		assert.Equal(t, rootDevID, node.ID)
	})

	t.Run("nested path with leading slash", func(t *testing.T) {
		node, ok := l.GetByPath(devEnvID, "/a/b/c")
		require.True(t, ok)
		assert.Equal(t, folderC, node.ID)
	})

	t.Run("nested path without leading slash", func(t *testing.T) {
		node, ok := l.GetByPath(devEnvID, "a/b/c")
		require.True(t, ok)
		assert.Equal(t, folderC, node.ID)
	})

	t.Run("nested path with trailing slash", func(t *testing.T) {
		node, ok := l.GetByPath(devEnvID, "/a/b/c/")
		require.True(t, ok)
		assert.Equal(t, folderC, node.ID)
	})

	t.Run("partial path", func(t *testing.T) {
		node, ok := l.GetByPath(devEnvID, "/a/b")
		require.True(t, ok)
		assert.Equal(t, folderB, node.ID)
	})

	t.Run("nonexistent path", func(t *testing.T) {
		_, ok := l.GetByPath(devEnvID, "/a/x")
		assert.False(t, ok)
	})

	t.Run("nonexistent env ID", func(t *testing.T) {
		_, ok := l.GetByPath(uuid.MustParse("99999999-9999-9999-9999-999999999999"), "/a")
		assert.False(t, ok)
	})

	t.Run("path exists in dev but not prod", func(t *testing.T) {
		_, ok := l.GetByPath(prodEnvID, "/a/b/c")
		assert.False(t, ok)
	})

	t.Run("prod env first-level folder", func(t *testing.T) {
		node, ok := l.GetByPath(prodEnvID, "/d")
		require.True(t, ok)
		assert.Equal(t, folderD, node.ID)
	})
}

// ---------------------------------------------------------------------------
// GetByID
// ---------------------------------------------------------------------------

func TestGetByID(t *testing.T) {
	l := buildTestTree()

	t.Run("existing folder", func(t *testing.T) {
		node, ok := l.GetByID(folderA)
		require.True(t, ok)
		assert.Equal(t, folderA, node.ID)
	})

	t.Run("nonexistent folder ID", func(t *testing.T) {
		_, ok := l.GetByID(uuid.MustParse("99999999-9999-9999-9999-999999999999"))
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
// Empty tree
// ---------------------------------------------------------------------------

func TestEmptyTree(t *testing.T) {
	l := newFolderLookup(nil)

	_, ok := l.GetByPath(devEnvID, "/")
	assert.False(t, ok)

	_, ok = l.GetPathByID(uuid.New())
	assert.False(t, ok)
}

// ---------------------------------------------------------------------------
// GetSubTree
// ---------------------------------------------------------------------------

func TestGetSubTree(t *testing.T) {
	l := buildTestTree()

	t.Run("root returns entire env subtree", func(t *testing.T) {
		nodes, ok := l.GetSubTree(devEnvID, "/")
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
		nodes, ok := l.GetSubTree(devEnvID, "/a")
		require.True(t, ok)
		require.Len(t, nodes, 3) // a, b, c
		assert.Equal(t, folderA, nodes[0].ID)
		assert.Equal(t, folderB, nodes[1].ID)
		assert.Equal(t, folderC, nodes[2].ID)
	})

	t.Run("subtree from deeper level", func(t *testing.T) {
		nodes, ok := l.GetSubTree(devEnvID, "/a/b")
		require.True(t, ok)
		require.Len(t, nodes, 2) // b, c
		assert.Equal(t, folderB, nodes[0].ID)
		assert.Equal(t, folderC, nodes[1].ID)
	})

	t.Run("leaf node returns single element", func(t *testing.T) {
		nodes, ok := l.GetSubTree(devEnvID, "/a/b/c")
		require.True(t, ok)
		require.Len(t, nodes, 1)
		assert.Equal(t, folderC, nodes[0].ID)
	})

	t.Run("prod root subtree", func(t *testing.T) {
		nodes, ok := l.GetSubTree(prodEnvID, "/")
		require.True(t, ok)
		require.Len(t, nodes, 2) // root, d
		assert.Equal(t, rootProdID, nodes[0].ID)
		assert.Equal(t, folderD, nodes[1].ID)
	})

	t.Run("nonexistent path", func(t *testing.T) {
		_, ok := l.GetSubTree(devEnvID, "/x/y")
		assert.False(t, ok)
	})

	t.Run("nonexistent env", func(t *testing.T) {
		_, ok := l.GetSubTree(uuid.MustParse("99999999-9999-9999-9999-999999999999"), "/")
		assert.False(t, ok)
	})
}

func TestGetSubTreeChildrenSortedByName(t *testing.T) {
	// Build a tree with multiple children at the same level to verify sort order.
	rows := []folderRow{
		{ID: rootDevID, Name: "root", EnvID: devEnvID},
		{ID: folderC, Name: "cherry", ParentID: nullUUID(rootDevID), EnvID: devEnvID},
		{ID: folderA, Name: "apple", ParentID: nullUUID(rootDevID), EnvID: devEnvID},
		{ID: folderB, Name: "banana", ParentID: nullUUID(rootDevID), EnvID: devEnvID},
	}
	l := newFolderLookup(rows)

	nodes, ok := l.GetSubTree(devEnvID, "/")
	require.True(t, ok)
	require.Len(t, nodes, 4)

	assert.Equal(t, "root", nodes[0].Name)
	assert.Equal(t, "apple", nodes[1].Name)
	assert.Equal(t, "banana", nodes[2].Name)
	assert.Equal(t, "cherry", nodes[3].Name)
}

func TestGetSubTreeEmptyTree(t *testing.T) {
	l := newFolderLookup(nil)
	_, ok := l.GetSubTree(devEnvID, "/")
	assert.False(t, ok)
}

// ---------------------------------------------------------------------------
// Environment isolation
// ---------------------------------------------------------------------------

func TestEnvironmentIsolation(t *testing.T) {
	l := buildTestTree()

	t.Run("same folder name in different envs are distinct", func(t *testing.T) {
		devRoot, ok := l.GetByPath(devEnvID, "/")
		require.True(t, ok)

		prodRoot, ok := l.GetByPath(prodEnvID, "/")
		require.True(t, ok)

		assert.NotEqual(t, devRoot.ID, prodRoot.ID)
	})

	t.Run("folder from one env not reachable via other env path", func(t *testing.T) {
		// folderD belongs to prod — not reachable via dev
		_, ok := l.GetByPath(devEnvID, "/d")
		assert.False(t, ok)

		// folderA belongs to dev — not reachable via prod
		_, ok = l.GetByPath(prodEnvID, "/a")
		assert.False(t, ok)
	})
}
