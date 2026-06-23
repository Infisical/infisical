//go:build integration

package nodejs

// SecretImportTarget specifies the source for a secret import.
type SecretImportTarget struct {
	Environment string `json:"environment"`
	Path        string `json:"path"`
}

// CreateSecretImportRequest is the request body for POST /api/v2/secret-imports.
type CreateSecretImportRequest struct {
	ProjectID     string             `json:"projectId"`
	Environment   string             `json:"environment"`
	Path          string             `json:"path"`
	Import        SecretImportTarget `json:"import"`
	IsReplication bool               `json:"isReplication,omitempty"`
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

// Create starts an import of secrets from (importEnv, importPath) into
// (environment, path). Call Replication for a replicated import (requires the
// secretApproval EE feature; secrets are copied asynchronously into a reserved
// folder).
func (a ImportsAPI) Create(projectID, environment, path, importEnv, importPath string) *createImportBuilder {
	return &createImportBuilder{
		a: a,
		req: CreateSecretImportRequest{
			ProjectID:   projectID,
			Environment: environment,
			Path:        path,
			Import:      SecretImportTarget{Environment: importEnv, Path: importPath},
		},
	}
}

type createImportBuilder struct {
	a   ImportsAPI
	req CreateSecretImportRequest
}

// Replication marks the import as a replication import.
func (b *createImportBuilder) Replication() *createImportBuilder {
	b.req.IsReplication = true
	return b
}

// Do creates the import and returns its seed.
func (b *createImportBuilder) Do() *SecretImportSeed {
	b.a.t.Helper()

	var resp CreateSecretImportResponse
	r, err := b.a.svc.client.R().
		SetAuthToken(b.a.svc.identityToken).
		SetBody(b.req).
		SetResult(&resp).
		Post("/api/v2/secret-imports")
	b.a.check("Imports.Create", r, err)

	return &SecretImportSeed{ID: resp.SecretImport.ID}
}
