package chita

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// =============================================================================
// Shared test types
// =============================================================================

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

type emptyResponse struct{}

func (r *emptyResponse) Schema() *ObjectSchema { return Object(nil) }

// schemaProviderWrapper wraps a raw *ObjectSchema as a SchemaProvider.
type schemaProviderWrapper struct {
	schema *ObjectSchema
}

func (w *schemaProviderWrapper) Schema() *ObjectSchema { return w.schema }

// =============================================================================
// Helpers
// =============================================================================

// minimalConfig returns a baseline OpenAPIConfig with required Info fields set.
func minimalConfig() *OpenAPIConfig {
	return &OpenAPIConfig{
		Info: OpenAPIInfo{Title: "Test API", Version: "1.0.0"},
	}
}

// generate builds a spec from config + endpoints and returns the Generate() output.
func generate(t *testing.T, config *OpenAPIConfig, endpoints ...Endpoint) map[string]any {
	t.Helper()
	spec := NewOpenAPISpec(config)
	if len(endpoints) > 0 {
		spec.AddEndpoints(endpoints)
	}
	return spec.Generate()
}

// pathOp drills into result["paths"][pattern][method] and returns the operation map.
func pathOp(t *testing.T, result map[string]any, pattern, method string) map[string]any {
	t.Helper()
	paths, ok := result["paths"].(map[string]any)
	require.True(t, ok, "missing paths")
	pathItem, ok := paths[pattern].(map[string]any)
	require.True(t, ok, "missing path %q", pattern)
	op, ok := pathItem[method].(map[string]any)
	require.True(t, ok, "missing %s on %q", method, pattern)
	return op
}

func findParamBySource(params []map[string]any, name, in string) map[string]any {
	for _, p := range params {
		if p["name"] == name && p["in"] == in {
			return p
		}
	}
	return nil
}

// =============================================================================
// Spec construction / version
// =============================================================================

func TestNewOpenAPISpec_DefaultsAndOverride(t *testing.T) {
	t.Run("default version", func(t *testing.T) {
		spec := NewOpenAPISpec(minimalConfig())
		assert.Equal(t, "3.0.3", spec.config.OpenAPIVersion)
	})

	t.Run("explicit version", func(t *testing.T) {
		c := minimalConfig()
		c.OpenAPIVersion = "3.1.0"
		spec := NewOpenAPISpec(c)
		assert.Equal(t, "3.1.0", spec.config.OpenAPIVersion)
	})
}

// =============================================================================
// Config-level features (single table)
// =============================================================================

