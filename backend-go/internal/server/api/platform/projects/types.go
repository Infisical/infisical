package projects

import "github.com/infisical/api/pkg/chita"

// --- GetHealth ---

// GetHealthRequest is the request type for the health check endpoint.
type GetHealthRequest struct{}

// Schema returns the OpenAPI schema for GetHealthRequest.
func (r *GetHealthRequest) Schema() *chita.ObjectSchema {
	return chita.Object(nil)
}

// GetHealthResponse is the response type for the health check endpoint.
type GetHealthResponse struct {
	chita.StatusOK
	Message string `json:"message"`
}

// Schema returns the OpenAPI schema for GetHealthResponse.
func (r *GetHealthResponse) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"message": chita.String(&r.Message).Required().Description("Health check message"),
	})
}

// --- CreateProject ---

// CreateProjectRequest is the request type for creating a project.
type CreateProjectRequest struct {
	Name  string `json:"name"`
	OrgID string `json:"orgId"`
}

// Schema returns the validation and OpenAPI schema for CreateProjectRequest.
func (r *CreateProjectRequest) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"name":  chita.String(&r.Name).From(chita.SourceBody).Required().MinLength(1).Description("Project name"),
		"orgId": chita.String(&r.OrgID).From(chita.SourceBody).Required().Description("Organization ID"),
	})
}

// CreateProjectResponse is the response type for creating a project.
type CreateProjectResponse struct {
	chita.StatusCreated
	ID    string `json:"id"`
	Name  string `json:"name"`
	OrgID string `json:"orgId"`
}

// Schema returns the OpenAPI schema for CreateProjectResponse.
func (r *CreateProjectResponse) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"id":    chita.String(&r.ID).Required().Description("Project ID"),
		"name":  chita.String(&r.Name).Required().Description("Project name"),
		"orgId": chita.String(&r.OrgID).Required().Description("Organization ID"),
	})
}
