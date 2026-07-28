package secretimport

import (
	"bytes"
	"regexp"
	"sort"

	"github.com/google/uuid"
)

// reservedReplicationRegex matches /__reserve_replication_<uuid> anywhere in a path.
var reservedReplicationRegex = regexp.MustCompile(`/__reserve_replication_([a-f0-9-]{36})`)

const (
	flagReplication = 1 << 0
	flagReserved    = 1 << 1
)

// importTarget is a composite key for reverse lookups.
type importTarget struct {
	envID uuid.UUID
	path  string
}

// ImportLookup provides efficient lookup of secret imports using CSR structure.
type ImportLookup struct {
	// Parallel arrays - sorted by (folderID, position)
	ids          []uuid.UUID
	folderIDs    []uuid.UUID
	targetEnvIDs []uuid.UUID
	positions    []int32
	flags        []uint8

	// Path arena - deduplicated string storage
	pathOffsets []uint32
	pathLens    []uint16
	pathArena   []byte

	// Index: folder -> range in arrays
	folderStart map[uuid.UUID]int32
	folderEnd   map[uuid.UUID]int32

	// Index: ID -> array index (binary search)
	idOrder []int32

	// Reverse index (cold path)
	byTarget map[importTarget][]int32
}

func newImportLookup(rows []importRow) *ImportLookup {
	if len(rows) == 0 {
		return &ImportLookup{
			folderStart: make(map[uuid.UUID]int32),
			folderEnd:   make(map[uuid.UUID]int32),
			byTarget:    make(map[importTarget][]int32),
		}
	}

	n := len(rows)

	// Sort rows by (folderID, position)
	sort.Slice(rows, func(i, j int) bool {
		cmp := bytes.Compare(rows[i].FolderID[:], rows[j].FolderID[:])
		if cmp != 0 {
			return cmp < 0
		}
		return rows[i].Position < rows[j].Position
	})

	l := &ImportLookup{
		ids:          make([]uuid.UUID, n),
		folderIDs:    make([]uuid.UUID, n),
		targetEnvIDs: make([]uuid.UUID, n),
		positions:    make([]int32, n),
		flags:        make([]uint8, n),
		pathOffsets:  make([]uint32, n),
		pathLens:     make([]uint16, n),
		pathArena:    make([]byte, 0, n*20), // estimate avg path length
		folderStart:  make(map[uuid.UUID]int32),
		folderEnd:    make(map[uuid.UUID]int32),
		idOrder:      make([]int32, n),
		byTarget:     make(map[importTarget][]int32),
	}

	// Path interning map
	pathPool := make(map[string]struct {
		offset uint32
		length uint16
	})

	// Populate parallel arrays
	var currentFolder uuid.UUID
	var currentStart int32

	for i, r := range rows {
		// Track folder ranges
		if i == 0 || r.FolderID != currentFolder {
			if i > 0 {
				l.folderEnd[currentFolder] = int32(i)
			}
			currentFolder = r.FolderID
			currentStart = int32(i)
			l.folderStart[currentFolder] = currentStart
		}

		l.ids[i] = r.ID
		l.folderIDs[i] = r.FolderID
		l.targetEnvIDs[i] = r.ImportEnvID
		l.positions[i] = r.Position

		// Flags
		var f uint8
		if r.IsReplication.Valid && r.IsReplication.V {
			f |= flagReplication
		}
		if r.IsReserved.Valid && r.IsReserved.V {
			f |= flagReserved
		}
		l.flags[i] = f

		// Intern path
		if existing, ok := pathPool[r.ImportPath]; ok {
			l.pathOffsets[i] = existing.offset
			l.pathLens[i] = existing.length
		} else {
			offset := uint32(len(l.pathArena))
			length := uint16(len(r.ImportPath))
			l.pathArena = append(l.pathArena, r.ImportPath...)
			l.pathOffsets[i] = offset
			l.pathLens[i] = length
			pathPool[r.ImportPath] = struct {
				offset uint32
				length uint16
			}{offset, length}
		}

		// Build reverse index
		key := importTarget{envID: r.ImportEnvID, path: r.ImportPath}
		l.byTarget[key] = append(l.byTarget[key], int32(i))
	}

	// Close last folder range
	if n > 0 {
		l.folderEnd[currentFolder] = int32(n)
	}

	// Build sorted ID index for binary search
	for i := range l.idOrder {
		l.idOrder[i] = int32(i)
	}
	sort.Slice(l.idOrder, func(a, b int) bool {
		return bytes.Compare(l.ids[l.idOrder[a]][:], l.ids[l.idOrder[b]][:]) < 0
	})

	return l
}

// Len returns the total number of imports.
func (l *ImportLookup) Len() int {
	return len(l.ids)
}

