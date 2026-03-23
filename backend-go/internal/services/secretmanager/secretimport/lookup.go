package secretimport

import (
	"sort"

	"github.com/google/uuid"
)

// ImportEntry represents a single secret import configured on a folder.
type ImportEntry struct {
	ID            uuid.UUID
	FolderID      uuid.UUID
	ImportPath    string
	ImportEnvID   uuid.UUID
	Position      int32
	IsReplication bool
	IsReserved    bool
}

// importTarget is a composite key for the reverse index.
type importTarget struct {
	envID uuid.UUID
	path  string
}

// ImportLookup provides O(1) lookup of secret imports for a project.
// Forward index: folder ID → imports configured on that folder (sorted by position).
// Reverse index: (envID, path) → imports that reference this target.
type ImportLookup struct {
	byFolderID map[uuid.UUID][]ImportEntry
	byID       map[uuid.UUID]*ImportEntry
	byTarget   map[importTarget][]*ImportEntry
}

func newImportLookup(rows []importRow) *ImportLookup {
	l := &ImportLookup{
		byFolderID: make(map[uuid.UUID][]ImportEntry),
		byID:       make(map[uuid.UUID]*ImportEntry, len(rows)),
		byTarget:   make(map[importTarget][]*ImportEntry),
	}

	// Group rows by folder ID.
	for _, r := range rows {
		entry := ImportEntry{
			ID:            r.ID,
			FolderID:      r.FolderID,
			ImportPath:    r.ImportPath,
			ImportEnvID:   r.ImportEnvID,
			Position:      r.Position,
			IsReplication: r.IsReplication.Valid && r.IsReplication.V,
			IsReserved:    r.IsReserved.Valid && r.IsReserved.V,
		}
		l.byFolderID[r.FolderID] = append(l.byFolderID[r.FolderID], entry)
	}

	// Sort each folder's imports by position, then build secondary indexes.
	for folderID := range l.byFolderID {
		entries := l.byFolderID[folderID]
		sort.Slice(entries, func(i, j int) bool {
			return entries[i].Position < entries[j].Position
		})
		l.byFolderID[folderID] = entries

		for i := range entries {
			e := &entries[i]
			l.byID[e.ID] = e
			key := importTarget{envID: e.ImportEnvID, path: e.ImportPath}
			l.byTarget[key] = append(l.byTarget[key], e)
		}
	}

	return l
}

// GetByFolderID returns imports for a folder, sorted by position (ascending).
// Returns nil if the folder has no imports.
func (l *ImportLookup) GetByFolderID(folderID uuid.UUID) []ImportEntry {
	return l.byFolderID[folderID]
}

// GetByID returns a single import entry by its ID.
func (l *ImportLookup) GetByID(id uuid.UUID) (*ImportEntry, bool) {
	entry, ok := l.byID[id]
	return entry, ok
}

// GetImportersOf returns all imports that reference the given env + path.
// Useful for answering "which folders import from this location?".
func (l *ImportLookup) GetImportersOf(envID uuid.UUID, path string) []*ImportEntry {
	return l.byTarget[importTarget{envID: envID, path: path}]
}

const maxImportDepth = 10

// ResolvedImport is a folder in the import chain with the import that led to it.
type ResolvedImport struct {
	FolderID uuid.UUID
	Import   ImportEntry
	Depth    int
}

// ResolveChain walks the full import chain starting from a folder and returns
// every reachable folder in resolution-priority order (depth-first, position-ordered).
//
// resolveFolder maps (envID, path) → folderID using the caller's FolderLookup.
// Cycles are skipped. Max depth is 10.
func (l *ImportLookup) ResolveChain(
	startFolderID uuid.UUID,
	resolveFolder func(envID uuid.UUID, path string) (uuid.UUID, bool),
) []ResolvedImport {
	var result []ResolvedImport
	visited := make(map[importTarget]bool)

	var walk func(folderID uuid.UUID, depth int)
	walk = func(folderID uuid.UUID, depth int) {
		if depth >= maxImportDepth {
			return
		}

		for _, entry := range l.GetByFolderID(folderID) {
			key := importTarget{envID: entry.ImportEnvID, path: entry.ImportPath}
			if visited[key] {
				continue
			}
			visited[key] = true

			resolvedID, ok := resolveFolder(entry.ImportEnvID, entry.ImportPath)
			if !ok {
				continue
			}

			result = append(result, ResolvedImport{
				FolderID: resolvedID,
				Import:   entry,
				Depth:    depth,
			})

			walk(resolvedID, depth+1)
		}
	}

	walk(startFolderID, 0)
	return result
}
