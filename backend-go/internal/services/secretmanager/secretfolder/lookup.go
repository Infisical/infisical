package secretfolder

import (
	"sort"
	"strings"

	"github.com/google/uuid"
)

// FolderNode is returned from lookups - provides read-only access to folder data.
type FolderNode struct {
	ID   uuid.UUID
	Name string
	path string
}

// GetPath returns the full path from root to this node (e.g. "/hello/world").
func (n *FolderNode) GetPath() string {
	return n.path
}

// FolderLookup is a CSR-based in-memory folder tree for a project.
type FolderLookup struct {
	// Folder data - parallel arrays
	ids       []uuid.UUID
	names     []string
	parentIdx []int32

	// CSR children: children of folder i are at childrenIdx[childStart[i]:childStart[i+1]]
	childStart  []int32
	childrenIdx []int32

	// Lookups
	idToIdx map[uuid.UUID]int32
	rootIdx map[uuid.UUID]int32 // envID -> root folder index

	// Environment - single map
	envSlugByID map[uuid.UUID]string
}

func newFolderLookup(rows []folderRow) *FolderLookup {
	if len(rows) == 0 {
		return &FolderLookup{
			idToIdx:     make(map[uuid.UUID]int32),
			rootIdx:     make(map[uuid.UUID]int32),
			envSlugByID: make(map[uuid.UUID]string),
		}
	}

	n := len(rows)
	l := &FolderLookup{
		ids:         make([]uuid.UUID, n),
		names:       make([]string, n),
		parentIdx:   make([]int32, n),
		childStart:  make([]int32, n+1),
		idToIdx:     make(map[uuid.UUID]int32, n),
		rootIdx:     make(map[uuid.UUID]int32),
		envSlugByID: make(map[uuid.UUID]string),
	}

	// Build temporary ID -> row index map for parent resolution
	rowIdxByID := make(map[uuid.UUID]int32, n)
	for i, r := range rows {
		rowIdxByID[r.ID] = int32(i)
	}

	// Pass 1: populate parallel arrays
	for i, r := range rows {
		l.ids[i] = r.ID
		l.names[i] = r.Name
		l.idToIdx[r.ID] = int32(i)

		if !r.ParentID.Valid {
			l.parentIdx[i] = -1
			l.rootIdx[r.EnvID] = int32(i)
			l.envSlugByID[r.EnvID] = r.EnvSlug
		} else {
			l.parentIdx[i] = rowIdxByID[r.ParentID.V]
		}
	}

	// Pass 2: count children per node
	childCount := make([]int32, n)
	for i := range n {
		if l.parentIdx[i] != -1 {
			childCount[l.parentIdx[i]]++
		}
	}

	// Pass 3: build childStart (prefix sum)
	l.childStart[0] = 0
	for i := range n {
		l.childStart[i+1] = l.childStart[i] + childCount[i]
	}

	// Pass 4: populate childrenIdx
	totalChildren := l.childStart[n]
	l.childrenIdx = make([]int32, totalChildren)
	insertPos := make([]int32, n)
	copy(insertPos, l.childStart[:n])

	for i := int32(0); i < int32(n); i++ {
		if l.parentIdx[i] != -1 {
			parent := l.parentIdx[i]
			l.childrenIdx[insertPos[parent]] = i
			insertPos[parent]++
		}
	}

	// Pass 5: sort children by name for each node
	for i := range n {
		start := l.childStart[i]
		end := l.childStart[i+1]
		if end > start {
			children := l.childrenIdx[start:end]
			sort.Slice(children, func(a, b int) bool {
				return l.names[children[a]] < l.names[children[b]]
			})
		}
	}

	return l
}

// getPath computes path for a folder index.
func (l *FolderLookup) getPath(idx int32) string {
	if idx < 0 || int(idx) >= len(l.ids) {
		return ""
	}

	var segments []string
	for cur := idx; l.parentIdx[cur] != -1; cur = l.parentIdx[cur] {
		segments = append(segments, l.names[cur])
	}

	// Reverse segments
	for i, j := 0, len(segments)-1; i < j; i, j = i+1, j-1 {
		segments[i], segments[j] = segments[j], segments[i]
	}

	return "/" + strings.Join(segments, "/")
}

// toNode converts an index to a FolderNode.
func (l *FolderLookup) toNode(idx int32) *FolderNode {
	return &FolderNode{
		ID:   l.ids[idx],
		Name: l.names[idx],
		path: l.getPath(idx),
	}
}

// GetByPath resolves envID + path to a node.
func (l *FolderLookup) GetByPath(envID uuid.UUID, path string) (*FolderNode, bool) {
	rootIdx, ok := l.rootIdx[envID]
	if !ok {
		return nil, false
	}

	segments := splitPath(path)
	idx := rootIdx

	for _, seg := range segments {
		found := false
		children := l.childrenIdx[l.childStart[idx]:l.childStart[idx+1]]
		for _, childIdx := range children {
			if l.names[childIdx] == seg {
				idx = childIdx
				found = true
				break
			}
		}
		if !found {
			return nil, false
		}
	}

	return l.toNode(idx), true
}

// GetByID returns the node for the given folder ID.
func (l *FolderLookup) GetByID(folderID uuid.UUID) (*FolderNode, bool) {
	idx, ok := l.idToIdx[folderID]
	if !ok {
		return nil, false
	}
	return l.toNode(idx), true
}

// GetPathByID returns the full path for a folder ID.
func (l *FolderLookup) GetPathByID(id uuid.UUID) (string, bool) {
	idx, ok := l.idToIdx[id]
	if !ok {
		return "", false
	}
	return l.getPath(idx), true
}

// GetSubTree returns the node and all descendants in depth-first pre-order.
func (l *FolderLookup) GetSubTree(envID uuid.UUID, path string) ([]*FolderNode, bool) {
	node, ok := l.GetByPath(envID, path)
	if !ok {
		return nil, false
	}

	startIdx := l.idToIdx[node.ID]
	return l.collectTree(startIdx), true
}

func (l *FolderLookup) collectTree(rootIdx int32) []*FolderNode {
	var result []*FolderNode
	stack := []int32{rootIdx}

	for len(stack) > 0 {
		idx := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		result = append(result, l.toNode(idx))

		// Push children in reverse order so first child is popped first
		children := l.childrenIdx[l.childStart[idx]:l.childStart[idx+1]]
		for i := len(children) - 1; i >= 0; i-- {
			stack = append(stack, children[i])
		}
	}

	return result
}

func splitPath(p string) []string {
	trimmed := strings.Trim(p, "/")
	if trimmed == "" {
		return nil
	}
	return strings.Split(trimmed, "/")
}

// GetEnvSlug returns the slug for the given environment ID.
func (l *FolderLookup) GetEnvSlug(envID uuid.UUID) (string, bool) {
	slug, ok := l.envSlugByID[envID]
	return slug, ok
}

// GetEnvIDBySlug returns the environment ID for the given slug by iterating the map.
func (l *FolderLookup) GetEnvIDBySlug(slug string) (uuid.UUID, bool) {
	for id, s := range l.envSlugByID {
		if s == slug {
			return id, true
		}
	}
	return uuid.UUID{}, false
}

// HasEnv reports whether folders for the given environment have been loaded.
func (l *FolderLookup) HasEnv(envID uuid.UUID) bool {
	_, ok := l.rootIdx[envID]
	return ok
}
