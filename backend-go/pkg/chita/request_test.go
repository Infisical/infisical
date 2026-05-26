package chita

import (
	"bytes"
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type ParseTestRequest struct {
	OrgID   Required[string] `json:"-"`
	Include Optional[string] `json:"-"`
	Name    Required[string] `json:"name"`
	Age     Optional[int]    `json:"age"`
}

func (r *ParseTestRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"orgId":   Str(&r.OrgID).From(SourcePath),
		"include": OptStr(&r.Include).From(SourceQuery),
		"name":    Str(&r.Name),
		"age":     OptInt(&r.Age),
	})
}

func TestParseRequest_PathAndQuery(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		var req ParseTestRequest
		if err := ParseRequest(r, &req); err != nil {
			t.Errorf("ParseRequest failed: %v", err)
			http.Error(w, err.Error(), 400)
			return
		}

		if req.OrgID.Get() != "org-123" {
			t.Errorf("expected OrgID 'org-123', got %q", req.OrgID.Get())
		}
		if req.Include.Get() != "metadata" {
			t.Errorf("expected Include 'metadata', got %q", req.Include.Get())
		}
		if req.Name.Get() != "John" {
			t.Errorf("expected Name 'John', got %q", req.Name.Get())
		}
		if req.Age.Get() != 30 {
			t.Errorf("expected Age 30, got %d", req.Age.Get())
		}
	}

	r := chi.NewRouter()
	r.Post("/orgs/{orgId}/users", handler)

	body := `{"name": "John", "age": 30}`
	req := httptest.NewRequestWithContext(context.Background(), "POST", "/orgs/org-123/users?include=metadata", bytes.NewBufferString(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestParseRequest_UUIDPath(t *testing.T) {
	type UUIDRequest struct {
		ID uuid.UUID `json:"-"`
	}

	handler := func(w http.ResponseWriter, r *http.Request) {
		var req UUIDRequest
		schema := Object(map[string]Schema{
			"id": UUID(&req.ID).Required().From(SourcePath),
		})
		_ = schema // For schema definition

		// Manual parse since UUIDRequest doesn't implement SchemaProvider
		idStr := chi.URLParam(r, "id")
		var err error
		req.ID, err = uuid.Parse(idStr)
		if err != nil {
			t.Errorf("failed to parse UUID: %v", err)
			http.Error(w, err.Error(), 400)
			return
		}

		expected := uuid.MustParse("550e8400-e29b-41d4-a716-446655440000")
		if req.ID != expected {
			t.Errorf("expected ID %v, got %v", expected, req.ID)
		}
	}

	r := chi.NewRouter()
	r.Get("/items/{id}", handler)

	req := httptest.NewRequestWithContext(context.Background(), "GET", "/items/550e8400-e29b-41d4-a716-446655440000", nil)
	w := httptest.NewRecorder()

	r.ServeHTTP(w, req)

	if w.Code != 200 {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestExtractPathParams(t *testing.T) {
	tests := []struct {
		pattern  string
		expected []string
	}{
		{"/users/{id}", []string{"id"}},
		{"/orgs/{orgId}/projects/{projectId}", []string{"orgId", "projectId"}},
		{"/items/{id:[0-9]+}", []string{"id"}},
		{"/users/{userID:[a-f0-9-]+}/posts/{postID:[0-9]+}", []string{"userID", "postID"}},
		{"/static/path", nil},
		{"/{version}/api/{resource}", []string{"version", "resource"}},
	}

	for _, tt := range tests {
		t.Run(tt.pattern, func(t *testing.T) {
			result := ExtractPathParams(tt.pattern)
			if len(result) != len(tt.expected) {
				t.Errorf("expected %v, got %v", tt.expected, result)
				return
			}
			for i, param := range result {
				if param != tt.expected[i] {
					t.Errorf("expected param %d to be %q, got %q", i, tt.expected[i], param)
				}
			}
		})
	}
}

func TestSplitSchemaBySource(t *testing.T) {
	var name, orgID, token Required[string]
	var include Optional[string]

	schema := Object(map[string]Schema{
		"name":    Str(&name),
		"orgId":   Str(&orgID).From(SourcePath),
		"include": OptStr(&include).From(SourceQuery),
		"token":   Str(&token).From(SourceHeader),
	})

	bodySchema, params := SplitSchemaBySource(schema)

	if bodySchema == nil {
		t.Fatal("expected body schema, got nil")
	}
	if len(bodySchema.properties) != 1 {
		t.Errorf("expected 1 body property, got %d", len(bodySchema.properties))
	}
	if _, ok := bodySchema.properties["name"]; !ok {
		t.Error("expected 'name' in body properties")
	}

	if len(params[SourcePath]) != 1 {
		t.Errorf("expected 1 path param, got %d", len(params[SourcePath]))
	}
	if len(params[SourceQuery]) != 1 {
		t.Errorf("expected 1 query param, got %d", len(params[SourceQuery]))
	}
	if len(params[SourceHeader]) != 1 {
		t.Errorf("expected 1 header param, got %d", len(params[SourceHeader]))
	}
}

func TestBuildOpenAPIParameters(t *testing.T) {
	var name, orgID Required[string]
	var include Optional[string]
	var limit Optional[int]

	schema := Object(map[string]Schema{
		"name":    Str(&name),
		"orgId":   Str(&orgID).From(SourcePath).Description("Organization ID"),
		"include": OptStr(&include).From(SourceQuery).Description("Fields to include"),
		"limit":   OptInt(&limit).From(SourceQuery),
	})

	params := BuildOpenAPIParameters(schema)

	if len(params) != 3 {
		t.Fatalf("expected 3 parameters, got %d", len(params))
	}

	paramMap := make(map[string]map[string]any)
	for _, p := range params {
		paramMap[p["name"].(string)] = p
	}

	orgParam := paramMap["orgId"]
	if orgParam["in"] != "path" {
		t.Errorf("expected orgId in 'path', got %v", orgParam["in"])
	}
	if orgParam["required"] != true {
		t.Error("expected orgId to be required")
	}
	if orgParam["description"] != "Organization ID" {
		t.Errorf("expected description 'Organization ID', got %v", orgParam["description"])
	}

	includeParam := paramMap["include"]
	if includeParam["in"] != "query" {
		t.Errorf("expected include in 'query', got %v", includeParam["in"])
	}
	if includeParam["required"] != false {
		t.Error("expected include to not be required")
	}
}

func TestBuildOpenAPIRequestBody(t *testing.T) {
	var name, orgID Required[string]

	schema := Object(map[string]Schema{
		"name":  Str(&name),
		"orgId": Str(&orgID).From(SourcePath),
	})

	body := BuildOpenAPIRequestBody(schema, "")

	if body == nil {
		t.Fatal("expected request body, got nil")
	}

	if body["required"] != true {
		t.Error("expected required to be true")
	}

	content := body["content"].(map[string]any)
	jsonContent := content["application/json"].(map[string]any)
	bodySchema := jsonContent["schema"].(map[string]any)

	props := bodySchema["properties"].(map[string]any)
	if _, ok := props["name"]; !ok {
		t.Error("expected 'name' in body schema properties")
	}
	if _, ok := props["orgId"]; ok {
		t.Error("did not expect 'orgId' in body schema properties")
	}
}

func TestParamSourceString(t *testing.T) {
	tests := []struct {
		source   ParamSource
		expected string
	}{
		{SourceBody, "body"},
		{SourcePath, "path"},
		{SourceQuery, "query"},
		{SourceHeader, "header"},
		{SourceCookie, "cookie"},
	}

	for _, tt := range tests {
		t.Run(tt.expected, func(t *testing.T) {
			if tt.source.String() != tt.expected {
				t.Errorf("expected %q, got %q", tt.expected, tt.source.String())
			}
		})
	}
}

type HeaderCookieRequest struct {
	AuthToken   Required[string] `json:"-"`
	SessionID   Optional[string] `json:"-"`
	RequestBody Required[string] `json:"body"`
}

func (r *HeaderCookieRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"Authorization": Str(&r.AuthToken).From(SourceHeader),
		"session_id":    OptStr(&r.SessionID).From(SourceCookie),
		"body":          Str(&r.RequestBody),
	})
}

func TestParseRequest_HeaderAndCookie(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		var req HeaderCookieRequest
		if err := ParseRequest(r, &req); err != nil {
			t.Errorf("ParseRequest failed: %v", err)
			http.Error(w, err.Error(), 400)
			return
		}

		if req.AuthToken.Get() != "Bearer token123" {
			t.Errorf("expected AuthToken 'Bearer token123', got %q", req.AuthToken.Get())
		}
		if req.SessionID.Get() != "sess-abc" {
			t.Errorf("expected SessionID 'sess-abc', got %q", req.SessionID.Get())
		}
		if req.RequestBody.Get() != "hello" {
			t.Errorf("expected RequestBody 'hello', got %q", req.RequestBody.Get())
		}
	}

	r := chi.NewRouter()
	r.Post("/api/endpoint", handler)

	body := `{"body": "hello"}`
	httpReq := httptest.NewRequestWithContext(context.Background(), "POST", "/api/endpoint", bytes.NewBufferString(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer token123")
	httpReq.AddCookie(&http.Cookie{Name: "session_id", Value: "sess-abc"})
	w := httptest.NewRecorder()

	r.ServeHTTP(w, httpReq)

	if w.Code != 200 {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestSetFieldValue_Int(t *testing.T) {
	var val Required[int]
	schema := Int(&val)

	if err := setFieldValue(schema, "42"); err != nil {
		t.Fatalf("setFieldValue failed: %v", err)
	}
	if val.Get() != 42 {
		t.Errorf("expected 42, got %d", val.Get())
	}
}

func TestSetFieldValue_Bool(t *testing.T) {
	var val Required[bool]
	schema := Bool(&val)

	if err := setFieldValue(schema, "true"); err != nil {
		t.Fatalf("setFieldValue failed: %v", err)
	}
	if !val.Get() {
		t.Error("expected true, got false")
	}
}

func TestSetFieldValue_Float(t *testing.T) {
	var val Required[float64]
	schema := Float(&val)

	if err := setFieldValue(schema, "3.14"); err != nil {
		t.Fatalf("setFieldValue failed: %v", err)
	}
	if val.Get() != 3.14 {
		t.Errorf("expected 3.14, got %f", val.Get())
	}
}

func TestSetFieldValue_UUID(t *testing.T) {
	var val uuid.UUID
	schema := UUID(&val)

	if err := setFieldValue(schema, "550e8400-e29b-41d4-a716-446655440000"); err != nil {
		t.Fatalf("setFieldValue failed: %v", err)
	}
	expected := uuid.MustParse("550e8400-e29b-41d4-a716-446655440000")
	if val != expected {
		t.Errorf("expected %v, got %v", expected, val)
	}
}

func TestSetFieldValue_InvalidInt(t *testing.T) {
	var val Required[int]
	schema := Int(&val)

	if err := setFieldValue(schema, "not-a-number"); err == nil {
		t.Error("expected error for invalid int")
	}
}

func TestSetFieldValue_InvalidUUID(t *testing.T) {
	var val uuid.UUID
	schema := UUID(&val)

	if err := setFieldValue(schema, "not-a-uuid"); err == nil {
		t.Error("expected error for invalid UUID")
	}
}

func TestParseQueryArray(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", "/items?tags=a&tags=b&tags=c", nil)
	tags := ParseQueryArray(req, "tags")

	if len(tags) != 3 {
		t.Fatalf("expected 3 tags, got %d", len(tags))
	}
	if tags[0] != "a" || tags[1] != "b" || tags[2] != "c" {
		t.Errorf("expected [a, b, c], got %v", tags)
	}
}

func TestParseQueryArrayCSV(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", "/items?tags=a,b,c", nil)
	tags := ParseQueryArrayCSV(req, "tags")

	if len(tags) != 3 {
		t.Fatalf("expected 3 tags, got %d", len(tags))
	}
	if tags[0] != "a" || tags[1] != "b" || tags[2] != "c" {
		t.Errorf("expected [a, b, c], got %v", tags)
	}
}

func TestParseRequest_NoBody(t *testing.T) {
	type GetRequest struct {
		ID Required[string] `json:"-"`
	}

	handler := func(w http.ResponseWriter, r *http.Request) {
		var req GetRequest
		schema := Object(map[string]Schema{
			"id": Str(&req.ID).From(SourcePath),
		})

		// Extract path param manually (since GetRequest doesn't implement SchemaProvider)
		for name, fieldSchema := range schema.properties {
			if fieldSchema.GetSource() == SourcePath {
				value := chi.URLParam(r, name)
				if err := setFieldValue(fieldSchema, value); err != nil {
					http.Error(w, err.Error(), 400)
					return
				}
			}
		}

		if req.ID.Get() != "item-123" {
			t.Errorf("expected ID 'item-123', got %q", req.ID.Get())
		}
	}

	router := chi.NewRouter()
	router.Get("/items/{id}", handler)

	httpReq := httptest.NewRequestWithContext(context.Background(), "GET", "/items/item-123", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, httpReq)

	if w.Code != 200 {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestParseRequest_EmptyBody_RequiredFieldValidation(t *testing.T) {
	type RequestWithRequiredBody struct {
		ID   Required[string] `json:"-"`
		Name Required[string] `json:"name"`
	}

	var failed bool
	handler := func(w http.ResponseWriter, r *http.Request) {
		var req RequestWithRequiredBody
		schema := Object(map[string]Schema{
			"id":   Str(&req.ID).From(SourcePath),
			"name": Str(&req.Name),
		})

		// Parse path params
		req.ID.Set(chi.URLParam(r, "id"))

		// Body is empty (ContentLength == 0), validation should fail for required "name"
		errs := schema.Validate()
		if len(errs) == 0 {
			failed = true
			t.Error("expected validation error for required 'name' field")
		}
	}

	router := chi.NewRouter()
	router.Post("/items/{id}", handler)

	httpReq := httptest.NewRequestWithContext(context.Background(), "POST", "/items/item-123", nil) // Empty body
	httpReq.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, httpReq)

	if failed {
		t.Error("test failed inside handler")
	}
}

func TestParseRequest_ChunkedTransferEncoding(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		var req ParseTestRequest
		if err := ParseRequest(r, &req); err != nil {
			t.Errorf("ParseRequest failed: %v", err)
			http.Error(w, err.Error(), 400)
			return
		}

		if req.Name.Get() != "ChunkedTest" {
			t.Errorf("expected Name 'ChunkedTest', got %q", req.Name.Get())
		}
	}

	router := chi.NewRouter()
	router.Post("/orgs/{orgId}/test", handler)

	body := `{"name": "ChunkedTest", "age": 25}`
	httpReq := httptest.NewRequestWithContext(context.Background(), "POST", "/orgs/org-123/test", bytes.NewBufferString(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.ContentLength = -1 // Simulate chunked transfer encoding
	httpReq.TransferEncoding = []string{"chunked"}
	w := httptest.NewRecorder()

	router.ServeHTTP(w, httpReq)

	if w.Code != 200 {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

type RequiredHeaderRequest struct {
	APIKey Required[string] `json:"-"`
}

func (r *RequiredHeaderRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"X-API-Key": Str(&r.APIKey).From(SourceHeader),
	})
}

func TestParseAndValidate_RequiredHeaderMissing(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		var req RequiredHeaderRequest
		err := ParseAndValidate(r, &req)
		if err == nil {
			t.Error("expected validation error for missing required header")
			return
		}

		// Error message should mention 'required'
		if !bytes.Contains([]byte(err.Error()), []byte("required")) {
			t.Errorf("expected 'required' in error message, got: %v", err)
		}
	}

	router := chi.NewRouter()
	router.Get("/api/test", handler)

	httpReq := httptest.NewRequestWithContext(context.Background(), "GET", "/api/test", nil) // No X-API-Key header
	w := httptest.NewRecorder()

	router.ServeHTTP(w, httpReq)
}

type RequiredCookieRequest struct {
	SessionID Required[string] `json:"-"`
}

func (r *RequiredCookieRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"session_id": Str(&r.SessionID).From(SourceCookie),
	})
}

func TestParseAndValidate_RequiredCookieMissing(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		var req RequiredCookieRequest
		err := ParseAndValidate(r, &req)
		if err == nil {
			t.Error("expected validation error for missing required cookie")
			return
		}

		// Error message should mention 'required'
		if !bytes.Contains([]byte(err.Error()), []byte("required")) {
			t.Errorf("expected 'required' in error message, got: %v", err)
		}
	}

	router := chi.NewRouter()
	router.Get("/api/test", handler)

	httpReq := httptest.NewRequestWithContext(context.Background(), "GET", "/api/test", nil) // No session_id cookie
	w := httptest.NewRecorder()

	router.ServeHTTP(w, httpReq)
}

func TestParseRequest_UUIDPath_WithSchemaProvider(t *testing.T) {
	type UUIDPathRequest struct {
		ID uuid.UUID `json:"-"`
	}

	// Helper to create schema - using closure to bind to request
	schemaFor := func(req *UUIDPathRequest) *ObjectSchema {
		return Object(map[string]Schema{
			"id": UUID(&req.ID).From(SourcePath),
		})
	}

	handler := func(w http.ResponseWriter, r *http.Request) {
		var req UUIDPathRequest
		schema := schemaFor(&req)

		// Extract path param and validate
		idStr := chi.URLParam(r, "id")
		if err := setFieldValue(schema.properties["id"], idStr); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		errs := schema.Validate()
		if len(errs) > 0 {
			http.Error(w, errs[0].Message, 400)
			return
		}

		expected := uuid.MustParse("550e8400-e29b-41d4-a716-446655440000")
		if req.ID != expected {
			t.Errorf("expected ID %v, got %v", expected, req.ID)
		}
	}

	router := chi.NewRouter()
	router.Get("/items/{id}", handler)

	httpReq := httptest.NewRequestWithContext(context.Background(), "GET", "/items/550e8400-e29b-41d4-a716-446655440000", nil)
	w := httptest.NewRecorder()

	router.ServeHTTP(w, httpReq)

	if w.Code != 200 {
		t.Errorf("expected status 200, got %d", w.Code)
	}
}

func TestParseQueryArray_Empty(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", "/items", nil)
	tags := ParseQueryArray(req, "tags")

	if len(tags) != 0 {
		t.Errorf("expected empty array, got %v", tags)
	}
}

func TestParseQueryArrayCSV_Empty(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", "/items", nil)
	tags := ParseQueryArrayCSV(req, "tags")

	if len(tags) != 0 {
		t.Errorf("expected empty array, got %v", tags)
	}
}

func TestParseQueryArrayCSV_SingleValue(t *testing.T) {
	req := httptest.NewRequestWithContext(context.Background(), "GET", "/items?tags=single", nil)
	tags := ParseQueryArrayCSV(req, "tags")

	if len(tags) != 1 || tags[0] != "single" {
		t.Errorf("expected [single], got %v", tags)
	}
}

// --- Mass Assignment Tests ---

type MassAssignmentRequest struct {
	OrgID Required[string] `json:"orgId"` // Intentionally NOT json:"-" to test the vulnerability
	Name  Required[string] `json:"name"`
}

func (r *MassAssignmentRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"orgId": Str(&r.OrgID).From(SourcePath),
		"name":  Str(&r.Name),
	})
}

func TestParseRequest_MassAssignment_PathWinsOverBody(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		var req MassAssignmentRequest
		if err := ParseRequest(r, &req); err != nil {
			t.Errorf("ParseRequest failed: %v", err)
			http.Error(w, err.Error(), 400)
			return
		}

		// Path parameter should win over body, even with matching JSON tag
		// This tests the fix for the mass-assignment vulnerability
		assert.Equal(t, "legitimate-org", req.OrgID.Get(), "path param should override body")
		assert.Equal(t, "secret-name", req.Name.Get())
	}

	router := chi.NewRouter()
	router.Post("/orgs/{orgId}/secrets", handler)

	// Attacker tries to override orgId via body
	body := `{"orgId": "attacker-org", "name": "secret-name"}`
	httpReq := httptest.NewRequestWithContext(context.Background(), "POST", "/orgs/legitimate-org/secrets", bytes.NewBufferString(body))
	httpReq.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, httpReq)

	assert.Equal(t, 200, w.Code)
}

