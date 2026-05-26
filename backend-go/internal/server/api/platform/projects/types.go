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
	Message chita.Required[string] `json:"message"`
}

// Schema returns the OpenAPI schema for GetHealthResponse.
func (r *GetHealthResponse) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"message": chita.Str(&r.Message).Description("Health check message"),
	})
}

// --- CreateProject ---

// CreateProjectRequest is the request type for creating a project.
type CreateProjectRequest struct {
	Name  chita.Required[string] `json:"name"`
	OrgID chita.Required[string] `json:"orgId"`
}

// Schema returns the validation and OpenAPI schema for CreateProjectRequest.
func (r *CreateProjectRequest) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"name":  chita.Str(&r.Name).From(chita.SourceBody).MinLength(1).Description("Project name"),
		"orgId": chita.Str(&r.OrgID).From(chita.SourceBody).Description("Organization ID"),
	})
}

// CreateProjectResponse is the response type for creating a project.
type CreateProjectResponse struct {
	chita.StatusCreated
	ID    chita.Required[string] `json:"id"`
	Name  chita.Required[string] `json:"name"`
	OrgID chita.Required[string] `json:"orgId"`
}

// Schema returns the OpenAPI schema for CreateProjectResponse.
func (r *CreateProjectResponse) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"id":    chita.Str(&r.ID).Description("Project ID"),
		"name":  chita.Str(&r.Name).Description("Project name"),
		"orgId": chita.Str(&r.OrgID).Description("Organization ID"),
	})
}
