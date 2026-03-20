package secretimport

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

	folderRoot = uuid.MustParse("10000000-0000-0000-0000-000000000001")
	folderA    = uuid.MustParse("10000000-0000-0000-0000-000000000002")
	folderB    = uuid.MustParse("10000000-0000-0000-0000-000000000003")

	importID1 = uuid.MustParse("20000000-0000-0000-0000-000000000001")
	importID2 = uuid.MustParse("20000000-0000-0000-0000-000000000002")
	importID3 = uuid.MustParse("20000000-0000-0000-0000-000000000003")
	importID4 = uuid.MustParse("20000000-0000-0000-0000-000000000004")
	importID5 = uuid.MustParse("20000000-0000-0000-0000-000000000005")
)

func nullBool(v bool) sql.Null[bool] {
	return sql.Null[bool]{V: v, Valid: true}
}

// buildTestImports creates:
//
//	folderRoot: import from prod:/ (pos 1), import from prod:/d (pos 2)
//	folderA:    import from dev:/ (pos 1, replication), import from prod:/ (pos 2, reserved)
//	folderB:    import from dev:/a (pos 1)
func buildTestImports() *ImportLookup {
	rows := []importRow{
		{ID: importID1, ImportPath: "/", ImportEnvID: prodEnvID, Position: 1, FolderID: folderRoot, IsReplication: sql.Null[bool]{}, IsReserved: sql.Null[bool]{}},
		{ID: importID2, ImportPath: "/d", ImportEnvID: prodEnvID, Position: 2, FolderID: folderRoot, IsReplication: sql.Null[bool]{}, IsReserved: sql.Null[bool]{}},
		{ID: importID3, ImportPath: "/", ImportEnvID: devEnvID, Position: 1, FolderID: folderA, IsReplication: nullBool(true), IsReserved: sql.Null[bool]{}},
		{ID: importID4, ImportPath: "/", ImportEnvID: prodEnvID, Position: 2, FolderID: folderA, IsReplication: sql.Null[bool]{}, IsReserved: nullBool(true)},
		{ID: importID5, ImportPath: "/a", ImportEnvID: devEnvID, Position: 1, FolderID: folderB, IsReplication: sql.Null[bool]{}, IsReserved: sql.Null[bool]{}},
	}
	return newImportLookup(rows)
}

// ---------------------------------------------------------------------------
// GetByFolderID
// ---------------------------------------------------------------------------

func TestGetByFolderID(t *testing.T) {
	l := buildTestImports()

	t.Run("returns imports sorted by position", func(t *testing.T) {
		entries := l.GetByFolderID(folderRoot)
		require.Len(t, entries, 2)
		assert.Equal(t, importID1, entries[0].ID)
		assert.Equal(t, int32(1), entries[0].Position)
		assert.Equal(t, importID2, entries[1].ID)
		assert.Equal(t, int32(2), entries[1].Position)
	})

	t.Run("returns all fields correctly", func(t *testing.T) {
		entries := l.GetByFolderID(folderRoot)
		require.Len(t, entries, 2)

		assert.Equal(t, folderRoot, entries[0].FolderID)
		assert.Equal(t, "/", entries[0].ImportPath)
		assert.Equal(t, prodEnvID, entries[0].ImportEnvID)
		assert.False(t, entries[0].IsReplication)
		assert.False(t, entries[0].IsReserved)
	})

	t.Run("replication and reserved flags", func(t *testing.T) {
		entries := l.GetByFolderID(folderA)
		require.Len(t, entries, 2)

		assert.True(t, entries[0].IsReplication)
		assert.False(t, entries[0].IsReserved)

		assert.False(t, entries[1].IsReplication)
		assert.True(t, entries[1].IsReserved)
	})

	t.Run("single import folder", func(t *testing.T) {
		entries := l.GetByFolderID(folderB)
		require.Len(t, entries, 1)
		assert.Equal(t, importID5, entries[0].ID)
		assert.Equal(t, "/a", entries[0].ImportPath)
	})

	t.Run("folder with no imports returns nil", func(t *testing.T) {
		entries := l.GetByFolderID(uuid.MustParse("99999999-9999-9999-9999-999999999999"))
		assert.Nil(t, entries)
	})
}