func TestOpenAPISpec_ConfigFeatures(t *testing.T) {
	tests := []struct {
		name   string
		mutate func(*OpenAPIConfig)
		verify func(t *testing.T, result map[string]any)
	}{
		{
			name: "basic info",
			mutate: func(c *OpenAPIConfig) {
				c.Info.Description = "A test API"
			},
			verify: func(t *testing.T, result map[string]any) {
				info := result["info"].(map[string]any)
				assert.Equal(t, "Test API", info["title"])
				assert.Equal(t, "A test API", info["description"])
				assert.Equal(t, "1.0.0", info["version"])
				assert.Equal(t, "3.0.3", result["openapi"])
			},
		},
		{
			name: "full info with contact + license + ToS",
			mutate: func(c *OpenAPIConfig) {
				c.Info.TermsOfService = "https://example.com/tos"
				c.Info.Contact = &OpenAPIContact{
					Name: "Support", URL: "https://example.com/support", Email: "s@example.com",
				}
				c.Info.License = &OpenAPILicense{Name: "MIT", URL: "https://mit.example.com"}
			},
			verify: func(t *testing.T, result map[string]any) {
				info := result["info"].(map[string]any)
				assert.Equal(t, "https://example.com/tos", info["termsOfService"])
				contact := info["contact"].(map[string]any)
				assert.Equal(t, "Support", contact["name"])
				assert.Equal(t, "s@example.com", contact["email"])
				license := info["license"].(map[string]any)
				assert.Equal(t, "MIT", license["name"])
			},
		},
		{
			name: "servers list",
			mutate: func(c *OpenAPIConfig) {
				c.Servers = []Server{
					{URL: "https://api.example.com", Description: "Production"},
					{URL: "https://staging-api.example.com", Description: "Staging"},
				}
			},
			verify: func(t *testing.T, result map[string]any) {
				servers := result["servers"].([]map[string]any)
				require.Len(t, servers, 2)
				assert.Equal(t, "https://api.example.com", servers[0]["url"])
				assert.Equal(t, "Production", servers[0]["description"])
			},
		},
		{
			name: "server variables",
			mutate: func(c *OpenAPIConfig) {
				c.Servers = []Server{{
					URL:         "https://{environment}.example.com",
					Description: "Multi-env",
					Variables: map[string]ServerVariable{
						"environment": {
							Default: "api", Enum: []string{"api", "staging", "dev"}, Description: "Environment",
						},
					},
				}}
			},
			verify: func(t *testing.T, result map[string]any) {
				vars := result["servers"].([]map[string]any)[0]["variables"].(map[string]any)
				envVar := vars["environment"].(map[string]any)
				assert.Equal(t, "api", envVar["default"])
				assert.Equal(t, []string{"api", "staging", "dev"}, envVar["enum"])
				assert.Equal(t, "Environment", envVar["description"])
			},
		},
		{
			name: "security schemes",
			mutate: func(c *OpenAPIConfig) {
				c.SecuritySchemes = map[string]*SecurityScheme{
					"jwt":     HTTPBearerJWT().WithDescription("JWT auth"),
					"api_key": APIKeyHeader("X-API-Key").WithDescription("API key"),
				}
			},
			verify: func(t *testing.T, result map[string]any) {
				secSchemes := result["components"].(map[string]any)["securitySchemes"].(map[string]any)
				jwt := secSchemes["jwt"].(map[string]any)
				assert.Equal(t, "http", jwt["type"])
				assert.Equal(t, "JWT", jwt["bearerFormat"])
				ak := secSchemes["api_key"].(map[string]any)
				assert.Equal(t, "apiKey", ak["type"])
				assert.Equal(t, "X-API-Key", ak["name"])
			},
		},
		{
			name: "global security",
			mutate: func(c *OpenAPIConfig) {
				c.Security = []Security{NewSecurity("jwt")}
			},
			verify: func(t *testing.T, result map[string]any) {
				sec := result["security"].([]map[string][]string)
				require.Len(t, sec, 1)
				assert.Contains(t, sec[0], "jwt")
			},
		},
		{
			name: "tags with external docs",
			mutate: func(c *OpenAPIConfig) {
				c.Tags = []OpenAPITag{
					{Name: "Users", Description: "User mgmt"},
					{Name: "Admin", Description: "Admin", ExternalDocs: &OpenAPIExternalDocs{
						Description: "Admin guide", URL: "https://example.com/admin",
					}},
				}
			},
			verify: func(t *testing.T, result map[string]any) {
				tags := result["tags"].([]map[string]any)
				require.Len(t, tags, 2)
				assert.Equal(t, "Users", tags[0]["name"])
				adminDocs := tags[1]["externalDocs"].(map[string]any)
				assert.Equal(t, "https://example.com/admin", adminDocs["url"])
			},
		},
		{
			name: "external docs",
			mutate: func(c *OpenAPIConfig) {
				c.ExternalDocs = &OpenAPIExternalDocs{
					Description: "Full docs", URL: "https://docs.example.com",
				}
			},
			verify: func(t *testing.T, result map[string]any) {
				ed := result["externalDocs"].(map[string]any)
				assert.Equal(t, "Full docs", ed["description"])
				assert.Equal(t, "https://docs.example.com", ed["url"])
			},
		},
		{
			name: "x-extensions at root",
			mutate: func(c *OpenAPIConfig) {
				c.Extensions = map[string]any{
					"x-custom":    "value",
					"x-generator": "api-framework",
				}
			},
			verify: func(t *testing.T, result map[string]any) {
				assert.Equal(t, "value", result["x-custom"])
				assert.Equal(t, "api-framework", result["x-generator"])
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cfg := minimalConfig()
			tt.mutate(cfg)
			tt.verify(t, generate(t, cfg))
		})
	}
}

// =============================================================================
// Per-endpoint OpenAPI features (single table)
// Covers fields not exercised by TestOpenAPI_FromServer.
// =============================================================================

