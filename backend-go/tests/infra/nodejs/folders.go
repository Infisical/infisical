//go:build integration

package nodejs

// CreateFolderRequest is the request body for POST /api/v2/folders.
type CreateFolderRequest struct {
	ProjectID   string `json:"projectId"`
	Environment string `json:"environment"`
	Path        string `json:"path"`
	Name        string `json:"name"`
}

// CreateFolderResponse is the response from POST /api/v2/folders.
type CreateFolderResponse struct {
	Folder struct {
		ID string `json:"id"`
	} `json:"folder"`
}

// FolderSeed contains metadata for a folder created via the Node.js API.
type FolderSeed struct {
	ID   string
	Name string
}

// FoldersAPI groups folder endpoints.
type FoldersAPI struct{ apiBase }

// Create makes a folder named name under parentPath.
func (a FoldersAPI) Create(projectID, environment, parentPath, name string) *FolderSeed {
	a.t.Helper()

	var resp CreateFolderResponse
	r, err := a.svc.client.R().
		SetAuthToken(a.svc.identityToken).
		SetBody(CreateFolderRequest{ProjectID: projectID, Environment: environment, Path: parentPath, Name: name}).
		SetResult(&resp).
		Post("/api/v2/folders")
	a.check("Folders.Create", r, err)

	return &FolderSeed{ID: resp.Folder.ID, Name: name}
}