func TestGetByFolderID_PositionOrdering(t *testing.T) {
	// Insert rows in reverse position order to verify sorting.
	rows := []importRow{
		{ID: importID3, ImportPath: "/c", ImportEnvID: devEnvID, Position: 3, FolderID: folderRoot},
		{ID: importID1, ImportPath: "/a", ImportEnvID: devEnvID, Position: 1, FolderID: folderRoot},
		{ID: importID2, ImportPath: "/b", ImportEnvID: devEnvID, Position: 2, FolderID: folderRoot},
	}
	l := newImportLookup(rows)

	entries := l.GetByFolderID(folderRoot)
	require.Len(t, entries, 3)
	assert.Equal(t, int32(1), entries[0].Position)
	assert.Equal(t, int32(2), entries[1].Position)
	assert.Equal(t, int32(3), entries[2].Position)
}

// ---------------------------------------------------------------------------
// GetByID
// ---------------------------------------------------------------------------

func TestGetByID(t *testing.T) {
	l := buildTestImports()

	t.Run("existing import", func(t *testing.T) {
		entry, ok := l.GetByID(importID3)
		require.True(t, ok)
		assert.Equal(t, importID3, entry.ID)
		assert.Equal(t, folderA, entry.FolderID)
		assert.True(t, entry.IsReplication)
	})

	t.Run("nonexistent import", func(t *testing.T) {
		_, ok := l.GetByID(uuid.MustParse("99999999-9999-9999-9999-999999999999"))
		assert.False(t, ok)
	})
}

// ---------------------------------------------------------------------------
// GetImportersOf
// ---------------------------------------------------------------------------

func TestGetImportersOf(t *testing.T) {
	l := buildTestImports()

	t.Run("multiple folders import prod:/", func(t *testing.T) {
		importers := l.GetImportersOf(prodEnvID, "/")
		require.Len(t, importers, 2)

		folderIDs := make(map[uuid.UUID]bool)
		for _, e := range importers {
			folderIDs[e.FolderID] = true
		}
		assert.True(t, folderIDs[folderRoot], "folderRoot should import prod:/")
		assert.True(t, folderIDs[folderA], "folderA should import prod:/")
	})

	t.Run("single importer", func(t *testing.T) {
		importers := l.GetImportersOf(prodEnvID, "/d")
		require.Len(t, importers, 1)
		assert.Equal(t, folderRoot, importers[0].FolderID)
	})

	t.Run("no importers for path", func(t *testing.T) {
		importers := l.GetImportersOf(devEnvID, "/nonexistent")
		assert.Nil(t, importers)
	})

	t.Run("no importers for unknown env", func(t *testing.T) {
		importers := l.GetImportersOf(uuid.MustParse("99999999-9999-9999-9999-999999999999"), "/")
		assert.Nil(t, importers)
	})
}

// ---------------------------------------------------------------------------
// Empty lookup
// ---------------------------------------------------------------------------

func TestEmptyLookup(t *testing.T) {
	l := newImportLookup(nil)

	assert.Nil(t, l.GetByFolderID(uuid.New()))

	_, ok := l.GetByID(uuid.New())
	assert.False(t, ok)

	assert.Nil(t, l.GetImportersOf(uuid.New(), "/"))
}

// ---------------------------------------------------------------------------
// Null booleans default to false
// ---------------------------------------------------------------------------

func TestNullBoolsDefaultToFalse(t *testing.T) {
	rows := []importRow{
		{
			ID: importID1, ImportPath: "/", ImportEnvID: devEnvID,
			Position: 1, FolderID: folderRoot,
			IsReplication: sql.Null[bool]{}, // null
			IsReserved:    sql.Null[bool]{}, // null
		},
	}
	l := newImportLookup(rows)

	entries := l.GetByFolderID(folderRoot)
	require.Len(t, entries, 1)
	assert.False(t, entries[0].IsReplication)
	assert.False(t, entries[0].IsReserved)
}

// ---------------------------------------------------------------------------
// ResolveChain
// ---------------------------------------------------------------------------