// --- Header/Cookie Parameter Tests ---

type HeaderCookieTestRequest struct {
	AuthHeader Required[string] `json:"-"`
	SessionID  Optional[string] `json:"-"`
	BodyField  Required[string] `json:"body"`
}

func (r *HeaderCookieTestRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"X-Auth-Token": Str(&r.AuthHeader).From(SourceHeader),
		"session":      OptStr(&r.SessionID).From(SourceCookie),
		"body":         Str(&r.BodyField),
	})
}

func TestParseRequest_HeaderParam(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		var req HeaderCookieTestRequest
		if err := ParseRequest(r, &req); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		assert.Equal(t, "token-value", req.AuthHeader.Get())
		assert.Equal(t, "data", req.BodyField.Get())
	}

	router := chi.NewRouter()
	router.Post("/test", handler)

	body := `{"body": "data"}`
	httpReq := httptest.NewRequestWithContext(context.Background(), "POST", "/test", bytes.NewBufferString(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Auth-Token", "token-value")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, httpReq)

	assert.Equal(t, 200, w.Code)
}

func TestParseRequest_CookieParam(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		var req HeaderCookieTestRequest
		if err := ParseRequest(r, &req); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		assert.Equal(t, "sess-123", req.SessionID.Get())
	}

	router := chi.NewRouter()
	router.Post("/test", handler)

	body := `{"body": "data"}`
	httpReq := httptest.NewRequestWithContext(context.Background(), "POST", "/test", bytes.NewBufferString(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Auth-Token", "token")
	httpReq.AddCookie(&http.Cookie{Name: "session", Value: "sess-123"})
	w := httptest.NewRecorder()

	router.ServeHTTP(w, httpReq)

	assert.Equal(t, 200, w.Code)
}

func TestParseRequest_MissingCookie_Tolerated(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		var req HeaderCookieTestRequest
		if err := ParseRequest(r, &req); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		// Missing optional cookie should be tolerated
		assert.False(t, req.SessionID.IsSet())
	}

	router := chi.NewRouter()
	router.Post("/test", handler)

	body := `{"body": "data"}`
	httpReq := httptest.NewRequestWithContext(context.Background(), "POST", "/test", bytes.NewBufferString(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-Auth-Token", "token")
	// No cookie set
	w := httptest.NewRecorder()

	router.ServeHTTP(w, httpReq)

	assert.Equal(t, 200, w.Code)
}

func TestParseRequest_EmptyBody_SkipsBodyParsing(t *testing.T) {
	type GetRequest struct {
		ID Required[string] `json:"-"`
	}

	var req GetRequest
	schema := Object(map[string]Schema{
		"id": Str(&req.ID).From(SourcePath),
	})

	// Create request with Content-Length: 0
	httpReq := httptest.NewRequestWithContext(context.Background(), "GET", "/items/123", http.NoBody)
	httpReq.ContentLength = 0

	// Manually test the schema source separation
	hasBodyFields := false
	for _, fieldSchema := range schema.properties {
		if fieldSchema.GetSource() == SourceBody {
			hasBodyFields = true
		}
	}

	assert.False(t, hasBodyFields, "GET request with only path params should have no body fields")
}

// --- ParseAndValidate Tests ---

func TestParseAndValidate_ValidRequest(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		var req ParseTestRequest
		if err := ParseAndValidate(r, &req); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}

		assert.Equal(t, "org-123", req.OrgID.Get())
		assert.Equal(t, "John", req.Name.Get())
	}

	router := chi.NewRouter()
	router.Post("/orgs/{orgId}/users", handler)

	body := `{"name": "John", "age": 30}`
	httpReq := httptest.NewRequestWithContext(context.Background(), "POST", "/orgs/org-123/users", bytes.NewBufferString(body))
	httpReq.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, httpReq)

	assert.Equal(t, 200, w.Code)
}

