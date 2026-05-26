package chita

import (
	"encoding/json"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Integration tests verifying that schema definitions produce
// BOTH correct validation AND correct OpenAPI output (single source of truth).

// --- Simple Request with Validation + OpenAPI ---

type CreateProjectRequest struct {
	Name        Required[string] `json:"name"`
	Description Optional[string] `json:"description"`
	IsPublic    Optional[bool]   `json:"isPublic"`
}

func (r *CreateProjectRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"name":        Str(&r.Name).MinLength(1).MaxLength(100).Description("Project name"),
		"description": OptStr(&r.Description).MaxLength(500).Description("Project description"),
		"isPublic":    OptBool(&r.IsPublic).Default(false).Description("Whether project is public"),
	}).Title("CreateProjectRequest").Description("Request to create a new project")
}

func TestIntegration_SimpleRequest_ValidationAndOpenAPI(t *testing.T) {
	// Test 1: Validation works correctly
	t.Run("validation_empty_name", func(t *testing.T) {
		req := &CreateProjectRequest{} // Name not set
		errs := req.Schema().Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "name", errs[0].Field)
		assert.Equal(t, "required", errs[0].Code)
	})

	t.Run("validation_name_too_long", func(t *testing.T) {
		req := &CreateProjectRequest{Name: NewRequired(string(make([]byte, 101)))}
		errs := req.Schema().Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "name", errs[0].Field)
		assert.Equal(t, "max_length", errs[0].Code)
	})

	t.Run("validation_valid_request", func(t *testing.T) {
		req := &CreateProjectRequest{Name: NewRequired("My Project"), Description: NewOptional("A great project")}
		errs := req.Schema().Validate()
		assert.Empty(t, errs)
	})

	// Test 2: Same schema produces correct OpenAPI
	t.Run("openapi_output", func(t *testing.T) {
		req := &CreateProjectRequest{}
		openapi := req.Schema().OpenAPI()

		assert.Equal(t, "object", openapi["type"])
		assert.Equal(t, "CreateProjectRequest", openapi["title"])
		assert.Equal(t, "Request to create a new project", openapi["description"])

		props := openapi["properties"].(map[string]any)

		// name property
		nameProp := props["name"].(map[string]any)
		assert.Equal(t, "string", nameProp["type"])
		assert.Equal(t, 1, nameProp["minLength"])
		assert.Equal(t, 100, nameProp["maxLength"])
		assert.Equal(t, "Project name", nameProp["description"])

		// description property
		descProp := props["description"].(map[string]any)
		assert.Equal(t, "string", descProp["type"])
		assert.Equal(t, 500, descProp["maxLength"])

		// isPublic property
		publicProp := props["isPublic"].(map[string]any)
		assert.Equal(t, "boolean", publicProp["type"])
		assert.Equal(t, false, publicProp["default"])

		// Required fields
		required := openapi["required"].([]string)
		assert.Contains(t, required, "name")
		assert.NotContains(t, required, "description")
		assert.NotContains(t, required, "isPublic")
	})
}

// --- Nested Object with Validation + OpenAPI ---

type Address struct {
	Street  Required[string] `json:"street"`
	City    Required[string] `json:"city"`
	ZipCode Required[string] `json:"zipCode"`
}

func (a *Address) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"street":  Str(&a.Street).MinLength(1),
		"city":    Str(&a.City).MinLength(1),
		"zipCode": Str(&a.ZipCode).Pattern(`^\d{5}$`),
	})
}

type CreateUserWithAddressRequest struct {
	Name    Required[string] `json:"name"`
	Email   Required[string] `json:"email"`
	Address Address          `json:"address"`
}

func (r *CreateUserWithAddressRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"name":    Str(&r.Name).MinLength(1),
		"email":   Str(&r.Email).Email(),
		"address": r.Address.Schema().Required(),
	})
}

