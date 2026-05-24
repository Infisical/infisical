package api

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Test Types ---

type CreateUserRequest struct {
	Name  string
	Email string
}

func (r *CreateUserRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"name":  String(&r.Name).Required().MinLength(1).MaxLength(100),
		"email": String(&r.Email).Required().Email(),
	}).Title("CreateUserRequest")
}

type UserResponse struct {
	ID    string
	Name  string
	Email string
}

func (r *UserResponse) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"id":    String(&r.ID).Required().UUID(),
		"name":  String(&r.Name).Required(),
		"email": String(&r.Email).Required().Email(),
	}).Title("UserResponse")
}

type ErrorResponse struct {
	Code    string
	Message string
}

func (r *ErrorResponse) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"code":    String(&r.Code).Required(),
		"message": String(&r.Message).Required(),
	}).Title("ErrorResponse")
}

// --- OpenAPISpec Tests ---

func TestNewOpenAPISpec(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	require.NotNil(t, spec)

	// Should default to 3.0.3
	assert.Equal(t, "3.0.3", spec.config.OpenAPIVersion)
}

func TestOpenAPISpec_CustomVersion(t *testing.T) {
	config := &OpenAPIConfig{
		OpenAPIVersion: "3.1.0",
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	assert.Equal(t, "3.1.0", spec.config.OpenAPIVersion)
}

func TestOpenAPISpec_Generate_Basic(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:       "Test API",
			Description: "A test API",
			Version:     "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	result := spec.Generate()

	assert.Equal(t, "3.0.3", result["openapi"])

	info := result["info"].(map[string]any)
	assert.Equal(t, "Test API", info["title"])
	assert.Equal(t, "A test API", info["description"])
	assert.Equal(t, "1.0.0", info["version"])
}

func TestOpenAPISpec_Generate_FullInfo(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:          "Full API",
			Description:    "Complete API info",
			Version:        "2.0.0",
			TermsOfService: "https://example.com/tos",
			Contact: &OpenAPIContact{
				Name:  "API Support",
				URL:   "https://example.com/support",
				Email: "support@example.com",
			},
			License: &OpenAPILicense{
				Name: "MIT",
				URL:  "https://opensource.org/licenses/MIT",
			},
		},
	}

	spec := NewOpenAPISpec(config)
	result := spec.Generate()

	info := result["info"].(map[string]any)
	assert.Equal(t, "https://example.com/tos", info["termsOfService"])

	contact := info["contact"].(map[string]any)
	assert.Equal(t, "API Support", contact["name"])
	assert.Equal(t, "https://example.com/support", contact["url"])
	assert.Equal(t, "support@example.com", contact["email"])

	license := info["license"].(map[string]any)
	assert.Equal(t, "MIT", license["name"])
	assert.Equal(t, "https://opensource.org/licenses/MIT", license["url"])
}

func TestOpenAPISpec_Generate_Servers(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
		Servers: []Server{
			{
				URL:         "https://api.example.com",
				Description: "Production",
			},
			{
				URL:         "https://staging-api.example.com",
				Description: "Staging",
			},
		},
	}

	spec := NewOpenAPISpec(config)
	result := spec.Generate()

	servers := result["servers"].([]map[string]any)
	require.Len(t, servers, 2)

	assert.Equal(t, "https://api.example.com", servers[0]["url"])
	assert.Equal(t, "Production", servers[0]["description"])
}

func TestOpenAPISpec_Generate_ServerVariables(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
		Servers: []Server{
			{
				URL:         "https://{environment}.example.com",
				Description: "Multi-env server",
				Variables: map[string]ServerVariable{
					"environment": {
						Default:     "api",
						Enum:        []string{"api", "staging", "dev"},
						Description: "Environment",
					},
				},
			},
		},
	}

	spec := NewOpenAPISpec(config)
	result := spec.Generate()

	servers := result["servers"].([]map[string]any)
	vars := servers[0]["variables"].(map[string]any)
	envVar := vars["environment"].(map[string]any)

	assert.Equal(t, "api", envVar["default"])
	assert.Equal(t, []string{"api", "staging", "dev"}, envVar["enum"])
	assert.Equal(t, "Environment", envVar["description"])
}