func TestOpenAPISpec_EndpointFeatures(t *testing.T) {
	tests := []struct {
		name     string
		endpoint Endpoint
		verify   func(t *testing.T, op map[string]any)
	}{
		{
			name: "deprecated flag",
			endpoint: Endpoint{
				Method: http.MethodGet, Pattern: "/old", Deprecated: true,
			},
			verify: func(t *testing.T, op map[string]any) {
				assert.Equal(t, true, op["deprecated"])
			},
		},
		{
			name: "external docs",
			endpoint: Endpoint{
				Method: http.MethodGet, Pattern: "/x",
				ExternalDocsURL: "https://docs.example.com/x", ExternalDocsDesc: "Detailed docs",
			},
			verify: func(t *testing.T, op map[string]any) {
				ed := op["externalDocs"].(map[string]any)
				assert.Equal(t, "https://docs.example.com/x", ed["url"])
				assert.Equal(t, "Detailed docs", ed["description"])
			},
		},
		{
			name: "server overrides",
			endpoint: Endpoint{
				Method: http.MethodGet, Pattern: "/special",
				Servers: []Server{{URL: "https://special.example.com", Description: "Special"}},
			},
			verify: func(t *testing.T, op map[string]any) {
				srv := op["servers"].([]map[string]any)
				require.Len(t, srv, 1)
				assert.Equal(t, "https://special.example.com", srv[0]["url"])
			},
		},
		{
			name: "callbacks",
			endpoint: Endpoint{
				Method: http.MethodPost, Pattern: "/webhooks",
				Callbacks: map[string]any{
					"onEvent": map[string]any{
						"{$request.body#/callbackUrl}": map[string]any{
							"post": map[string]any{"summary": "Event callback"},
						},
					},
				},
			},
			verify: func(t *testing.T, op map[string]any) {
				assert.NotNil(t, op["callbacks"])
			},
		},
		{
			name: "x-extensions",
			endpoint: Endpoint{
				Method: http.MethodGet, Pattern: "/custom",
				Extensions: map[string]any{"x-custom-field": "custom-value"},
			},
			verify: func(t *testing.T, op map[string]any) {
				assert.Equal(t, "custom-value", op["x-custom-field"])
			},
		},
		{
			name: "per-endpoint security",
			endpoint: Endpoint{
				Method: http.MethodGet, Pattern: "/protected",
				Security: []Security{NewSecurity("jwt")},
			},
			verify: func(t *testing.T, op map[string]any) {
				sec := op["security"].([]map[string][]string)
				require.Len(t, sec, 1)
				assert.Contains(t, sec[0], "jwt")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := generate(t, minimalConfig(), tt.endpoint)
			method := strings.ToLower(tt.endpoint.Method)
			tt.verify(t, pathOp(t, result, tt.endpoint.Pattern, method))
		})
	}
}

// MultipleResponses isn't exercised by FromServer (server uses Response, not Responses map).
func TestOpenAPISpec_MultipleResponses(t *testing.T) {
	result := generate(t, minimalConfig(), Endpoint{
		Method:  http.MethodPost,
		Pattern: "/users",
		Request: &CreateUserRequest{},
		Responses: map[int]SchemaProvider{
			201: &UserResponse{},
			400: &ErrorResponse{},
		},
	})

	responses := pathOp(t, result, "/users", "post")["responses"].(map[string]any)
	assert.Contains(t, responses, "201")
	assert.Contains(t, responses, "400")
}

// =============================================================================
// AddSchema + JSON serialization
// =============================================================================

func TestOpenAPISpec_AddSchema(t *testing.T) {
	spec := NewOpenAPISpec(minimalConfig())
	spec.AddSchema("User", &UserResponse{})
	spec.AddSchema("Error", &ErrorResponse{})

	schemas := spec.Generate()["components"].(map[string]any)["schemas"].(map[string]any)
	assert.Contains(t, schemas, "User")
	assert.Contains(t, schemas, "Error")
	assert.Equal(t, "object", schemas["User"].(map[string]any)["type"])
}

func TestOpenAPISpec_JSONOutput(t *testing.T) {
	spec := NewOpenAPISpec(minimalConfig())

	t.Run("JSON()", func(t *testing.T) {
		b, err := spec.JSON()
		require.NoError(t, err)
		var parsed map[string]any
		require.NoError(t, json.Unmarshal(b, &parsed))
		assert.Equal(t, "Test API", parsed["info"].(map[string]any)["title"])
	})

	t.Run("JSONIndent() pretty-prints", func(t *testing.T) {
		b, err := spec.JSONIndent("", "  ")
		require.NoError(t, err)
		assert.Contains(t, string(b), "\n")
		assert.Contains(t, string(b), "  ")
	})
}

