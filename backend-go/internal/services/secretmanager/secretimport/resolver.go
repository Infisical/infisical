package secretimport

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/infisical/api/internal/services/secretmanager/secretfolder"
)

const maxImportChainDepth = 10

type FolderLoader interface {
	LoadProjectFolders(ctx context.Context, projectID string, envIDs []uuid.UUID) (*secretfolder.FolderLookup, error)
}

type ChainResult struct {
	FolderLookup    *secretfolder.FolderLookup
	DirectFolderIDs []uuid.UUID
	DirectPaths     map[uuid.UUID]string
	Imports         []ResolvedImport
	UsedEnvIDs      []uuid.UUID
}

func (r *ChainResult) ImportedFolderIDs() []uuid.UUID {
	ids := make([]uuid.UUID, len(r.Imports))
	for i := range r.Imports {
		ids[i] = r.Imports[i].FolderID
	}
	return ids
}

func (r *ChainResult) AllFolderIDs() []uuid.UUID {
	all := make([]uuid.UUID, 0, len(r.DirectFolderIDs)+len(r.Imports))
	all = append(all, r.DirectFolderIDs...)
	all = append(all, r.ImportedFolderIDs()...)
	return all
}

type ChainResolver struct {
	importLookup *ImportLookup
	folderLoader FolderLoader
}

func NewChainResolver(importLookup *ImportLookup, folderLoader FolderLoader) *ChainResolver {
	return &ChainResolver{
		importLookup: importLookup,
		folderLoader: folderLoader,
	}
}

func (r *ChainResolver) Resolve(
	ctx context.Context,
	projectID string,
	startEnvID uuid.UUID,
	secretPath string,
	recursive bool,
) (*ChainResult, error) {
	loadedEnvs := make(map[uuid.UUID]bool)

	// Load folders for starting env
	folderLookup, err := r.folderLoader.LoadProjectFolders(ctx, projectID, []uuid.UUID{startEnvID})
	if err != nil {
		return nil, fmt.Errorf("failed to load folders for starting env: %w", err)
	}
	loadedEnvs[startEnvID] = true

	// Resolve direct folders
	var directFolderIDs []uuid.UUID
	directPaths := make(map[uuid.UUID]string)

	if recursive {
		nodes, ok := folderLookup.GetSubTree(startEnvID, secretPath)
		if !ok || len(nodes) == 0 {
			return nil, fmt.Errorf("folder not found: %s", secretPath)
		}
		for _, node := range nodes {
			directFolderIDs = append(directFolderIDs, node.ID)
			directPaths[node.ID] = node.GetPath()
		}
	} else {
		node, ok := folderLookup.GetByPath(startEnvID, secretPath)
		if !ok {
			return nil, fmt.Errorf("folder not found: %s", secretPath)
		}
		directFolderIDs = []uuid.UUID{node.ID}
		directPaths[node.ID] = secretPath
	}

	// Iteratively resolve import chain
	var allImports []ResolvedImport
	currentFolders := directFolderIDs
	visited := make(map[uuid.UUID]bool)

	for depth := 0; depth < maxImportChainDepth && len(currentFolders) > 0; depth++ {
		// Collect new envs needed from current folders' imports
		var newEnvIDs []uuid.UUID
		for _, folderID := range currentFolders {
			for _, imp := range r.importLookup.GetByFolderID(folderID) {
				if imp.IsReplication {
					continue
				}
				if !loadedEnvs[imp.ImportEnvID] {
					newEnvIDs = append(newEnvIDs, imp.ImportEnvID)
					loadedEnvs[imp.ImportEnvID] = true
				}
			}
		}

		// Load folders for new envs
		if len(newEnvIDs) > 0 {
			newLookup, err := r.folderLoader.LoadProjectFolders(ctx, projectID, newEnvIDs)
			if err != nil {
				return nil, fmt.Errorf("failed to load folders for imported envs: %w", err)
			}
			folderLookup.Merge(newLookup)
		}

		// Resolve imports to folder IDs
		var nextFolders []uuid.UUID
		for _, folderID := range currentFolders {
			for _, imp := range r.importLookup.GetByFolderID(folderID) {
				if imp.IsReplication {
					continue
				}

				targetNode, ok := folderLookup.GetByPath(imp.ImportEnvID, imp.ImportPath)
				if !ok {
					continue
				}

				if visited[targetNode.ID] {
					continue
				}
				visited[targetNode.ID] = true

				allImports = append(allImports, ResolvedImport{
					FolderID: targetNode.ID,
					EnvID:    imp.ImportEnvID,
					Path:     imp.ImportPath,
					Import:   imp,
				})
				nextFolders = append(nextFolders, targetNode.ID)
			}
		}

		currentFolders = nextFolders
	}

	// Collect all used env IDs
	usedEnvIDs := make([]uuid.UUID, 0, len(loadedEnvs))
	for envID := range loadedEnvs {
		usedEnvIDs = append(usedEnvIDs, envID)
	}

	return &ChainResult{
		FolderLookup:    folderLookup,
		DirectFolderIDs: directFolderIDs,
		DirectPaths:     directPaths,
		Imports:         allImports,
		UsedEnvIDs:      usedEnvIDs,
	}, nil
}