func TestOpenAPISpec_Generate_Paths(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	spec.AddEndpoints([]Endpoint{
		{
			Method:      http.MethodGet,
			Pattern:     "/users",
			Handler:     nil,
			Summary:     "List users",
			Description: "Returns all users",
			Tags:        []string{"Users"},
			OperationID: "listUsers",
			Response:    &UserResponse{},
		},
		{
			Method:      http.MethodPost,
			Pattern:     "/users",
			Handler:     nil,
			Summary:     "Create user",
			Tags:        []string{"Users"},
			OperationID: "createUser",
			Request:     &CreateUserRequest{},
			Response:    &UserResponse{},
		},
	})

	result := spec.Generate()

	paths := result["paths"].(map[string]any)
	usersPath := paths["/users"].(map[string]any)

	// GET /users
	getOp := usersPath["get"].(map[string]any)
	assert.Equal(t, "List users", getOp["summary"])
	assert.Equal(t, "Returns all users", getOp["description"])
	assert.Equal(t, []string{"Users"}, getOp["tags"])
	assert.Equal(t, "listUsers", getOp["operationId"])

	// POST /users
	postOp := usersPath["post"].(map[string]any)
	assert.Equal(t, "Create user", postOp["summary"])
	assert.NotNil(t, postOp["requestBody"])
}

func TestOpenAPISpec_Generate_PathParameters(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	spec.AddEndpoints([]Endpoint{
		{
			Method:  http.MethodGet,
			Pattern: "/users/{userId}/posts/{postId}",
			Handler: nil,
			PathParams: map[string]Schema{
				"userId": String(new(string)).UUID().Description("User ID"),
				"postId": Int(new(int)).Min(1).Description("Post ID"),
			},
		},
	})

	result := spec.Generate()

	paths := result["paths"].(map[string]any)
	path := paths["/users/{userId}/posts/{postId}"].(map[string]any)
	getOp := path["get"].(map[string]any)
	params := getOp["parameters"].([]map[string]any)

	require.Len(t, params, 2)

	// First param should be userId (extracted from path order)
	userIdParam := findParamByName(params, "userId")
	require.NotNil(t, userIdParam)
	assert.Equal(t, "path", userIdParam["in"])
	assert.Equal(t, true, userIdParam["required"])

	postIdParam := findParamByName(params, "postId")
	require.NotNil(t, postIdParam)
	assert.Equal(t, "path", postIdParam["in"])
}

func findParamByName(params []map[string]any, name string) map[string]any {
	for _, p := range params {
		if p["name"] == name {
			return p
		}
	}
	return nil
}

func TestOpenAPISpec_Generate_QueryParameters(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	spec.AddEndpoints([]Endpoint{
		{
			Method:  http.MethodGet,
			Pattern: "/search",
			Handler: nil,
			QueryParams: map[string]Schema{
				"q":      String(new(string)).Required().MinLength(1),
				"limit":  Int(new(int)).Optional().Min(1).Max(100),
				"offset": Int(new(int)).Optional().Min(0),
			},
		},
	})

	result := spec.Generate()

	paths := result["paths"].(map[string]any)
	searchPath := paths["/search"].(map[string]any)
	getOp := searchPath["get"].(map[string]any)
	params := getOp["parameters"].([]map[string]any)

	require.Len(t, params, 3)

	qParam := findParamByName(params, "q")
	require.NotNil(t, qParam)
	assert.Equal(t, "query", qParam["in"])
	assert.Equal(t, true, qParam["required"])

	limitParam := findParamByName(params, "limit")
	require.NotNil(t, limitParam)
	assert.Equal(t, "query", limitParam["in"])
	_, hasRequired := limitParam["required"]
	assert.False(t, hasRequired) // Optional param shouldn't have required field
}

func TestOpenAPISpec_Generate_HeaderParameters(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	spec.AddEndpoints([]Endpoint{
		{
			Method:  http.MethodGet,
			Pattern: "/test",
			Handler: nil,
			HeaderParams: map[string]Schema{
				"X-Request-ID": String(new(string)).Required().UUID(),
			},
		},
	})

	result := spec.Generate()

	paths := result["paths"].(map[string]any)
	testPath := paths["/test"].(map[string]any)
	getOp := testPath["get"].(map[string]any)
	params := getOp["parameters"].([]map[string]any)

	require.Len(t, params, 1)
	assert.Equal(t, "X-Request-ID", params[0]["name"])
	assert.Equal(t, "header", params[0]["in"])
	assert.Equal(t, true, params[0]["required"])
}