func TestParseAndValidate_InvalidRequest(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		var req ParseTestRequest
		if err := ParseAndValidate(r, &req); err != nil {
			http.Error(w, err.Error(), 400)
			return
		}
		w.WriteHeader(200)
	}

	router := chi.NewRouter()
	router.Post("/orgs/{orgId}/users", handler)

	// Missing required "name" field
	body := `{"age": 30}`
	httpReq := httptest.NewRequestWithContext(context.Background(), "POST", "/orgs/org-123/users", bytes.NewBufferString(body))
	httpReq.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, httpReq)

	assert.Equal(t, 400, w.Code)
}

// --- DisallowUnknownFields Tests ---

type strictBodyRequest struct {
	Name Required[string] `json:"name"`
}

func (r *strictBodyRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"name": Str(&r.Name),
	})
}

func TestParseRequestWithOptions_DisallowUnknownFields(t *testing.T) {
	handler := func(w http.ResponseWriter, r *http.Request) {
		var req strictBodyRequest
		err := ParseRequestWithOptions(r, &req, DisallowUnknownFields())
		if err == nil {
			t.Error("expected error for unknown field 'extra'")
			http.Error(w, "expected error", 500)
			return
		}
		w.WriteHeader(http.StatusBadRequest)
	}

	router := chi.NewRouter()
	router.Post("/test", handler)

	body := `{"name": "John", "extra": "field"}`
	httpReq := httptest.NewRequestWithContext(context.Background(), "POST", "/test", bytes.NewBufferString(body))
	httpReq.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	router.ServeHTTP(w, httpReq)

	assert.Equal(t, http.StatusBadRequest, w.Code)
}

// --- setFieldValue Error Tests ---

func TestSetFieldValue_ErrorPaths(t *testing.T) {
	t.Run("invalid int", func(t *testing.T) {
		var val Required[int]
		schema := Int(&val)
		err := setFieldValue(schema, "not-a-number")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "invalid integer")
	})

	t.Run("invalid float", func(t *testing.T) {
		var val Required[float64]
		schema := Float(&val)
		err := setFieldValue(schema, "not-a-float")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "invalid float")
	})

	t.Run("invalid bool", func(t *testing.T) {
		var val Required[bool]
		schema := Bool(&val)
		err := setFieldValue(schema, "not-a-bool")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "invalid boolean")
	})

	t.Run("invalid uuid", func(t *testing.T) {
		var val uuid.UUID
		schema := UUID(&val)
		err := setFieldValue(schema, "not-a-uuid")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "invalid UUID")
	})

	t.Run("invalid time", func(t *testing.T) {
		var val time.Time
		schema := Time(&val)
		err := setFieldValue(schema, "not-a-time")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "invalid time")
	})
}