func TestIntegration_NestedObject_ValidationAndOpenAPI(t *testing.T) {
	t.Run("validation_nested_errors", func(t *testing.T) {
		req := &CreateUserWithAddressRequest{
			Name:  NewRequired("John"),
			Email: NewRequired("invalid-email"),
			Address: Address{
				Street:  Required[string]{}, // not set
				City:    NewRequired("NYC"),
				ZipCode: NewRequired("invalid"),
			},
		}
		errs := req.Schema().Validate()

		// Should have errors for: email format, street required, zipCode pattern
		require.GreaterOrEqual(t, len(errs), 2)

		fieldErrors := make(map[string]bool)
		for _, e := range errs {
			fieldErrors[e.Field] = true
		}
		assert.True(t, fieldErrors["email"] || fieldErrors["address"])
	})

	t.Run("validation_valid_nested", func(t *testing.T) {
		req := &CreateUserWithAddressRequest{
			Name:  NewRequired("John"),
			Email: NewRequired("john@example.com"),
			Address: Address{
				Street:  NewRequired("123 Main St"),
				City:    NewRequired("NYC"),
				ZipCode: NewRequired("10001"),
			},
		}
		errs := req.Schema().Validate()
		assert.Empty(t, errs)
	})

	t.Run("openapi_nested_structure", func(t *testing.T) {
		req := &CreateUserWithAddressRequest{}
		openapi := req.Schema().OpenAPI()

		props := openapi["properties"].(map[string]any)
		addressProp := props["address"].(map[string]any)

		assert.Equal(t, "object", addressProp["type"])

		addressProps := addressProp["properties"].(map[string]any)
		assert.Contains(t, addressProps, "street")
		assert.Contains(t, addressProps, "city")
		assert.Contains(t, addressProps, "zipCode")

		zipCodeProp := addressProps["zipCode"].(map[string]any)
		assert.Equal(t, `^\d{5}$`, zipCodeProp["pattern"])
	})
}

// --- Union Type with Validation + OpenAPI ---

type Provider interface {
	Union
	providerMarker()
}

type SqlDatabaseProvider struct {
	Type     Required[string] `json:"type"`
	Host     Required[string] `json:"host"`
	Port     Required[int]    `json:"port"`
	Database Required[string] `json:"database"`
	Username Required[string] `json:"username"`
}

func (p *SqlDatabaseProvider) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"type":     Str(&p.Type),
		"host":     Str(&p.Host).MinLength(1).Description("Database host"),
		"port":     Int(&p.Port).Min(1).Max(65535).Description("Database port"),
		"database": Str(&p.Database).MinLength(1).Description("Database name"),
		"username": Str(&p.Username).MinLength(1).Description("Database username"),
	}).Title("SqlDatabaseProvider")
}

func (p *SqlDatabaseProvider) unionMarker()    {}
func (p *SqlDatabaseProvider) providerMarker() {}

type AwsIamProvider struct {
	Type      Required[string] `json:"type"`
	Region    Required[string] `json:"region"`
	AccountID Required[string] `json:"accountId"`
	RoleArn   Required[string] `json:"roleArn"`
}

func (p *AwsIamProvider) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"type":      Str(&p.Type),
		"region":    Str(&p.Region).Pattern(`^[a-z]{2}-[a-z]+-\d$`).Description("AWS region"),
		"accountId": Str(&p.AccountID).Pattern(`^\d{12}$`).Description("AWS account ID"),
		"roleArn":   Str(&p.RoleArn).MinLength(1).Description("IAM role ARN"),
	}).Title("AwsIamProvider")
}

func (p *AwsIamProvider) unionMarker()    {}
func (p *AwsIamProvider) providerMarker() {}

type RedisProvider struct {
	Type     Required[string] `json:"type"`
	Host     Required[string] `json:"host"`
	Port     Required[int]    `json:"port"`
	Password Optional[string] `json:"password"`
}

func (p *RedisProvider) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"type":     Str(&p.Type),
		"host":     Str(&p.Host).MinLength(1),
		"port":     Int(&p.Port).Min(1).Max(65535),
		"password": OptStr(&p.Password).WriteOnly(),
	}).Title("RedisProvider")
}

func (p *RedisProvider) unionMarker()    {}
func (p *RedisProvider) providerMarker() {}

var ProviderParser = UnionDef[Provider]{
	Discriminator: "type",
	Variants: map[string]func() Provider{
		"sql-database": func() Provider { return &SqlDatabaseProvider{} },
		"aws-iam":      func() Provider { return &AwsIamProvider{} },
		"redis":        func() Provider { return &RedisProvider{} },
	},
}

type CreateDynamicSecretRequest struct {
	Name     Required[string] `json:"name"`
	Provider Provider         `json:"-"`
}

func (r *CreateDynamicSecretRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"name":     Str(&r.Name).MinLength(1).MaxLength(64).Pattern(`^[a-zA-Z0-9_-]+$`),
		"provider": UnionField(&r.Provider, ProviderParser).Required().Description("Provider configuration"),
	}).Title("CreateDynamicSecretRequest")
}

func (r *CreateDynamicSecretRequest) UnmarshalJSON(data []byte) error {
	type Plain CreateDynamicSecretRequest
	if err := json.Unmarshal(data, (*Plain)(r)); err != nil {
		return err
	}
	return ParseUnions(data,
		U("provider", &r.Provider, ProviderParser),
	)
}