func TestOpenAPISpec_Generate_CookieParameters(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	spec.AddEndpoints([]Endpoint{
		{
			Method:  http.MethodGet,
			Pattern: "/test",
			Handler: nil,
			CookieParams: map[string]Schema{
				"session": String(new(string)).Required(),
			},
		},
	})

	result := spec.Generate()

	paths := result["paths"].(map[string]any)
	testPath := paths["/test"].(map[string]any)
	getOp := testPath["get"].(map[string]any)
	params := getOp["parameters"].([]map[string]any)

	require.Len(t, params, 1)
	assert.Equal(t, "session", params[0]["name"])
	assert.Equal(t, "cookie", params[0]["in"])
}

func TestOpenAPISpec_Generate_RequestBody(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	spec.AddEndpoints([]Endpoint{
		{
			Method:  http.MethodPost,
			Pattern: "/users",
			Handler: nil,
			Request: &CreateUserRequest{},
		},
	})

	result := spec.Generate()

	paths := result["paths"].(map[string]any)
	usersPath := paths["/users"].(map[string]any)
	postOp := usersPath["post"].(map[string]any)
	reqBody := postOp["requestBody"].(map[string]any)

	assert.Equal(t, true, reqBody["required"])

	content := reqBody["content"].(map[string]any)
	jsonContent := content["application/json"].(map[string]any)
	schema := jsonContent["schema"].(map[string]any)

	assert.Equal(t, "object", schema["type"])
	assert.Equal(t, "CreateUserRequest", schema["title"])
}

func TestOpenAPISpec_Generate_Responses(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	spec.AddEndpoints([]Endpoint{
		{
			Method:   http.MethodGet,
			Pattern:  "/users",
			Handler:  nil,
			Response: &UserResponse{},
		},
	})

	result := spec.Generate()

	paths := result["paths"].(map[string]any)
	usersPath := paths["/users"].(map[string]any)
	getOp := usersPath["get"].(map[string]any)
	responses := getOp["responses"].(map[string]any)

	resp200 := responses["200"].(map[string]any)
	content := resp200["content"].(map[string]any)
	jsonContent := content["application/json"].(map[string]any)
	schema := jsonContent["schema"].(map[string]any)

	assert.Equal(t, "object", schema["type"])
	assert.Equal(t, "UserResponse", schema["title"])
}

func TestOpenAPISpec_Generate_MultipleResponses(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	spec.AddEndpoints([]Endpoint{
		{
			Method:  http.MethodPost,
			Pattern: "/users",
			Handler: nil,
			Request: &CreateUserRequest{},
			Responses: map[int]SchemaProvider{
				201: &UserResponse{},
				400: &ErrorResponse{},
			},
		},
	})

	result := spec.Generate()

	paths := result["paths"].(map[string]any)
	usersPath := paths["/users"].(map[string]any)
	postOp := usersPath["post"].(map[string]any)
	responses := postOp["responses"].(map[string]any)

	assert.Contains(t, responses, "201")
	assert.Contains(t, responses, "400")
}

func TestOpenAPISpec_Generate_SecuritySchemes(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
		SecuritySchemes: map[string]*SecurityScheme{
			"jwt":     HTTPBearerJWT().WithDescription("JWT authentication"),
			"api_key": APIKeyHeader("X-API-Key").WithDescription("API key authentication"),
		},
	}

	spec := NewOpenAPISpec(config)
	result := spec.Generate()

	components := result["components"].(map[string]any)
	secSchemes := components["securitySchemes"].(map[string]any)

	jwtScheme := secSchemes["jwt"].(map[string]any)
	assert.Equal(t, "http", jwtScheme["type"])
	assert.Equal(t, "bearer", jwtScheme["scheme"])
	assert.Equal(t, "JWT", jwtScheme["bearerFormat"])

	apiKeyScheme := secSchemes["api_key"].(map[string]any)
	assert.Equal(t, "apiKey", apiKeyScheme["type"])
	assert.Equal(t, "header", apiKeyScheme["in"])
	assert.Equal(t, "X-API-Key", apiKeyScheme["name"])
}