// ImportsOfFolder returns the range [start, end) of imports for a folder.
// Returns (0, 0) if folder has no imports.
func (l *ImportLookup) ImportsOfFolder(folderID uuid.UUID) (start, end int32) {
	start, ok := l.folderStart[folderID]
	if !ok {
		return 0, 0
	}
	return start, l.folderEnd[folderID]
}

// ID returns the import ID at index i.
func (l *ImportLookup) ID(i int32) uuid.UUID {
	return l.ids[i]
}

// FolderID returns the source folder ID at index i.
func (l *ImportLookup) FolderID(i int32) uuid.UUID {
	return l.folderIDs[i]
}

// TargetEnvID returns the target environment ID at index i.
func (l *ImportLookup) TargetEnvID(i int32) uuid.UUID {
	return l.targetEnvIDs[i]
}

// TargetPath returns the target path at index i.
func (l *ImportLookup) TargetPath(i int32) string {
	offset := l.pathOffsets[i]
	length := l.pathLens[i]
	return string(l.pathArena[offset : offset+uint32(length)])
}

// Position returns the position at index i.
func (l *ImportLookup) Position(i int32) int32 {
	return l.positions[i]
}

// IsReplication returns whether the import at index i is a replication.
func (l *ImportLookup) IsReplication(i int32) bool {
	return l.flags[i]&flagReplication != 0
}

// IsReserved returns whether the import at index i is reserved.
func (l *ImportLookup) IsReserved(i int32) bool {
	return l.flags[i]&flagReserved != 0
}

// IndexByID returns the array index for an import ID using binary search.
// Returns (-1, false) if not found.
func (l *ImportLookup) IndexByID(id uuid.UUID) (int32, bool) {
	i := sort.Search(len(l.idOrder), func(k int) bool {
		return bytes.Compare(l.ids[l.idOrder[k]][:], id[:]) >= 0
	})
	if i < len(l.idOrder) && l.ids[l.idOrder[i]] == id {
		return l.idOrder[i], true
	}
	return -1, false
}

// ImportersOf returns indices of imports that target the given env + path.
// Returns nil if no imports target this location.
func (l *ImportLookup) ImportersOf(envID uuid.UUID, path string) []int32 {
	return l.byTarget[importTarget{envID: envID, path: path}]
}

// ResolveReserved resolves a reserved replication import to its original source.
// If the import at index i is reserved (path matches /__reserve_replication_<uuid>),
// it extracts the UUID, looks up the original import by ID, and returns that import's
// envID and path. Otherwise returns the import's own envID and path unchanged.
func (l *ImportLookup) ResolveReserved(i int32) (envID uuid.UUID, path string) {
	envID = l.TargetEnvID(i)
	path = l.TargetPath(i)

	if !l.IsReserved(i) {
		return envID, path
	}

	match := reservedReplicationRegex.FindStringSubmatch(path)
	if match == nil {
		return envID, path
	}

	originalID, err := uuid.Parse(match[1])
	if err != nil {
		return envID, path
	}

	originalIdx, found := l.IndexByID(originalID)
	if !found {
		return envID, path
	}

	return l.TargetEnvID(originalIdx), l.TargetPath(originalIdx)
}

const maxImportDepth = 10

// ResolvedImport represents a folder in the import chain.
type ResolvedImport struct {
	FolderID  uuid.UUID
	ImportIdx int32
	Depth     int
	EnvID     uuid.UUID
	Path      string
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

		start, end := l.ImportsOfFolder(folderID)
		for i := start; i < end; i++ {
			// Skip replication imports - they should only be resolved through
			// the reserved replicated folder, not the live replication source.
			if l.IsReplication(i) {
				continue
			}

			// For display/permissions, resolve reserved imports to the original source.
			// This ensures permission checks and API responses use the original
			// location (e.g. "/") rather than the reserved folder path.
			displayEnvID, displayPath := l.ResolveReserved(i)

			// Cycle detection uses display values (original source)
			key := importTarget{envID: displayEnvID, path: displayPath}
			if visited[key] {
				continue
			}
			visited[key] = true

			// For folder lookup, use the ACTUAL import target (reserved path for reserved imports).
			// This ensures we fetch secrets from the replicated copy, not the live source.
			fetchEnvID := l.TargetEnvID(i)
			fetchPath := l.TargetPath(i)
			resolvedID, ok := resolveFolder(fetchEnvID, fetchPath)
			if !ok {
				continue
			}

			result = append(result, ResolvedImport{
				FolderID:  resolvedID,
				ImportIdx: i,
				Depth:     depth,
				EnvID:     displayEnvID,
				Path:      displayPath,
			})

			// Don't recurse into reserved folders - they're replicated copies without their own imports
			if !l.IsReserved(i) {
				walk(resolvedID, depth+1)
			}
		}
	}

	walk(startFolderID, 0)
	return result
}