func TestIntegration_Union_ValidationAndOpenAPI(t *testing.T) {
	t.Run("parse_sql_database_provider", func(t *testing.T) {
		data := []byte(`{
			"name": "my-secret",
			"provider": {
				"type": "sql-database",
				"host": "localhost",
				"port": 5432,
				"database": "mydb",
				"username": "admin"
			}
		}`)

		var req CreateDynamicSecretRequest
		err := json.Unmarshal(data, &req)
		require.NoError(t, err)

		assert.Equal(t, "my-secret", req.Name.Get())
		require.NotNil(t, req.Provider)

		sqlProvider, ok := req.Provider.(*SqlDatabaseProvider)
		require.True(t, ok)
		assert.Equal(t, "localhost", sqlProvider.Host.Get())
		assert.Equal(t, 5432, sqlProvider.Port.Get())
		assert.Equal(t, "mydb", sqlProvider.Database.Get())
	})

	t.Run("parse_aws_iam_provider", func(t *testing.T) {
		data := []byte(`{
			"name": "aws-secret",
			"provider": {
				"type": "aws-iam",
				"region": "us-east-1",
				"accountId": "123456789012",
				"roleArn": "arn:aws:iam::123456789012:role/MyRole"
			}
		}`)

		var req CreateDynamicSecretRequest
		err := json.Unmarshal(data, &req)
		require.NoError(t, err)

		awsProvider, ok := req.Provider.(*AwsIamProvider)
		require.True(t, ok)
		assert.Equal(t, "us-east-1", awsProvider.Region.Get())
		assert.Equal(t, "123456789012", awsProvider.AccountID.Get())
	})

	t.Run("parse_unknown_provider_type", func(t *testing.T) {
		data := []byte(`{
			"name": "test",
			"provider": {
				"type": "unknown-type"
			}
		}`)

		var req CreateDynamicSecretRequest
		err := json.Unmarshal(data, &req)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "unknown type value")
	})

	t.Run("validation_provider_required", func(t *testing.T) {
		req := &CreateDynamicSecretRequest{
			Name:     NewRequired("test"),
			Provider: nil,
		}
		errs := req.Schema().Validate()
		require.NotEmpty(t, errs)

		hasProviderError := false
		for _, e := range errs {
			if e.Field == "provider" {
				hasProviderError = true
				break
			}
		}
		assert.True(t, hasProviderError)
	})

	t.Run("validation_provider_fields", func(t *testing.T) {
		req := &CreateDynamicSecretRequest{
			Name: NewRequired("test"),
			Provider: &SqlDatabaseProvider{
				Type:     NewRequired("sql-database"),
				Host:     Required[string]{}, // Invalid - not set
				Port:     NewRequired(99999), // Invalid - max 65535
				Database: NewRequired("db"),
				Username: NewRequired("user"),
			},
		}
		errs := req.Schema().Validate()
		require.NotEmpty(t, errs)
	})

	t.Run("validation_valid_request", func(t *testing.T) {
		req := &CreateDynamicSecretRequest{
			Name: NewRequired("my-secret"),
			Provider: &SqlDatabaseProvider{
				Type:     NewRequired("sql-database"),
				Host:     NewRequired("localhost"),
				Port:     NewRequired(5432),
				Database: NewRequired("mydb"),
				Username: NewRequired("admin"),
			},
		}
		errs := req.Schema().Validate()
		assert.Empty(t, errs)
	})

	t.Run("openapi_union_structure", func(t *testing.T) {
		req := &CreateDynamicSecretRequest{}
		openapi := req.Schema().OpenAPI()

		props := openapi["properties"].(map[string]any)
		providerProp := props["provider"].(map[string]any)

		// Should have oneOf for discriminated union
		oneOf, ok := providerProp["oneOf"].([]map[string]any)
		require.True(t, ok)
		assert.Len(t, oneOf, 3) // 3 providers

		// Should have discriminator
		disc, ok := providerProp["discriminator"].(map[string]any)
		require.True(t, ok)
		assert.Equal(t, "type", disc["propertyName"])
		// mapping is omitted for inline schemas
		_, hasMapping := disc["mapping"]
		assert.False(t, hasMapping)
	})

	t.Run("openapi_variant_schemas", func(t *testing.T) {
		// Verify each variant produces correct OpenAPI
		sqlProvider := &SqlDatabaseProvider{}
		sqlOpenAPI := sqlProvider.Schema().OpenAPI()

		assert.Equal(t, "SqlDatabaseProvider", sqlOpenAPI["title"])
		props := sqlOpenAPI["properties"].(map[string]any)

		hostProp := props["host"].(map[string]any)
		assert.Equal(t, "string", hostProp["type"])
		assert.Equal(t, "Database host", hostProp["description"])

		portProp := props["port"].(map[string]any)
		assert.Equal(t, "integer", portProp["type"])
		assert.Equal(t, int64(1), portProp["minimum"])
		assert.Equal(t, int64(65535), portProp["maximum"])
	})
}