func TestOpenAPISpec_Generate_EndpointSecurity(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
		SecuritySchemes: map[string]*SecurityScheme{
			"jwt": HTTPBearerJWT().WithDescription("JWT"),
		},
	}

	spec := NewOpenAPISpec(config)
	spec.AddEndpoints([]Endpoint{
		{
			Method:   http.MethodGet,
			Pattern:  "/protected",
			Handler:  nil,
			Security: []Security{NewSecurity("jwt")},
		},
	})

	result := spec.Generate()

	paths := result["paths"].(map[string]any)
	protectedPath := paths["/protected"].(map[string]any)
	getOp := protectedPath["get"].(map[string]any)
	security := getOp["security"].([]map[string][]string)

	require.Len(t, security, 1)
	assert.Contains(t, security[0], "jwt")
}

func TestOpenAPISpec_Generate_GlobalSecurity(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
		Security: []Security{
			NewSecurity("jwt"),
		},
	}

	spec := NewOpenAPISpec(config)
	result := spec.Generate()

	security := result["security"].([]map[string][]string)
	require.Len(t, security, 1)
	assert.Contains(t, security[0], "jwt")
}

func TestOpenAPISpec_Generate_Tags(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
		Tags: []OpenAPITag{
			{
				Name:        "Users",
				Description: "User management endpoints",
			},
			{
				Name:        "Admin",
				Description: "Admin endpoints",
				ExternalDocs: &OpenAPIExternalDocs{
					Description: "Admin guide",
					URL:         "https://example.com/admin",
				},
			},
		},
	}

	spec := NewOpenAPISpec(config)
	result := spec.Generate()

	tags := result["tags"].([]map[string]any)
	require.Len(t, tags, 2)

	assert.Equal(t, "Users", tags[0]["name"])
	assert.Equal(t, "User management endpoints", tags[0]["description"])

	assert.Equal(t, "Admin", tags[1]["name"])
	extDocs := tags[1]["externalDocs"].(map[string]any)
	assert.Equal(t, "https://example.com/admin", extDocs["url"])
}

func TestOpenAPISpec_Generate_ExternalDocs(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
		ExternalDocs: &OpenAPIExternalDocs{
			Description: "Full documentation",
			URL:         "https://docs.example.com",
		},
	}

	spec := NewOpenAPISpec(config)
	result := spec.Generate()

	extDocs := result["externalDocs"].(map[string]any)
	assert.Equal(t, "Full documentation", extDocs["description"])
	assert.Equal(t, "https://docs.example.com", extDocs["url"])
}

func TestOpenAPISpec_Generate_Extensions(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
		Extensions: map[string]any{
			"x-custom":    "value",
			"x-generator": "api-framework",
		},
	}

	spec := NewOpenAPISpec(config)
	result := spec.Generate()

	assert.Equal(t, "value", result["x-custom"])
	assert.Equal(t, "api-framework", result["x-generator"])
}

func TestOpenAPISpec_Generate_DeprecatedEndpoint(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	spec.AddEndpoints([]Endpoint{
		{
			Method:     http.MethodGet,
			Pattern:    "/old",
			Handler:    nil,
			Deprecated: true,
		},
	})

	result := spec.Generate()

	paths := result["paths"].(map[string]any)
	oldPath := paths["/old"].(map[string]any)
	getOp := oldPath["get"].(map[string]any)

	assert.Equal(t, true, getOp["deprecated"])
}

func TestOpenAPISpec_Generate_EndpointExternalDocs(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	spec.AddEndpoints([]Endpoint{
		{
			Method:           http.MethodGet,
			Pattern:          "/complex",
			Handler:          nil,
			ExternalDocsURL:  "https://docs.example.com/complex",
			ExternalDocsDesc: "Detailed documentation",
		},
	})

	result := spec.Generate()

	paths := result["paths"].(map[string]any)
	path := paths["/complex"].(map[string]any)
	getOp := path["get"].(map[string]any)
	extDocs := getOp["externalDocs"].(map[string]any)

	assert.Equal(t, "https://docs.example.com/complex", extDocs["url"])
	assert.Equal(t, "Detailed documentation", extDocs["description"])
}

