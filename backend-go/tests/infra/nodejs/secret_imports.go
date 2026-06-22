//go:build integration

package nodejs

// SecretImportTarget specifies the source for a secret import.
type SecretImportTarget struct {
	Environment string `json:"environment"`
	Path        string `json:"path"`
}

// CreateSecretImportRequest is the request body for POST /api/v2/secret-imports.
type CreateSecretImportRequest struct {
	ProjectID   string             `json:"projectId"`
	Environment string             `json:"environment"`
	Path        string             `json:"path"`
	Import      SecretImportTarget `json:"import"`
}

// CreateSecretImportResponse is the response from POST /api/v2/secret-imports.
type CreateSecretImportResponse struct {
	SecretImport struct {
		ID string `json:"id"`
	} `json:"secretImport"`
}

// SecretImportSeed contains metadata for a secret import created via the Node.js API.
type SecretImportSeed struct {
	ID string
}

// ImportsAPI groups secret-import endpoints.
type ImportsAPI struct{ apiBase }

// Create imports secrets from (importEnv, importPath) into (environment, path).
func (a ImportsAPI) Create(projectID, environment, path, importEnv, importPath string) *SecretImportSeed {
	a.t.Helper()

	var resp CreateSecretImportResponse
	r, err := a.svc.client.R().
		SetAuthToken(a.svc.identityToken).
		SetBody(CreateSecretImportRequest{
			ProjectID:   projectID,
			Environment: environment,
			Path:        path,
			Import:      SecretImportTarget{Environment: importEnv, Path: importPath},
		}).
		SetResult(&resp).
		Post("/api/v2/secret-imports")
	a.check("Imports.Create", r, err)

	return &SecretImportSeed{ID: resp.SecretImport.ID}
}