// =============================================================================
// Endpoint helpers
// =============================================================================

func TestEndpoint_Helpers(t *testing.T) {
	t.Run("ExtractPathParams", func(t *testing.T) {
		assert.Equal(t,
			[]string{"userId", "postId"},
			(&Endpoint{Pattern: "/users/{userId}/posts/{postId}"}).ExtractPathParams(),
		)
		assert.Empty(t, (&Endpoint{Pattern: "/users"}).ExtractPathParams())
	})

	t.Run("OpenAPIPath returns Pattern", func(t *testing.T) {
		assert.Equal(t, "/users/{id}", (&Endpoint{Pattern: "/users/{id}"}).OpenAPIPath())
	})

	t.Run("RequiredSchemes dedups and lists schemes", func(t *testing.T) {
		ep := Endpoint{Security: []Security{NewSecurity("jwt"), NewSecurity("api_key")}}
		schemes := ep.RequiredSchemes()
		assert.Len(t, schemes, 2)
		assert.Contains(t, schemes, "jwt")
		assert.Contains(t, schemes, "api_key")

		empty := (&Endpoint{}).RequiredSchemes()
		assert.Empty(t, empty)

		dup := Endpoint{Security: []Security{NewSecurity("jwt"), NewSecurity("jwt")}}
		assert.Equal(t, []string{"jwt"}, dup.RequiredSchemes())
	})
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
			assert.Equal(t, tt.expected, (&Endpoint{Pattern: tt.pattern}).ExtractPathParams())
		})
	}
}

// =============================================================================
// Response descriptions
// =============================================================================

func TestOpenAPI_ResponseDescriptions(t *testing.T) {
	result := generate(t, minimalConfig(), Endpoint{
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
	})

	responses := pathOp(t, result, "/test", "get")["responses"].(map[string]any)

	// Custom descriptions
	assert.Equal(t, "Success - item returned", responses["200"].(map[string]any)["description"])
	assert.Equal(t, "Invalid request parameters", responses["400"].(map[string]any)["description"])

	// Default descriptions (from defaultResponseDescription)
	assert.Equal(t, "Not found", responses["404"].(map[string]any)["description"])
	assert.Equal(t, "Internal server error", responses["500"].(map[string]any)["description"])
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
			assert.Equal(t, tt.expected, defaultResponseDescription(tt.code))
		})
	}
}

// =============================================================================
// Schema $ref tests
// =============================================================================

func TestObjectSchema_Ref(t *testing.T) {
	DefaultRegistry.Clear()

	var name, email string
	userSchema := Object(map[string]Schema{
		"name":  String(&name).Required(),
		"email": String(&email).Email(),
	}).Title("User").Ref("User")

	openAPI := userSchema.OpenAPI()
	assert.Equal(t, "#/components/schemas/User", openAPI["$ref"])
	assert.NotContains(t, openAPI, "type")

	def := userSchema.Definition()
	assert.Equal(t, "object", def["type"])
	assert.Equal(t, "User", def["title"])
	assert.Contains(t, def, "properties")

	assert.Equal(t, "User", userSchema.RefName())
	assert.NotNil(t, DefaultRegistry.Get("User"))
}

func TestObjectSchema_Ref_InOpenAPISpec(t *testing.T) {
	DefaultRegistry.Clear()

	var errorCode, errorMsg string
	errorSchema := Object(map[string]Schema{
		"code":    String(&errorCode).Required(),
		"message": String(&errorMsg).Required(),
	}).Title("Error").Ref("Error")

	result := generate(t, minimalConfig(), Endpoint{
		Method:   http.MethodGet,
		Pattern:  "/items",
		Response: &emptyResponse{},
		Responses: map[int]SchemaProvider{
			400: &schemaProviderWrapper{schema: errorSchema},
		},
	})

	// Components should include the Error schema from the registry
	schemas := result["components"].(map[string]any)["schemas"].(map[string]any)
	assert.Contains(t, schemas, "Error")
	errDef := schemas["Error"].(map[string]any)
	assert.Equal(t, "object", errDef["type"])
	assert.Equal(t, "Error", errDef["title"])

	// The 400 response should be a $ref
	respSchema := pathOp(t, result, "/items", "get")["responses"].(map[string]any)["400"].(map[string]any)["content"].(map[string]any)["application/json"].(map[string]any)["schema"].(map[string]any)
	assert.Equal(t, "#/components/schemas/Error", respSchema["$ref"])
}