func TestOpenAPISpec_Generate_EndpointServers(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	spec.AddEndpoints([]Endpoint{
		{
			Method:  http.MethodGet,
			Pattern: "/special",
			Handler: nil,
			Servers: []Server{
				{
					URL:         "https://special.example.com",
					Description: "Special server",
				},
			},
		},
	})

	result := spec.Generate()

	paths := result["paths"].(map[string]any)
	path := paths["/special"].(map[string]any)
	getOp := path["get"].(map[string]any)
	servers := getOp["servers"].([]map[string]any)

	require.Len(t, servers, 1)
	assert.Equal(t, "https://special.example.com", servers[0]["url"])
}

func TestOpenAPISpec_Generate_EndpointCallbacks(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	spec.AddEndpoints([]Endpoint{
		{
			Method:  http.MethodPost,
			Pattern: "/webhooks",
			Handler: nil,
			Callbacks: map[string]any{
				"onEvent": map[string]any{
					"{$request.body#/callbackUrl}": map[string]any{
						"post": map[string]any{
							"summary": "Event callback",
						},
					},
				},
			},
		},
	})

	result := spec.Generate()

	paths := result["paths"].(map[string]any)
	path := paths["/webhooks"].(map[string]any)
	postOp := path["post"].(map[string]any)

	assert.NotNil(t, postOp["callbacks"])
}

func TestOpenAPISpec_Generate_EndpointExtensions(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	spec.AddEndpoints([]Endpoint{
		{
			Method:  http.MethodGet,
			Pattern: "/custom",
			Handler: nil,
			Extensions: map[string]any{
				"x-custom-field": "custom-value",
			},
		},
	})

	result := spec.Generate()

	paths := result["paths"].(map[string]any)
	path := paths["/custom"].(map[string]any)
	getOp := path["get"].(map[string]any)

	assert.Equal(t, "custom-value", getOp["x-custom-field"])
}

func TestOpenAPISpec_AddSchema(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	spec.AddSchema("User", &UserResponse{})
	spec.AddSchema("Error", &ErrorResponse{})

	result := spec.Generate()

	components := result["components"].(map[string]any)
	schemas := components["schemas"].(map[string]any)

	assert.Contains(t, schemas, "User")
	assert.Contains(t, schemas, "Error")

	userSchema := schemas["User"].(map[string]any)
	assert.Equal(t, "object", userSchema["type"])
}

func TestOpenAPISpec_JSON(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	jsonBytes, err := spec.JSON()

	require.NoError(t, err)
	assert.NotEmpty(t, jsonBytes)

	// Verify it's valid JSON
	var parsed map[string]any
	err = json.Unmarshal(jsonBytes, &parsed)
	require.NoError(t, err)

	assert.Equal(t, "Test API", parsed["info"].(map[string]any)["title"])
}

func TestOpenAPISpec_JSONIndent(t *testing.T) {
	config := &OpenAPIConfig{
		Info: OpenAPIInfo{
			Title:   "Test API",
			Version: "1.0.0",
		},
	}

	spec := NewOpenAPISpec(config)
	jsonBytes, err := spec.JSONIndent("", "  ")

	require.NoError(t, err)
	assert.Contains(t, string(jsonBytes), "\n")
	assert.Contains(t, string(jsonBytes), "  ")
}

// --- Endpoint Helper Tests ---

func TestEndpoint_ExtractPathParams(t *testing.T) {
	ep := Endpoint{
		Pattern: "/users/{userId}/posts/{postId}",
	}

	params := ep.ExtractPathParams()

	assert.Equal(t, []string{"userId", "postId"}, params)
}

func TestEndpoint_ExtractPathParams_NoParams(t *testing.T) {
	ep := Endpoint{
		Pattern: "/users",
	}

	params := ep.ExtractPathParams()

	assert.Empty(t, params)
}

func TestEndpoint_OpenAPIPath(t *testing.T) {
	ep := Endpoint{
		Pattern: "/users/{id}",
	}

	path := ep.OpenAPIPath()

	assert.Equal(t, "/users/{id}", path)
}

