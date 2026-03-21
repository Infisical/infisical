package secretfolder

import (
	"sort"
	"strings"

	"github.com/google/uuid"
)

// FolderEnv holds environment metadata, stored once per environment.
type FolderEnv struct {
	ID   uuid.UUID
	Name string
	Slug string
}

// FolderNode is a single folder in the tree.
type FolderNode struct {
	ID       uuid.UUID
	Name     string
	EnvID    uuid.UUID
	parent   *FolderNode
	children map[string]*FolderNode
}

// GetEnv returns the environment metadata for this node.
func (n *FolderNode) GetEnv(l *FolderLookup) *FolderEnv {
	return l.envs[n.EnvID]
}

// GetPath returns the full path from root to this node (e.g. "/hello/world").
func (n *FolderNode) GetPath() string {
	var segments []string
	for cur := n; cur.parent != nil; cur = cur.parent {
		segments = append(segments, cur.Name)
	}
	for i, j := 0, len(segments)-1; i < j; i, j = i+1, j-1 {
		segments[i], segments[j] = segments[j], segments[i]
	}
	return "/" + strings.Join(segments, "/")
}

// FolderLookup is an in-memory folder tree for a single project.
type FolderLookup struct {
	byID       map[uuid.UUID]*FolderNode
	envRoots   map[uuid.UUID]*FolderNode // envID → root
	envBySlug  map[string]*FolderNode    // envSlug → root
	envs       map[uuid.UUID]*FolderEnv
	envsBySlug map[string]*FolderEnv
}

func newFolderLookup(rows []folderRow) *FolderLookup {
	l := &FolderLookup{
		byID:       make(map[uuid.UUID]*FolderNode, len(rows)),
		envRoots:   make(map[uuid.UUID]*FolderNode),
		envBySlug:  make(map[string]*FolderNode),
		envs:       make(map[uuid.UUID]*FolderEnv),
		envsBySlug: make(map[string]*FolderEnv),
	}

	// Pass 1: create all nodes and collect envs.
	for _, r := range rows {
		l.byID[r.ID] = &FolderNode{
			ID:       r.ID,
			Name:     r.Name,
			EnvID:    r.EnvID,
			children: make(map[string]*FolderNode, 4),
		}
		if _, ok := l.envs[r.EnvID]; !ok {
			env := &FolderEnv{ID: r.EnvID, Name: r.EnvName, Slug: r.EnvSlug}
			l.envs[r.EnvID] = env
			l.envsBySlug[r.EnvSlug] = env
		}
	}

	// Pass 2: link parent ↔ children, identify roots.
	for _, r := range rows {
		node := l.byID[r.ID]
		if !r.ParentID.Valid {
			l.envRoots[r.EnvID] = node
			l.envBySlug[r.EnvSlug] = node
			continue
		}
		if p, ok := l.byID[r.ParentID.V]; ok {
			node.parent = p
			p.children[node.Name] = node
		}
	}

	return l
}

// GetByPathEnvSlug resolves envSlug + path (e.g. "dev", "/hello/world") to a node.
func (l *FolderLookup) GetByPathEnvSlug(envSlug, path string) (*FolderNode, bool) {
	root, ok := l.envBySlug[envSlug]
	if !ok {
		return nil, false
	}
	return walkPath(root, path)
}

// GetByPathEnvID resolves envID + path to a node.
func (l *FolderLookup) GetByPathEnvID(envID uuid.UUID, path string) (*FolderNode, bool) {
	root, ok := l.envRoots[envID]
	if !ok {
		return nil, false
	}
	return walkPath(root, path)
}

// GetByIDAndEnvID returns the node if it exists and belongs to the given env.
func (l *FolderLookup) GetByIDAndEnvID(envID, folderID uuid.UUID) (*FolderNode, bool) {
	node, ok := l.byID[folderID]
	if !ok || node.EnvID != envID {
		return nil, false
	}
	return node, true
}

// GetByIDAndEnvSlug returns the node if it exists and belongs to the given env slug.
func (l *FolderLookup) GetByIDAndEnvSlug(envSlug string, folderID uuid.UUID) (*FolderNode, bool) {
	node, ok := l.byID[folderID]
	if !ok {
		return nil, false
	}
	env, ok := l.envsBySlug[envSlug]
	if !ok || node.EnvID != env.ID {
		return nil, false
	}
	return node, true
}

// GetPathByID returns the full path for a folder ID.
func (l *FolderLookup) GetPathByID(id uuid.UUID) (string, bool) {
	node, ok := l.byID[id]
	if !ok {
		return "", false
	}
	return node.GetPath(), true
}

// GetEnv returns environment metadata by ID.
func (l *FolderLookup) GetEnv(id uuid.UUID) (*FolderEnv, bool) {
	env, ok := l.envs[id]
	return env, ok
}

// GetEnvBySlug returns environment metadata by slug.
func (l *FolderLookup) GetEnvBySlug(slug string) (*FolderEnv, bool) {
	env, ok := l.envsBySlug[slug]
	return env, ok
}

// GetSubTreeByPathEnvSlug resolves envSlug + path to a node and returns it along
// with all its descendants in depth-first pre-order (parent before children).
func (l *FolderLookup) GetSubTreeByPathEnvSlug(envSlug, path string) ([]*FolderNode, bool) {
	node, ok := l.GetByPathEnvSlug(envSlug, path)
	if !ok {
		return nil, false
	}
	return collectTree(node), true
}

// GetSubTreeByPathEnvID resolves envID + path to a node and returns it along
// with all its descendants in depth-first pre-order.
func (l *FolderLookup) GetSubTreeByPathEnvID(envID uuid.UUID, path string) ([]*FolderNode, bool) {
	node, ok := l.GetByPathEnvID(envID, path)
	if !ok {
		return nil, false
	}
	return collectTree(node), true
}

func collectTree(root *FolderNode) []*FolderNode {
	var result []*FolderNode
	stack := []*FolderNode{root}

	for len(stack) > 0 {
		node := stack[len(stack)-1]
		stack = stack[:len(stack)-1]

		result = append(result, node)

		// Sort children by name, then push in reverse so that
		// alphabetically first child is popped first (DFS pre-order).
		names := make([]string, 0, len(node.children))
		for name := range node.children {
			names = append(names, name)
		}
		sort.Sort(sort.Reverse(sort.StringSlice(names)))

		for _, name := range names {
			stack = append(stack, node.children[name])
		}
	}

	return result
}

func walkPath(root *FolderNode, path string) (*FolderNode, bool) {
	segments := splitPath(path)
	node := root
	for _, seg := range segments {
		child, ok := node.children[seg]
		if !ok {
			return nil, false
		}
		node = child
	}
	return node, true
}

func splitPath(p string) []string {
	trimmed := strings.Trim(p, "/")
	if trimmed == "" {
		return nil
	}
	return strings.Split(trimmed, "/")
}