func TestArraySchema_Ref(t *testing.T) {
	DefaultRegistry.Clear()

	var item string
	tagsSchema := Array(String(&item)).MinItems(1).Ref("Tags")

	openAPI := tagsSchema.OpenAPI()
	assert.Equal(t, "#/components/schemas/Tags", openAPI["$ref"])

	def := tagsSchema.Definition()
	assert.Equal(t, "array", def["type"])
	assert.Equal(t, 1, def["minItems"])

	assert.Equal(t, "Tags", tagsSchema.RefName())
}

// =============================================================================
// Server-driven OpenAPI integration test
//
// Uses the same setupTestServer fixture as http_test.go to verify that the
// OpenAPI spec generated from a real Router accurately reflects every feature
// the HTTP suite exercises. This catches drift between the spec and the
// validation/parsing layer in a way that pure unit tests can't.
// =============================================================================

func TestOpenAPI_FromServer(t *testing.T) {
	_, router := setupTestServer(t)

	spec := NewOpenAPISpec(&OpenAPIConfig{
		Info: OpenAPIInfo{Title: "Test API", Version: "1.0.0"},
		SecuritySchemes: map[string]*SecurityScheme{
			"bearerAuth": HTTPBearerJWT(),
		},
	})
	spec.AddEndpoints(router.Endpoints())
	result := spec.Generate()
	paths := result["paths"].(map[string]any)

	t.Run("every registered path appears", func(t *testing.T) {
		expected := []string{
			"/items", "/items/{id}",
			"/error", "/error/{type}",
			"/codes", "/links", "/measurements", "/tagged", "/orders", "/nullable", "/adopt",
			"/session", "/events/{id}",
			"/process", "/context-test", "/health",
		}
		for _, p := range expected {
			assert.Contains(t, paths, p, "missing path %q in spec", p)
		}
	})

	t.Run("path param has required=true and uuid format", func(t *testing.T) {
		params := pathOp(t, result, "/items/{id}", "get")["parameters"].([]map[string]any)

		idParam := findParamBySource(params, "id", "path")
		require.NotNil(t, idParam)
		assert.Equal(t, true, idParam["required"])

		schema := idParam["schema"].(map[string]any)
		assert.Equal(t, "string", schema["type"])
		assert.Equal(t, "uuid", schema["format"])
	})

	t.Run("query params have correct types, defaults, and enums", func(t *testing.T) {
		params := pathOp(t, result, "/items/{id}", "get")["parameters"].([]map[string]any)

		pageParam := findParamBySource(params, "page", "query")
		require.NotNil(t, pageParam)
		pageSchema := pageParam["schema"].(map[string]any)
		assert.Equal(t, "integer", pageSchema["type"])
		assert.Equal(t, int64(1), pageSchema["default"])
		assert.Equal(t, int64(1), pageSchema["minimum"])

		statusParam := findParamBySource(params, "status", "query")
		require.NotNil(t, statusParam)
		statusSchema := statusParam["schema"].(map[string]any)
		assert.Equal(t, []string{"active", "inactive", "pending"}, statusSchema["enum"])
	})

	t.Run("header param uses header source", func(t *testing.T) {
		params := pathOp(t, result, "/items/{id}", "put")["parameters"].([]map[string]any)
		hdr := findParamBySource(params, "X-Request-ID", "header")
		require.NotNil(t, hdr)
		assert.Equal(t, "uuid", hdr["schema"].(map[string]any)["format"])
	})

	t.Run("cookie params use cookie source and reflect required flag", func(t *testing.T) {
		params := pathOp(t, result, "/session", "get")["parameters"].([]map[string]any)

		session := findParamBySource(params, "session_id", "cookie")
		require.NotNil(t, session)
		assert.Equal(t, true, session["required"])

		user := findParamBySource(params, "user_id", "cookie")
		require.NotNil(t, user)
		assert.Equal(t, false, user["required"])
	})

	t.Run("request body wires schema with required fields", func(t *testing.T) {
		reqBody := pathOp(t, result, "/items", "post")["requestBody"].(map[string]any)
		schema := reqBody["content"].(map[string]any)["application/json"].(map[string]any)["schema"].(map[string]any)
		assert.Equal(t, "object", schema["type"])

		required := schema["required"].([]string)
		assert.Contains(t, required, "name")
		assert.Contains(t, required, "email")
		assert.Equal(t, "email", schema["properties"].(map[string]any)["email"].(map[string]any)["format"])
	})

	t.Run("response wires schema for declared status", func(t *testing.T) {
		responses := pathOp(t, result, "/items", "post")["responses"].(map[string]any)
		require.Contains(t, responses, "201") // CreatedSimpleResponse has Status() = 201
		schema := responses["201"].(map[string]any)["content"].(map[string]any)["application/json"].(map[string]any)["schema"].(map[string]any)
		assert.Equal(t, "object", schema["type"])
	})

	t.Run("nested object surfaces with enum on nested field", func(t *testing.T) {
		schema := pathOp(t, result, "/orders", "post")["requestBody"].(map[string]any)["content"].(map[string]any)["application/json"].(map[string]any)["schema"].(map[string]any)

		shipping := schema["properties"].(map[string]any)["shippingAddress"].(map[string]any)
		assert.Equal(t, "object", shipping["type"])
		country := shipping["properties"].(map[string]any)["country"].(map[string]any)
		assert.Equal(t, []string{"US", "CA", "UK", "DE"}, country["enum"])
	})

	t.Run("array schema preserves min/max items", func(t *testing.T) {
		schema := pathOp(t, result, "/tagged", "post")["requestBody"].(map[string]any)["content"].(map[string]any)["application/json"].(map[string]any)["schema"].(map[string]any)
		tagsProp := schema["properties"].(map[string]any)["tags"].(map[string]any)
		assert.Equal(t, "array", tagsProp["type"])
		assert.Equal(t, 1, tagsProp["minItems"])
		assert.Equal(t, 5, tagsProp["maxItems"])
	})

	t.Run("pattern, url format, and nullable surface in spec", func(t *testing.T) {
		codeSchema := pathOp(t, result, "/codes", "post")["requestBody"].(map[string]any)["content"].(map[string]any)["application/json"].(map[string]any)["schema"].(map[string]any)
		assert.Equal(t, `^[A-Z]{3}-\d{4}$`, codeSchema["properties"].(map[string]any)["code"].(map[string]any)["pattern"])

		linkSchema := pathOp(t, result, "/links", "post")["requestBody"].(map[string]any)["content"].(map[string]any)["application/json"].(map[string]any)["schema"].(map[string]any)
		assert.Equal(t, "url", linkSchema["properties"].(map[string]any)["website"].(map[string]any)["format"])

		nullSchema := pathOp(t, result, "/nullable", "post")["requestBody"].(map[string]any)["content"].(map[string]any)["application/json"].(map[string]any)["schema"].(map[string]any)
		assert.Equal(t, true, nullSchema["properties"].(map[string]any)["nickname"].(map[string]any)["nullable"])
	})

	t.Run("union surfaces as oneOf with discriminator", func(t *testing.T) {
		schema := pathOp(t, result, "/adopt", "post")["requestBody"].(map[string]any)["content"].(map[string]any)["application/json"].(map[string]any)["schema"].(map[string]any)
		petProp := schema["properties"].(map[string]any)["pet"].(map[string]any)

		oneOf, ok := petProp["oneOf"].([]map[string]any)
		require.True(t, ok, "pet should have oneOf")
		assert.Len(t, oneOf, 2)

		disc := petProp["discriminator"].(map[string]any)
		assert.Equal(t, "type", disc["propertyName"])
	})

	t.Run("operation metadata propagated", func(t *testing.T) {
		op := pathOp(t, result, "/items", "post")
		assert.Equal(t, "Create item", op["summary"])
		assert.Equal(t, "createItem", op["operationId"])
		assert.Equal(t, []string{"Items"}, op["tags"])
	})

	t.Run("delete endpoint has no request body block", func(t *testing.T) {
		_, hasBody := pathOp(t, result, "/items/{id}", "delete")["requestBody"]
		assert.False(t, hasBody, "DELETE with no body fields should not emit requestBody")
	})

	t.Run("spec serializes to valid JSON", func(t *testing.T) {
		b, err := spec.JSONIndent("", "  ")
		require.NoError(t, err)

		var parsed map[string]any
		require.NoError(t, json.Unmarshal(b, &parsed))
		assert.Equal(t, "Test API", parsed["info"].(map[string]any)["title"])
	})
}