func TestEndpoint_RequiredSchemes(t *testing.T) {
	ep := Endpoint{
		Security: []Security{
			NewSecurity("jwt"),
			NewSecurity("api_key"),
		},
	}

	schemes := ep.RequiredSchemes()

	assert.Contains(t, schemes, "jwt")
	assert.Contains(t, schemes, "api_key")
	assert.Len(t, schemes, 2)
}

func TestEndpoint_RequiredSchemes_Empty(t *testing.T) {
	ep := Endpoint{}

	schemes := ep.RequiredSchemes()

	assert.Empty(t, schemes)
}

func TestEndpoint_RequiredSchemes_Dedup(t *testing.T) {
	ep := Endpoint{
		Security: []Security{
			NewSecurity("jwt"),
			NewSecurity("jwt"), // Duplicate
		},
	}

	schemes := ep.RequiredSchemes()

	assert.Len(t, schemes, 1)
	assert.Contains(t, schemes, "jwt")
}

// --- Response Description Tests ---

type emptyResponse struct{}

func (r *emptyResponse) Schema() *ObjectSchema { return Object(nil) }

func TestOpenAPI_ResponseDescriptions(t *testing.T) {
	spec := NewOpenAPISpec(&OpenAPIConfig{
		Info: OpenAPIInfo{Title: "Test", Version: "1.0"},
	})

	spec.AddEndpoints([]Endpoint{{
		Method:   http.MethodGet,
		Pattern:  "/test",
		Response: &emptyResponse{},
		Responses: map[int]SchemaProvider{
			200: &emptyResponse{},
			400: &emptyResponse{},
			404: &emptyResponse{},
			500: &emptyResponse{},
		},
		ResponseDescriptions: map[int]string{
			200: "Success - item returned",
			400: "Invalid request parameters",
		},
	}})

	generated := spec.Generate()
	paths := generated["paths"].(map[string]any)
	testPath := paths["/test"].(map[string]any)
	getOp := testPath["get"].(map[string]any)
	responses := getOp["responses"].(map[string]any)

	// Custom descriptions
	resp200 := responses["200"].(map[string]any)
	assert.Equal(t, "Success - item returned", resp200["description"])

	resp400 := responses["400"].(map[string]any)
	assert.Equal(t, "Invalid request parameters", resp400["description"])

	// Default descriptions
	resp404 := responses["404"].(map[string]any)
	assert.Equal(t, "Not found", resp404["description"])

	resp500 := responses["500"].(map[string]any)
	assert.Equal(t, "Internal server error", resp500["description"])
}

func TestOpenAPI_DefaultResponseDescriptions(t *testing.T) {
	tests := []struct {
		code     int
		expected string
	}{
		{200, "Successful response"},
		{201, "Created"},
		{204, "No content"},
		{400, "Bad request"},
		{401, "Unauthorized"},
		{403, "Forbidden"},
		{404, "Not found"},
		{409, "Conflict"},
		{422, "Validation error"},
		{500, "Internal server error"},
		{299, "Successful response"}, // 2xx fallback
		{499, "Client error"},        // 4xx fallback
		{599, "Server error"},        // 5xx fallback
	}

	for _, tt := range tests {
		t.Run(statusCodeToString(tt.code), func(t *testing.T) {
			result := defaultResponseDescription(tt.code)
			assert.Equal(t, tt.expected, result)
		})
	}
}

func TestEndpoint_ExtractPathParams_StripChiRegex(t *testing.T) {
	tests := []struct {
		pattern  string
		expected []string
	}{
		{"/users/{id}", []string{"id"}},
		{"/users/{id:[0-9]+}", []string{"id"}},
		{"/orgs/{orgId:[a-f0-9-]+}/projects/{projectId:[0-9]+}", []string{"orgId", "projectId"}},
		{"/v{version:[0-9]+}/api", []string{"version"}},
		{"/files/{path:.*}", []string{"path"}},
	}

	for _, tt := range tests {
		t.Run(tt.pattern, func(t *testing.T) {
			ep := Endpoint{Pattern: tt.pattern}
			params := ep.ExtractPathParams()
			assert.Equal(t, tt.expected, params)
		})
	}
}