// --- Array with Item Validation + OpenAPI ---

type BatchCreateRequest struct {
	Items []CreateProjectRequest `json:"items"`
}

func (r *BatchCreateRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"items": Array((&CreateProjectRequest{}).Schema()).
			Required().
			MinItems(1).
			MaxItems(100).
			Description("List of projects to create"),
	})
}

func TestIntegration_Array_ValidationAndOpenAPI(t *testing.T) {
	t.Run("openapi_array_with_items", func(t *testing.T) {
		req := &BatchCreateRequest{}
		openapi := req.Schema().OpenAPI()

		props := openapi["properties"].(map[string]any)
		itemsProp := props["items"].(map[string]any)

		assert.Equal(t, "array", itemsProp["type"])
		assert.Equal(t, 1, itemsProp["minItems"])
		assert.Equal(t, 100, itemsProp["maxItems"])
		assert.Equal(t, "List of projects to create", itemsProp["description"])

		// Items schema should be the project schema
		items := itemsProp["items"].(map[string]any)
		assert.Equal(t, "object", items["type"])
		assert.Equal(t, "CreateProjectRequest", items["title"])
	})
}

// --- Full OpenAPI Spec Generation with Endpoints ---

func TestIntegration_FullOpenAPISpec(t *testing.T) {
	config := &OpenAPIConfig{
		OpenAPIVersion: "3.0.3",
		Info: OpenAPIInfo{
			Title:       "Dynamic Secrets API",
			Version:     "1.0.0",
			Description: "API for managing dynamic secrets",
		},
		SecuritySchemes: map[string]*SecurityScheme{
			"bearerAuth": HTTPBearerJWT().WithDescription("JWT authentication"),
			"apiKey":     APIKeyHeader("X-API-Key").WithDescription("API key authentication"),
		},
		Tags: []OpenAPITag{
			{Name: "Dynamic Secrets", Description: "Manage dynamic secrets"},
		},
	}

	spec := NewOpenAPISpec(config)

	// Add schemas
	spec.AddSchema("CreateDynamicSecretRequest", &CreateDynamicSecretRequest{})
	spec.AddSchema("SqlDatabaseProvider", &SqlDatabaseProvider{})
	spec.AddSchema("AwsIamProvider", &AwsIamProvider{})
	spec.AddSchema("RedisProvider", &RedisProvider{})

	// Add endpoints
	spec.AddEndpoints([]Endpoint{
		{
			Method:      "POST",
			Pattern:     "/api/v1/dynamic-secrets",
			Summary:     "Create dynamic secret",
			Description: "Creates a new dynamic secret with the specified provider",
			Tags:        []string{"Dynamic Secrets"},
			Request:     &CreateDynamicSecretRequest{},
			Responses: map[int]SchemaProvider{
				201: &CreateDynamicSecretRequest{}, // Simplified for test
			},
			Security: []Security{
				NewSecurity("bearerAuth"),
				NewSecurity("apiKey"),
			},
			QueryParams: map[string]Schema{
				"projectId": StringElem(nil).UUID().Description("Project ID"),
			},
		},
	})

	result := spec.Generate()

	// Verify structure
	assert.Equal(t, "3.0.3", result["openapi"])

	info := result["info"].(map[string]any)
	assert.Equal(t, "Dynamic Secrets API", info["title"])

	// Verify security schemes
	components := result["components"].(map[string]any)
	secSchemes := components["securitySchemes"].(map[string]any)
	assert.Contains(t, secSchemes, "bearerAuth")
	assert.Contains(t, secSchemes, "apiKey")

	// Verify schemas
	schemas := components["schemas"].(map[string]any)
	assert.Contains(t, schemas, "CreateDynamicSecretRequest")
	assert.Contains(t, schemas, "SqlDatabaseProvider")

	// Verify paths
	paths := result["paths"].(map[string]any)
	dsPath := paths["/api/v1/dynamic-secrets"].(map[string]any)
	postOp := dsPath["post"].(map[string]any)

	assert.Equal(t, "Create dynamic secret", postOp["summary"])
	assert.Equal(t, []string{"Dynamic Secrets"}, postOp["tags"])

	// Verify request body references the schema
	reqBody := postOp["requestBody"].(map[string]any)
	assert.NotNil(t, reqBody["content"])

	// Verify security
	security := postOp["security"].([]map[string][]string)
	assert.Len(t, security, 2)

	// Verify query params
	params := postOp["parameters"].([]map[string]any)
	require.Len(t, params, 1)
	assert.Equal(t, "projectId", params[0]["name"])
	assert.Equal(t, "query", params[0]["in"])
	// QueryParams with StringElem are optional by default

	// Verify it serializes to valid JSON
	jsonBytes, err := spec.JSONIndent("", "  ")
	require.NoError(t, err)
	assert.NotEmpty(t, jsonBytes)

	// Verify it's valid JSON
	var parsed map[string]any
	err = json.Unmarshal(jsonBytes, &parsed)
	require.NoError(t, err)
}