// Chain test folder IDs.
var (
	chainFolderA = uuid.MustParse("30000000-0000-0000-0000-000000000001")
	chainFolderB = uuid.MustParse("30000000-0000-0000-0000-000000000002")
	chainFolderC = uuid.MustParse("30000000-0000-0000-0000-000000000003")
	chainFolderD = uuid.MustParse("30000000-0000-0000-0000-000000000004")
	chainFolderE = uuid.MustParse("30000000-0000-0000-0000-000000000005")

	chainImp1 = uuid.MustParse("40000000-0000-0000-0000-000000000001")
	chainImp2 = uuid.MustParse("40000000-0000-0000-0000-000000000002")
	chainImp3 = uuid.MustParse("40000000-0000-0000-0000-000000000003")
	chainImp4 = uuid.MustParse("40000000-0000-0000-0000-000000000004")
)

// buildChainImports creates:
//
//	A imports: B (dev:"/b" pos 1), C (prod:"/" pos 2)
//	B imports: D (dev:"/d" pos 1)
//	C imports: E (prod:"/e" pos 1)
//	D imports: (none)
//	E imports: (none)
//
// Expected DFS order from A: B, D, C, E
func buildChainImports() *ImportLookup {
	rows := []importRow{
		{ID: chainImp1, ImportPath: "/b", ImportEnvID: devEnvID, Position: 1, FolderID: chainFolderA},
		{ID: chainImp2, ImportPath: "/", ImportEnvID: prodEnvID, Position: 2, FolderID: chainFolderA},
		{ID: chainImp3, ImportPath: "/d", ImportEnvID: devEnvID, Position: 1, FolderID: chainFolderB},
		{ID: chainImp4, ImportPath: "/e", ImportEnvID: prodEnvID, Position: 1, FolderID: chainFolderC},
	}
	return newImportLookup(rows)
}

// mockResolver maps (envID, path) → folderID for chain tests.
func mockResolver(mapping map[importTarget]uuid.UUID) func(uuid.UUID, string) (uuid.UUID, bool) {
	return func(envID uuid.UUID, path string) (uuid.UUID, bool) {
		id, ok := mapping[importTarget{envID: envID, path: path}]
		return id, ok
	}
}

func TestResolveChain_DepthFirst(t *testing.T) {
	l := buildChainImports()
	resolver := mockResolver(map[importTarget]uuid.UUID{
		{devEnvID, "/b"}:  chainFolderB,
		{prodEnvID, "/"}:  chainFolderC,
		{devEnvID, "/d"}:  chainFolderD,
		{prodEnvID, "/e"}: chainFolderE,
	})

	chain := l.ResolveChain(chainFolderA, resolver)

	require.Len(t, chain, 4)
	assert.Equal(t, chainFolderB, chain[0].FolderID)
	assert.Equal(t, 0, chain[0].Depth)
	assert.Equal(t, chainFolderD, chain[1].FolderID)
	assert.Equal(t, 1, chain[1].Depth)
	assert.Equal(t, chainFolderC, chain[2].FolderID)
	assert.Equal(t, 0, chain[2].Depth)
	assert.Equal(t, chainFolderE, chain[3].FolderID)
	assert.Equal(t, 1, chain[3].Depth)
}

func TestResolveChain_PreservesImportEntry(t *testing.T) {
	l := buildChainImports()
	resolver := mockResolver(map[importTarget]uuid.UUID{
		{devEnvID, "/b"}: chainFolderB,
		{devEnvID, "/d"}: chainFolderD,
	})

	chain := l.ResolveChain(chainFolderA, resolver)

	// Only B and D resolve (prod:/ not in resolver).
	require.Len(t, chain, 2)
	assert.Equal(t, chainImp1, chain[0].Import.ID)
	assert.Equal(t, chainImp3, chain[1].Import.ID)
}

func TestResolveChain_CycleDetection(t *testing.T) {
	// A imports B, B imports A's location — cycle.
	rows := []importRow{
		{ID: chainImp1, ImportPath: "/b", ImportEnvID: devEnvID, Position: 1, FolderID: chainFolderA},
		{ID: chainImp2, ImportPath: "/a", ImportEnvID: devEnvID, Position: 1, FolderID: chainFolderB},
	}
	l := newImportLookup(rows)

	resolver := mockResolver(map[importTarget]uuid.UUID{
		{devEnvID, "/b"}: chainFolderB,
		{devEnvID, "/a"}: chainFolderA,
	})

	chain := l.ResolveChain(chainFolderA, resolver)

	// B is visited, then B tries to import A — but dev:"/a" would lead back.
	// A itself isn't in visited (only import targets are), but dev:"/a" is visited
	// when B's import resolves it. So the chain is just [B, A] — A appears because
	// it's the first time dev:"/a" is seen from B's import.
	// Then A's import (dev:"/b") is already visited → stops.
	require.Len(t, chain, 2)
	assert.Equal(t, chainFolderB, chain[0].FolderID)
	assert.Equal(t, chainFolderA, chain[1].FolderID)
}

