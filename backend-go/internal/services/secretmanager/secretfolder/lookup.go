package secretfolder

import (
	"maps"
	"sort"
	"strings"

	"github.com/google/uuid"
)

// FolderNode is a single folder in the tree.
type FolderNode struct {
	ID       uuid.UUID
	Name     string
	parent   *FolderNode
	children map[string]*FolderNode // nil on leaf nodes
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

// FolderLookup is an in-memory folder tree for a project, scoped to requested environments.
type FolderLookup struct {
	byID     map[uuid.UUID]*FolderNode
	envRoots map[uuid.UUID]*FolderNode // envID → root
	envSlugs map[uuid.UUID]string      // envID → slug
}

func newFolderLookup(rows []folderRow) *FolderLookup {
	l := &FolderLookup{
		byID:     make(map[uuid.UUID]*FolderNode, len(rows)),
		envRoots: make(map[uuid.UUID]*FolderNode),
		envSlugs: make(map[uuid.UUID]string),
	}

	// Pass 1: create all nodes.
	for _, r := range rows {
		l.byID[r.ID] = &FolderNode{
			ID:   r.ID,
			Name: r.Name,
		}
	}

	// Pass 2: link parent ↔ children, identify roots, collect env slugs.
	for _, r := range rows {
		node := l.byID[r.ID]
		if !r.ParentID.Valid {
			l.envRoots[r.EnvID] = node
			l.envSlugs[r.EnvID] = r.EnvSlug
			continue
		}
		if p, ok := l.byID[r.ParentID.V]; ok {
			node.parent = p
			if p.children == nil {
				p.children = make(map[string]*FolderNode, 4)
			}
			p.children[node.Name] = node
		}
	}

	return l
}

// GetByPath resolves envID + path (e.g. "/hello/world") to a node.
func (l *FolderLookup) GetByPath(envID uuid.UUID, path string) (*FolderNode, bool) {
	root, ok := l.envRoots[envID]
	if !ok {
		return nil, false
	}
	return walkPath(root, path)
}

// GetByID returns the node for the given folder ID.
func (l *FolderLookup) GetByID(folderID uuid.UUID) (*FolderNode, bool) {
	node, ok := l.byID[folderID]
	return node, ok
}

// GetPathByID returns the full path for a folder ID.
func (l *FolderLookup) GetPathByID(id uuid.UUID) (string, bool) {
	node, ok := l.byID[id]
	if !ok {
		return "", false
	}
	return node.GetPath(), true
}

// GetSubTree resolves envID + path to a node and returns it along
// with all its descendants in depth-first pre-order (parent before children).
func (l *FolderLookup) GetSubTree(envID uuid.UUID, path string) ([]*FolderNode, bool) {
	node, ok := l.GetByPath(envID, path)
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

// Merge combines another FolderLookup into this one.
// Used to add folders from additional environments after initial load.
func (l *FolderLookup) Merge(other *FolderLookup) {
	maps.Copy(l.byID, other.byID)
	maps.Copy(l.envRoots, other.envRoots)
	maps.Copy(l.envSlugs, other.envSlugs)
}

// GetEnvSlug returns the slug for the given environment ID.
func (l *FolderLookup) GetEnvSlug(envID uuid.UUID) (string, bool) {
	slug, ok := l.envSlugs[envID]
	return slug, ok
}

// GetEnvIDBySlug returns the environment ID for the given slug.
func (l *FolderLookup) GetEnvIDBySlug(slug string) (uuid.UUID, bool) {
	for id, s := range l.envSlugs {
		if s == slug {
			return id, true
		}
	}
	return uuid.UUID{}, false
}

// HasEnv reports whether folders for the given environment have been loaded.
func (l *FolderLookup) HasEnv(envID uuid.UUID) bool {
	_, ok := l.envRoots[envID]
	return ok
}