// --- UUID Field Integration ---

type ResourceRequest struct {
	ID       uuid.UUID        `json:"id"`
	ParentID uuid.UUID        `json:"parentId"`
	Name     Required[string] `json:"name"`
}

func (r *ResourceRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"id":       UUID(&r.ID).Required().Description("Resource ID"),
		"parentId": UUID(&r.ParentID).Optional().Nullable().Description("Parent resource ID"),
		"name":     Str(&r.Name).MinLength(1),
	})
}

func TestIntegration_UUID_ValidationAndOpenAPI(t *testing.T) {
	t.Run("validation_uuid_required", func(t *testing.T) {
		req := &ResourceRequest{
			ID:   uuid.Nil,
			Name: NewRequired("test"),
		}
		errs := req.Schema().Validate()
		require.NotEmpty(t, errs)
		assert.Equal(t, "id", errs[0].Field)
	})

	t.Run("validation_uuid_optional_nil", func(t *testing.T) {
		req := &ResourceRequest{
			ID:       uuid.New(),
			ParentID: uuid.Nil, // Optional, should be fine
			Name:     NewRequired("test"),
		}
		errs := req.Schema().Validate()
		assert.Empty(t, errs)
	})

	t.Run("openapi_uuid_format", func(t *testing.T) {
		req := &ResourceRequest{}
		openapi := req.Schema().OpenAPI()

		props := openapi["properties"].(map[string]any)

		idProp := props["id"].(map[string]any)
		assert.Equal(t, "string", idProp["type"])
		assert.Equal(t, "uuid", idProp["format"])

		parentProp := props["parentId"].(map[string]any)
		assert.Equal(t, "string", parentProp["type"])
		assert.Equal(t, "uuid", parentProp["format"])
		assert.Equal(t, true, parentProp["nullable"])
	})
}

// --- Enum Validation + OpenAPI ---

type StatusRequest struct {
	Status Required[string] `json:"status"`
	Level  Required[int]    `json:"level"`
}

func (r *StatusRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"status": Str(&r.Status).Enum("active", "inactive", "pending").Description("Resource status"),
		"level":  Int(&r.Level).Enum(1, 2, 3, 4, 5).Description("Priority level"),
	})
}

func TestIntegration_Enum_ValidationAndOpenAPI(t *testing.T) {
	t.Run("validation_string_enum_invalid", func(t *testing.T) {
		req := &StatusRequest{Status: NewRequired("unknown"), Level: NewRequired(1)}
		errs := req.Schema().Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "status", errs[0].Field)
		assert.Equal(t, "enum", errs[0].Code)
	})

	t.Run("validation_int_enum_invalid", func(t *testing.T) {
		req := &StatusRequest{Status: NewRequired("active"), Level: NewRequired(10)}
		errs := req.Schema().Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "level", errs[0].Field)
		assert.Equal(t, "enum", errs[0].Code)
	})

	t.Run("validation_enum_valid", func(t *testing.T) {
		req := &StatusRequest{Status: NewRequired("active"), Level: NewRequired(3)}
		errs := req.Schema().Validate()
		assert.Empty(t, errs)
	})

	t.Run("openapi_enum_values", func(t *testing.T) {
		req := &StatusRequest{}
		openapi := req.Schema().OpenAPI()

		props := openapi["properties"].(map[string]any)

		statusProp := props["status"].(map[string]any)
		assert.Equal(t, []string{"active", "inactive", "pending"}, statusProp["enum"])

		levelProp := props["level"].(map[string]any)
		assert.Equal(t, []int64{1, 2, 3, 4, 5}, levelProp["enum"])
	})
}