func TestResolveChain_SelfImportCycle(t *testing.T) {
	// A imports its own location — immediate cycle.
	rows := []importRow{
		{ID: chainImp1, ImportPath: "/a", ImportEnvID: devEnvID, Position: 1, FolderID: chainFolderA},
	}
	l := newImportLookup(rows)

	resolver := mockResolver(map[importTarget]uuid.UUID{
		{devEnvID, "/a"}: chainFolderA,
	})

	chain := l.ResolveChain(chainFolderA, resolver)

	// A is resolved once, then recursion finds the same target already visited.
	require.Len(t, chain, 1)
	assert.Equal(t, chainFolderA, chain[0].FolderID)
}

func TestResolveChain_MaxDepth(t *testing.T) {
	// Build a linear chain deeper than maxImportDepth.
	folders := make([]uuid.UUID, 15)
	for i := range folders {
		folders[i] = uuid.New()
	}

	var rows []importRow
	mapping := make(map[importTarget]uuid.UUID)
	for i := 0; i < len(folders)-1; i++ {
		path := "/" + folders[i+1].String()
		rows = append(rows, importRow{
			ID: uuid.New(), ImportPath: path, ImportEnvID: devEnvID,
			Position: 1, FolderID: folders[i],
		})
		mapping[importTarget{devEnvID, path}] = folders[i+1]
	}

	l := newImportLookup(rows)
	chain := l.ResolveChain(folders[0], mockResolver(mapping))

	// Should stop at maxImportDepth (10), not follow all 14 links.
	assert.Len(t, chain, maxImportDepth)
}

func TestResolveChain_UnresolvableImportsSkipped(t *testing.T) {
	l := buildChainImports()

	// Resolver that can't resolve anything.
	noop := func(uuid.UUID, string) (uuid.UUID, bool) { return uuid.Nil, false }

	chain := l.ResolveChain(chainFolderA, noop)
	assert.Empty(t, chain)
}

func TestResolveChain_FolderWithNoImports(t *testing.T) {
	l := buildChainImports()
	resolver := mockResolver(nil)

	chain := l.ResolveChain(chainFolderD, resolver) // D has no imports
	assert.Empty(t, chain)
}

func TestResolveChain_EmptyLookup(t *testing.T) {
	l := newImportLookup(nil)
	resolver := mockResolver(nil)

	chain := l.ResolveChain(uuid.New(), resolver)
	assert.Empty(t, chain)
}

func TestResolveChain_DiamondDedup(t *testing.T) {
	// A imports B (pos 1) and C (pos 2).
	// Both B and C import the same target: dev:"/shared".
	// The shared folder should appear only once (from B, first visited).
	sharedFolder := uuid.MustParse("30000000-0000-0000-0000-000000000099")
	rows := []importRow{
		{ID: chainImp1, ImportPath: "/b", ImportEnvID: devEnvID, Position: 1, FolderID: chainFolderA},
		{ID: chainImp2, ImportPath: "/c", ImportEnvID: devEnvID, Position: 2, FolderID: chainFolderA},
		{ID: chainImp3, ImportPath: "/shared", ImportEnvID: devEnvID, Position: 1, FolderID: chainFolderB},
		{ID: chainImp4, ImportPath: "/shared", ImportEnvID: devEnvID, Position: 1, FolderID: chainFolderC},
	}
	l := newImportLookup(rows)

	resolver := mockResolver(map[importTarget]uuid.UUID{
		{devEnvID, "/b"}:      chainFolderB,
		{devEnvID, "/c"}:      chainFolderC,
		{devEnvID, "/shared"}: sharedFolder,
	})

	chain := l.ResolveChain(chainFolderA, resolver)

	// B, shared (from B), C — shared NOT duplicated from C.
	require.Len(t, chain, 3)
	assert.Equal(t, chainFolderB, chain[0].FolderID)
	assert.Equal(t, sharedFolder, chain[1].FolderID)
	assert.Equal(t, chainFolderC, chain[2].FolderID)
}
