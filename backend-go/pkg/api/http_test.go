package api

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// =============================================================================
// Request / response types
//
// Each type focuses on one schema feature. They are wired into a single shared
// test server (setupTestServer) so every integration case is a row in TestHTTP.
// =============================================================================

// --- Body validation (mixed) ---

type SimpleRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
	Count int    `json:"count"`
}

func (r *SimpleRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"name":  String(&r.Name).Required().MinLength(2).MaxLength(50),
		"email": String(&r.Email).Required().Email(),
		"count": Int(&r.Count).Optional().Min(0).Max(1000),
	}).Title("SimpleRequest")
}

type SimpleResponse struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
	Count int    `json:"count"`
}

func (r *SimpleResponse) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"id":    String(&r.ID).Required(),
		"name":  String(&r.Name).Required(),
		"email": String(&r.Email).Required(),
		"count": Int(&r.Count).Optional(),
	}).Title("SimpleResponse")
}

func (*SimpleResponse) Status() int { return http.StatusOK }

// CreatedSimpleResponse for 201 responses
type CreatedSimpleResponse struct {
	SimpleResponse
}

func (*CreatedSimpleResponse) Status() int { return http.StatusCreated }

// --- Path + query (no body) ---

type GetItemRequest struct {
	ID          string `json:"-"`
	Page        int    `json:"-"`
	PageSize    int    `json:"-"`
	Search      string `json:"-"`
	StatusField string `json:"-"`
}

func (r *GetItemRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"id":       String(&r.ID).From(SourcePath).Required().UUID(),
		"page":     Int(&r.Page).From(SourceQuery).Optional().Min(1).Default(1),
		"pageSize": Int(&r.PageSize).From(SourceQuery).Optional().Min(1).Max(100).Default(20),
		"search":   String(&r.Search).From(SourceQuery).Optional().MaxLength(100),
		"status":   String(&r.StatusField).From(SourceQuery).Optional().Enum("active", "inactive", "pending"),
	}).Title("GetItemRequest")
}

// --- Full mixed request: body + path + query + header ---

type FullRequest struct {
	ID          string    `json:"-"`
	Page        int       `json:"-"`
	PageSize    int       `json:"-"`
	RequestID   string    `json:"-"`
	Name        string    `json:"name"`
	Email       string    `json:"email"`
	Age         int       `json:"age"`
	Score       float64   `json:"score"`
	IsActive    bool      `json:"isActive"`
	Tags        []string  `json:"tags"`
	ResourceID  uuid.UUID `json:"resourceId"`
	Description string    `json:"description"`
}

func (r *FullRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"id":           String(&r.ID).From(SourcePath).Required().UUID(),
		"page":         Int(&r.Page).From(SourceQuery).Optional().Min(1).Default(1),
		"pageSize":     Int(&r.PageSize).From(SourceQuery).Optional().Min(1).Max(100).Default(20),
		"X-Request-ID": String(&r.RequestID).From(SourceHeader).Optional().UUID(),

		"name":        String(&r.Name).Required().MinLength(1).MaxLength(100),
		"email":       String(&r.Email).Required().Email(),
		"age":         Int(&r.Age).Optional().Min(0).Max(150),
		"score":       Float(&r.Score).Optional().Min(0).Max(100),
		"isActive":    Bool(&r.IsActive).Optional(),
		"tags":        Array(String(nil)).Optional().MinItems(0).MaxItems(10),
		"resourceId":  UUID(&r.ResourceID).Optional(),
		"description": String(&r.Description).Optional().MaxLength(500),
	}).Title("FullRequest")
}

type FullResponse struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	Email       string   `json:"email"`
	Page        int      `json:"page"`
	PageSize    int      `json:"pageSize"`
	Search      string   `json:"search,omitempty"`
	StatusField string   `json:"status,omitempty"`
	Tags        []string `json:"tags,omitempty"`
}

func (r *FullResponse) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"id":       String(&r.ID).Required(),
		"name":     String(&r.Name).Required(),
		"email":    String(&r.Email).Required(),
		"page":     Int(&r.Page).Required(),
		"pageSize": Int(&r.PageSize).Required(),
		"search":   String(&r.Search).Optional(),
		"status":   String(&r.StatusField).Optional(),
		"tags":     Array(String(nil)).Optional(),
	}).Title("FullResponse")
}

func (*FullResponse) Status() int { return http.StatusOK }

// --- Path only ---

type DeleteItemRequest struct {
	ID string `json:"-"`
}

func (r *DeleteItemRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"id": String(&r.ID).From(SourcePath).Required().UUID(),
	}).Title("DeleteItemRequest")
}

// Deleted is a no-content response (204)
type Deleted struct{}

func (Deleted) Schema() *ObjectSchema { return nil }
func (Deleted) Status() int           { return http.StatusNoContent }

// --- Path source for error type dispatch ---

type ErrorTypeRequest struct {
	ErrorType string `json:"-"`
}

func (r *ErrorTypeRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"type": String(&r.ErrorType).From(SourcePath).Required(),
	}).Title("ErrorTypeRequest")
}

// OKStatus is a simple OK response
type OKStatus struct {
	StatusMsg string `json:"status"`
}

func (r *OKStatus) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"status": String(&r.StatusMsg).Required(),
	})
}

func (*OKStatus) Status() int { return http.StatusOK }

// --- Cookies ---

type CookieRequest struct {
	SessionID string `json:"-"`
	UserID    string `json:"-"`
}

func (r *CookieRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"session_id": String(&r.SessionID).From(SourceCookie).Required(),
		"user_id":    String(&r.UserID).From(SourceCookie).Optional(),
	}).Title("CookieRequest")
}

type CookieResponse struct {
	SessionID string `json:"sessionId"`
	UserID    string `json:"userId"`
}

func (r *CookieResponse) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"sessionId": String(&r.SessionID).Required(),
		"userId":    String(&r.UserID).Optional(),
	})
}

func (*CookieResponse) Status() int { return http.StatusOK }

// --- Date query param ---

type TimeQueryRequest struct {
	ID        string `json:"-"`
	StartDate string `json:"-"`
}

func (r *TimeQueryRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"id":        String(&r.ID).From(SourcePath).Required().UUID(),
		"startDate": String(&r.StartDate).From(SourceQuery).Optional().Description("Start date in YYYY-MM-DD format"),
	}).Title("TimeQueryRequest")
}

type TimeResponse struct {
	ID        string `json:"id"`
	StartDate string `json:"startDate,omitempty"`
}

func (r *TimeResponse) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"id":        String(&r.ID).Required(),
		"startDate": String(&r.StartDate).Optional(),
	})
}

func (*TimeResponse) Status() int { return http.StatusOK }

// --- Pattern validation ---

type PatternRequest struct {
	Code      string `json:"code"`
	Phone     string `json:"phone"`
	SlugField string `json:"slug"`
}

func (r *PatternRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"code":  String(&r.Code).Required().Pattern(`^[A-Z]{3}-\d{4}$`).Description("Format: XXX-0000"),
		"phone": String(&r.Phone).Optional().Pattern(`^\+\d{1,3}-\d{3}-\d{3}-\d{4}$`),
		"slug":  String(&r.SlugField).Optional().Pattern(`^[a-z0-9]+(?:-[a-z0-9]+)*$`),
	}).Title("PatternRequest")
}

func (*PatternRequest) Status() int { return http.StatusOK }

// --- URL/URI format ---

type URLRequest struct {
	Website     string `json:"website"`
	Callback    string `json:"callback"`
	ResourceURI string `json:"resourceUri"`
}

func (r *URLRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"website":     String(&r.Website).Required().URL(),
		"callback":    String(&r.Callback).Optional().URL(),
		"resourceUri": String(&r.ResourceURI).Optional().URI(),
	}).Title("URLRequest")
}

func (*URLRequest) Status() int { return http.StatusOK }

// --- Float validation ---

type MeasurementRequest struct {
	Temperature float64 `json:"temperature"`
	Humidity    float64 `json:"humidity"`
	Pressure    float64 `json:"pressure"`
}

func (r *MeasurementRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"temperature": Float(&r.Temperature).Required().Min(-273.15).Max(1000),
		"humidity":    Float(&r.Humidity).Optional().Min(0).Max(100),
		"pressure":    Float(&r.Pressure).Optional().Min(0),
	}).Title("MeasurementRequest")
}

func (*MeasurementRequest) Status() int { return http.StatusOK }

// --- Array with custom validation ---

type TagsRequest struct {
	Name string   `json:"name"`
	Tags []string `json:"tags"`
}

func (r *TagsRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"name": String(&r.Name).Required(),
		"tags": Array(String(nil)).
			Required().
			MinItems(1).
			MaxItems(5).
			Description("At least 1, at most 5 tags").
			ValidateFn(func() []ValidationError {
				var errs []ValidationError
				if len(r.Tags) < 1 {
					errs = append(errs, ValidationError{Code: "min_items", Message: "must have at least 1 tag"})
				}
				if len(r.Tags) > 5 {
					errs = append(errs, ValidationError{Code: "max_items", Message: "must have at most 5 tags"})
				}
				return errs
			}).
			IsPresentFn(func() bool { return len(r.Tags) > 0 }),
	}).Title("TagsRequest")
}

func (*TagsRequest) Status() int { return http.StatusOK }

// --- Nested object ---

type CreateOrderRequest struct {
	CustomerName    string `json:"customerName"`
	ShippingAddress struct {
		Street  string `json:"street"`
		City    string `json:"city"`
		ZipCode string `json:"zipCode"`
		Country string `json:"country"`
	} `json:"shippingAddress"`
}

func (r *CreateOrderRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"customerName": String(&r.CustomerName).Required().MinLength(1),
		"shippingAddress": Object(map[string]Schema{
			"street":  String(&r.ShippingAddress.Street).Required().MinLength(1).MaxLength(200),
			"city":    String(&r.ShippingAddress.City).Required().MinLength(1).MaxLength(100),
			"zipCode": String(&r.ShippingAddress.ZipCode).Required().Pattern(`^\d{5}(-\d{4})?$`),
			"country": String(&r.ShippingAddress.Country).Required().Enum("US", "CA", "UK", "DE"),
		}).Required(),
	}).Title("CreateOrderRequest")
}

func (*CreateOrderRequest) Status() int { return http.StatusOK }

// --- Nullable fields bound to actual pointer struct fields ---

type NullableRequest struct {
	Name     string  `json:"name"`
	Nickname *string `json:"nickname"`
	Age      *int    `json:"age"`
}

func (r *NullableRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"name":     String(&r.Name).Required(),
		"nickname": String(r.Nickname).Optional().Nullable(),
		"age":      Int(r.Age).Optional().Nullable().Min(0),
	}).Title("NullableRequest")
}

type NullableResponse struct {
	Name        string `json:"name"`
	HasNickname bool   `json:"hasNickname"`
	HasAge      bool   `json:"hasAge"`
}

func (r *NullableResponse) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"name":        String(&r.Name).Required(),
		"hasNickname": Bool(&r.HasNickname).Required(),
		"hasAge":      Bool(&r.HasAge).Required(),
	})
}

func (*NullableResponse) Status() int { return http.StatusOK }

// --- Context echo (reads headers, sets headers / cookies) ---

type ContextRequest struct {
	Data string `json:"data"`
}

func (r *ContextRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"data": String(&r.Data).Optional(),
	}).Title("ContextRequest")
}

type ContextResponse struct {
	ReceivedHeader string `json:"receivedHeader"`
	Data           string `json:"data"`
}

func (r *ContextResponse) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"receivedHeader": String(&r.ReceivedHeader).Optional(),
		"data":           String(&r.Data).Optional(),
	})
}

func (*ContextResponse) Status() int { return http.StatusOK }

// --- Discriminated union ---

type PetUnion interface {
	Union
	petMarker()
}

type DogPet struct {
	UnionBase
	Type  string `json:"type"`
	Name  string `json:"name"`
	Breed string `json:"breed"`
}

func (d *DogPet) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"type":  String(&d.Type).Required(),
		"name":  String(&d.Name).Required().MinLength(1),
		"breed": String(&d.Breed).Required().MinLength(1),
	}).Title("DogPet")
}
func (d *DogPet) unionMarker() {}
func (d *DogPet) petMarker()   {}

type CatPet struct {
	UnionBase
	Type   string `json:"type"`
	Name   string `json:"name"`
	Indoor bool   `json:"indoor"`
}

func (c *CatPet) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"type":   String(&c.Type).Required(),
		"name":   String(&c.Name).Required().MinLength(1),
		"indoor": Bool(&c.Indoor).Optional(),
	}).Title("CatPet")
}
func (c *CatPet) unionMarker() {}
func (c *CatPet) petMarker()   {}

var PetUnionDef = UnionDef[PetUnion]{
	Discriminator: "type",
	Variants: map[string]func() PetUnion{
		"dog": func() PetUnion { return &DogPet{} },
		"cat": func() PetUnion { return &CatPet{} },
	},
}

type AdoptPetRequest struct {
	AdopterName string   `json:"adopterName"`
	Pet         PetUnion `json:"-"`
}

func (r *AdoptPetRequest) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"adopterName": String(&r.AdopterName).Required().MinLength(1),
		"pet":         UnionField(&r.Pet, PetUnionDef).Required(),
	}).Title("AdoptPetRequest")
}

func (r *AdoptPetRequest) UnmarshalJSON(data []byte) error {
	type plain AdoptPetRequest
	if err := json.Unmarshal(data, (*plain)(r)); err != nil {
		return err
	}
	return ParseUnions(data, U("pet", &r.Pet, PetUnionDef))
}

type AdoptResponse struct {
	Adopter string `json:"adopter"`
	PetType string `json:"petType"`
	PetName string `json:"petName"`
}

func (r *AdoptResponse) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"adopter": String(&r.Adopter).Required(),
		"petType": String(&r.PetType).Required(),
		"petName": String(&r.PetName).Required(),
	})
}

func (*AdoptResponse) Status() int { return http.StatusCreated }

// --- Multi-status response types ---

type ProcessResult interface {
	TypedResponse
	processMarker()
}

type ProcessOK struct {
	StatusMsg string `json:"status"`
}

func (r *ProcessOK) Schema() *ObjectSchema {
	return Object(map[string]Schema{"status": String(&r.StatusMsg).Required()})
}
func (*ProcessOK) Status() int    { return http.StatusOK }
func (*ProcessOK) processMarker() {}

type ProcessCreated struct {
	ID string `json:"id"`
}

func (r *ProcessCreated) Schema() *ObjectSchema {
	return Object(map[string]Schema{"id": String(&r.ID).Required()})
}
func (*ProcessCreated) Status() int    { return http.StatusCreated }
func (*ProcessCreated) processMarker() {}

type ProcessAccepted struct {
	StatusMsg string `json:"status"`
}

func (r *ProcessAccepted) Schema() *ObjectSchema {
	return Object(map[string]Schema{"status": String(&r.StatusMsg).Required()})
}
func (*ProcessAccepted) Status() int    { return http.StatusAccepted }
func (*ProcessAccepted) processMarker() {}

type ProcessNoContent struct{}

func (*ProcessNoContent) Schema() *ObjectSchema { return nil }
func (*ProcessNoContent) Status() int           { return http.StatusNoContent }
func (*ProcessNoContent) processMarker()        {}

type ProcessCustom struct {
	StatusMsg string `json:"status"`
}

func (r *ProcessCustom) Schema() *ObjectSchema {
	return Object(map[string]Schema{"status": String(&r.StatusMsg).Required()})
}
func (*ProcessCustom) Status() int    { return 207 }
func (*ProcessCustom) processMarker() {}

// --- Health response ---

type HealthResponse struct {
	StatusMsg string `json:"status"`
}

func (r *HealthResponse) Schema() *ObjectSchema {
	return Object(map[string]Schema{"status": String(&r.StatusMsg).Required()})
}
func (*HealthResponse) Status() int { return http.StatusOK }

// =============================================================================
// Handlers
//
// One generic echo for the "just bounce the parsed request back" cases.
// Custom handlers only for the things that need server-side behavior
// (errors, status codes, header/cookie writes).
// =============================================================================

func errorByName(_ context.Context, req *SimpleRequest) (OKStatus, error) {
	switch req.Name {
	case "conflict":
		return OKStatus{}, Conflict("item %s already exists", req.Name)
	case "notfound":
		return OKStatus{}, NotFound("item not found")
	case "forbidden":
		return OKStatus{}, Forbidden("access denied")
	}
	return OKStatus{StatusMsg: "ok"}, nil
}

func errorByType(_ context.Context, req *ErrorTypeRequest) (OKStatus, error) {
	switch req.ErrorType {
	case "bad-request":
		return OKStatus{}, BadRequest("invalid input")
	case "unauthorized":
		return OKStatus{}, Unauthorized("not authenticated")
	case "forbidden":
		return OKStatus{}, Forbidden("access denied")
	case "not-found":
		return OKStatus{}, NotFound("resource not found")
	case "conflict":
		return OKStatus{}, Conflict("resource already exists")
	case "unprocessable":
		return OKStatus{}, UnprocessableEntity("cannot process")
	case "rate-limit":
		return OKStatus{}, RateLimit("too many requests")
	case "internal":
		return OKStatus{}, InternalServer("something broke")
	case "database":
		return OKStatus{}, DatabaseErr("db connection failed")
	case "gateway-timeout":
		return OKStatus{}, GatewayTimeout("upstream timeout")
	}
	return OKStatus{StatusMsg: "ok"}, nil
}

func statusByName(_ context.Context, req *SimpleRequest) (ProcessResult, error) {
	switch req.Name {
	case "create":
		return &ProcessCreated{ID: "new-id"}, nil
	case "accepted":
		return &ProcessAccepted{StatusMsg: "processing"}, nil
	case "nocontent":
		return &ProcessNoContent{}, nil
	case "custom":
		return &ProcessCustom{StatusMsg: "multi-status"}, nil
	}
	return &ProcessOK{StatusMsg: "ok"}, nil
}

func contextEcho(ctx context.Context, req *ContextRequest) (ContextResponse, error) {
	httpCtx := HTTP(ctx)
	if httpCtx == nil {
		return ContextResponse{}, InternalServer("no http context")
	}
	customHeader := httpCtx.Header("X-Custom-Header")
	httpCtx.SetHeader("X-Response-Header", "response-value")
	httpCtx.SetCookie(&http.Cookie{Name: "test_cookie", Value: "cookie-value"})
	return ContextResponse{ReceivedHeader: customHeader, Data: req.Data}, nil
}

func getItemEcho(_ context.Context, req *GetItemRequest) (FullResponse, error) {
	return FullResponse{
		ID:          req.ID,
		Name:        "Test Item",
		Email:       "test@example.com",
		Page:        req.Page,
		PageSize:    req.PageSize,
		Search:      req.Search,
		StatusField: req.StatusField,
	}, nil
}

func updateItemEcho(_ context.Context, req *FullRequest) (FullResponse, error) {
	return FullResponse{
		ID:       req.ID,
		Name:     req.Name,
		Email:    req.Email,
		Page:     req.Page,
		PageSize: req.PageSize,
		Tags:     req.Tags,
	}, nil
}

func deleteItemEcho(_ context.Context, _ *DeleteItemRequest) (Deleted, error) {
	return Deleted{}, nil
}

func createItem(_ context.Context, req *SimpleRequest) (CreatedSimpleResponse, error) {
	return CreatedSimpleResponse{
		SimpleResponse: SimpleResponse{
			ID:    uuid.New().String(),
			Name:  req.Name,
			Email: req.Email,
			Count: req.Count,
		},
	}, nil
}

func cookieEcho(_ context.Context, req *CookieRequest) (CookieResponse, error) {
	return CookieResponse{SessionID: req.SessionID, UserID: req.UserID}, nil
}

func timeEcho(_ context.Context, req *TimeQueryRequest) (TimeResponse, error) {
	return TimeResponse{ID: req.ID, StartDate: req.StartDate}, nil
}

func adoptEcho(_ context.Context, req *AdoptPetRequest) (AdoptResponse, error) {
	var petType, petName string
	switch p := req.Pet.(type) {
	case *DogPet:
		petType, petName = "dog", p.Name
	case *CatPet:
		petType, petName = "cat", p.Name
	}
	return AdoptResponse{
		Adopter: req.AdopterName,
		PetType: petType,
		PetName: petName,
	}, nil
}

func nullableEcho(_ context.Context, req *NullableRequest) (NullableResponse, error) {
	return NullableResponse{
		Name:        req.Name,
		HasNickname: req.Nickname != nil,
		HasAge:      req.Age != nil,
	}, nil
}

func patternEcho(_ context.Context, req *PatternRequest) (PatternRequest, error) {
	return *req, nil
}

func urlEcho(_ context.Context, req *URLRequest) (URLRequest, error) {
	return *req, nil
}

func measurementEcho(_ context.Context, req *MeasurementRequest) (MeasurementRequest, error) {
	return *req, nil
}

func tagsEcho(_ context.Context, req *TagsRequest) (TagsRequest, error) {
	return *req, nil
}

func orderEcho(_ context.Context, req *CreateOrderRequest) (CreateOrderRequest, error) {
	return *req, nil
}

func healthHandler(_ context.Context, _ *EmptyRequest) (HealthResponse, error) {
	return HealthResponse{StatusMsg: "healthy"}, nil
}

// =============================================================================
// Shared server setup
// =============================================================================

func testErrorHandler(_ context.Context, err error) *ErrorBody {
	if apiErr, ok := AsError(err); ok {
		return &ErrorBody{
			StatusCode: apiErr.Status,
			Message:    apiErr.Message,
			Error:      apiErr.Name,
			Details:    apiErr.Details,
		}
	}
	if validationErrs, ok := AsValidationErrors(err); ok {
		return &ErrorBody{
			StatusCode: 400,
			Message:    "Validation failed",
			Error:      "ValidationError",
			Details:    validationErrs,
		}
	}
	return &ErrorBody{StatusCode: 500, Message: "Internal server error", Error: "InternalServerError"}
}

func setupTestServer(t *testing.T) (*httptest.Server, *Router) {
	t.Helper()
	app := NewApp(AppConfig{ErrorHandler: testErrorHandler})

	r := NewRouter(RouterConfig{App: app})

	// --- Body validation ---
	r.POST("/items", Handler(app, createItem).
		Summary("Create item").
		OperationID("createItem").
		Tags("Items"))

	// --- Path + query (no body) ---
	r.GET("/items/{id}", Handler(app, getItemEcho).
		Summary("Get item").
		OperationID("getItem").
		Tags("Items"))

	// --- Path + query + header + body ---
	r.PUT("/items/{id}", Handler(app, updateItemEcho).
		Summary("Update item").
		OperationID("updateItem").
		Tags("Items"))

	// --- Path only / no content response ---
	r.DELETE("/items/{id}", Handler(app, deleteItemEcho).
		Summary("Delete item").
		OperationID("deleteItem").
		Tags("Items"))

	// --- Application errors ---
	r.POST("/error", Handler(app, errorByName).
		Summary("Trigger error by name").
		Tags("Errors"))

	r.GET("/error/{type}", Handler(app, errorByType).
		Summary("Trigger error by type").
		Tags("Errors"))

	// --- Schema features ---
	r.POST("/codes", Handler(app, patternEcho).Tags("Schema"))
	r.POST("/links", Handler(app, urlEcho).Tags("Schema"))
	r.POST("/measurements", Handler(app, measurementEcho).Tags("Schema"))
	r.POST("/tagged", Handler(app, tagsEcho).Tags("Schema"))
	r.POST("/orders", Handler(app, orderEcho).Tags("Orders"))
	r.POST("/nullable", Handler(app, nullableEcho).Tags("Schema"))
	r.POST("/adopt", Handler(app, adoptEcho).Tags("Pets"))

	// --- Cookie source ---
	r.GET("/session", Handler(app, cookieEcho).Tags("Session"))

	// --- Date query ---
	r.GET("/events/{id}", Handler(app, timeEcho).Tags("Events"))

	// --- Status codes (multi-status) ---
	r.POST("/process", InterfaceHandler(app, statusByName).
		Tags("Process").
		Responses(&ProcessOK{}, &ProcessCreated{}, &ProcessAccepted{}, &ProcessNoContent{}, &ProcessCustom{}))

	// --- HTTPContext ---
	r.POST("/context-test", Handler(app, contextEcho).Tags("Context"))

	// --- Health ---
	r.GET("/health", Handler(app, healthHandler).Tags("Health"))

	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return srv, r
}

// =============================================================================
// HTTP helpers
// =============================================================================

// m is a shorthand for inline JSON bodies in the test table.
type m = map[string]any

// do issues an HTTP request and reads the full body. The response body is
// auto-closed via t.Cleanup, so callers don't have to.
func do(t *testing.T, srv *httptest.Server, method, path string, body any, headers map[string]string, cookies []*http.Cookie) (resp *http.Response, respBody []byte) {
	t.Helper()

	var reader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		require.NoError(t, err)
		reader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(context.Background(), method, srv.URL+path, reader)
	require.NoError(t, err)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	for k, v := range headers {
		req.Header.Set(k, v)
	}
	for _, c := range cookies {
		req.AddCookie(c)
	}

	resp, err = http.DefaultClient.Do(req)
	require.NoError(t, err)
	t.Cleanup(func() { _ = resp.Body.Close() })

	respBody, err = io.ReadAll(resp.Body)
	require.NoError(t, err)

	return resp, respBody
}

// assertFieldError checks that the response body contains a validation error
// targeting the named field. Order-insensitive.
func assertFieldError(t *testing.T, body []byte, field string) {
	t.Helper()

	var errBody ErrorBody
	require.NoError(t, json.Unmarshal(body, &errBody), "body: %s", string(body))

	details, _ := errBody.Details.([]any)
	require.NotEmpty(t, details, "expected validation details, body: %s", string(body))

	for _, d := range details {
		if dm, _ := d.(map[string]any); dm != nil && dm["field"] == field {
			return
		}
	}
	t.Errorf("expected validation error for field %q, got: %s", field, string(body))
}

// jsonBody decodes a JSON body into the requested type.
func jsonBody[T any](t *testing.T, body []byte) T {
	t.Helper()
	var v T
	require.NoError(t, json.Unmarshal(body, &v), "body: %s", string(body))
	return v
}

// =============================================================================
// TestHTTP — one table over every integration case
// =============================================================================

func TestHTTP(t *testing.T) {
	server, _ := setupTestServer(t)

	validUUID := uuid.New().String()
	longName := string(make([]byte, 51))

	tests := []struct {
		name          string
		method        string
		path          string
		body          any
		headers       map[string]string
		cookies       []*http.Cookie
		wantStatus    int
		wantField     string // optional: assert validation error has this field
		wantErrorName string // optional: assert error body's "error" field
		verify        func(t *testing.T, resp *http.Response, body []byte)
	}{
		// --- body validation ---
		{name: "body/missing required name", method: "POST", path: "/items", body: m{"email": "x@y.z"}, wantStatus: 400, wantField: "name"},
		{name: "body/invalid email format", method: "POST", path: "/items", body: m{"name": "Test", "email": "not-an-email"}, wantStatus: 400, wantField: "email"},
		{name: "body/name too short", method: "POST", path: "/items", body: m{"name": "A", "email": "test@example.com"}, wantStatus: 400, wantField: "name"},
		{name: "body/name too long", method: "POST", path: "/items", body: m{"name": longName, "email": "test@example.com"}, wantStatus: 400, wantField: "name"},
		{name: "body/count below minimum", method: "POST", path: "/items", body: m{"name": "Test", "email": "test@example.com", "count": -1}, wantStatus: 400, wantField: "count"},
		{name: "body/count above maximum", method: "POST", path: "/items", body: m{"name": "Test", "email": "test@example.com", "count": 1001}, wantStatus: 400, wantField: "count"},
		{name: "body/valid simple request", method: "POST", path: "/items", body: m{"name": "Test Item", "email": "test@example.com", "count": 42}, wantStatus: 201,
			verify: func(t *testing.T, _ *http.Response, body []byte) {
				r := jsonBody[map[string]any](t, body)
				assert.Equal(t, "Test Item", r["name"])
				assert.Equal(t, "test@example.com", r["email"])
				assert.Equal(t, float64(42), r["count"])
			}},

		// --- path / query ---
		{name: "path/invalid uuid", method: "GET", path: "/items/not-a-uuid", wantStatus: 400},
		{name: "query/invalid enum", method: "GET", path: "/items/" + validUUID + "?status=invalid", wantStatus: 400},
		{name: "query/defaults applied", method: "GET", path: "/items/" + validUUID, wantStatus: 200,
			verify: func(t *testing.T, _ *http.Response, body []byte) {
				r := jsonBody[map[string]any](t, body)
				assert.Equal(t, float64(1), r["page"])
				assert.Equal(t, float64(20), r["pageSize"])
			}},
		{name: "query/all params honored", method: "GET", path: "/items/" + validUUID + "?page=5&pageSize=50&search=test&status=active", wantStatus: 200,
			verify: func(t *testing.T, _ *http.Response, body []byte) {
				r := jsonBody[map[string]any](t, body)
				assert.Equal(t, float64(5), r["page"])
				assert.Equal(t, float64(50), r["pageSize"])
				assert.Equal(t, "test", r["search"])
				assert.Equal(t, "active", r["status"])
			}},
		{name: "query/partial defaults", method: "GET", path: "/items/" + validUUID + "?page=3", wantStatus: 200,
			verify: func(t *testing.T, _ *http.Response, body []byte) {
				r := jsonBody[map[string]any](t, body)
				assert.Equal(t, float64(3), r["page"])
				assert.Equal(t, float64(20), r["pageSize"])
			}},

		// --- full request ---
		{name: "full/valid PUT with body+query", method: "PUT", path: "/items/" + validUUID + "?page=2",
			body:       m{"name": "Updated", "email": "updated@example.com", "tags": []string{"tag1", "tag2"}},
			wantStatus: 200,
			verify: func(t *testing.T, _ *http.Response, body []byte) {
				r := jsonBody[map[string]any](t, body)
				assert.Equal(t, "Updated", r["name"])
				assert.Equal(t, float64(2), r["page"])
			}},

		// --- delete / no content ---
		{name: "delete/returns 204", method: "DELETE", path: "/items/" + validUUID, wantStatus: 204},

		// --- application errors via body name ---
		{name: "app-err/conflict", method: "POST", path: "/error", body: m{"name": "conflict", "email": "test@example.com"}, wantStatus: 409,
			verify: func(t *testing.T, _ *http.Response, body []byte) {
				e := jsonBody[ErrorBody](t, body)
				assert.Equal(t, "Conflict", e.Error)
				assert.Equal(t, "item conflict already exists", e.Message)
			}},
		{name: "app-err/not found", method: "POST", path: "/error", body: m{"name": "notfound", "email": "test@example.com"}, wantStatus: 404,
			verify: func(t *testing.T, _ *http.Response, body []byte) {
				assert.Equal(t, "NotFound", jsonBody[ErrorBody](t, body).Error)
			}},
		{name: "app-err/forbidden", method: "POST", path: "/error", body: m{"name": "forbidden", "email": "test@example.com"}, wantStatus: 403,
			verify: func(t *testing.T, _ *http.Response, body []byte) {
				assert.Equal(t, "ForbiddenError", jsonBody[ErrorBody](t, body).Error)
			}},

		// --- application errors via path-source dispatch ---
		{name: "err-type/bad-request", method: "GET", path: "/error/bad-request", wantStatus: 400, wantErrorName: "BadRequest"},
		{name: "err-type/unauthorized", method: "GET", path: "/error/unauthorized", wantStatus: 401, wantErrorName: "UnauthorizedError"},
		{name: "err-type/forbidden", method: "GET", path: "/error/forbidden", wantStatus: 403, wantErrorName: "ForbiddenError"},
		{name: "err-type/not-found", method: "GET", path: "/error/not-found", wantStatus: 404, wantErrorName: "NotFound"},
		{name: "err-type/conflict", method: "GET", path: "/error/conflict", wantStatus: 409, wantErrorName: "Conflict"},
		{name: "err-type/unprocessable", method: "GET", path: "/error/unprocessable", wantStatus: 422, wantErrorName: "UnprocessableEntity"},
		{name: "err-type/rate-limit", method: "GET", path: "/error/rate-limit", wantStatus: 429, wantErrorName: "RateLimitExceeded"},
		{name: "err-type/internal", method: "GET", path: "/error/internal", wantStatus: 500, wantErrorName: "InternalServerError"},
		{name: "err-type/database", method: "GET", path: "/error/database", wantStatus: 500, wantErrorName: "DatabaseError"},
		{name: "err-type/gateway-timeout", method: "GET", path: "/error/gateway-timeout", wantStatus: 504, wantErrorName: "GatewayTimeoutError"},

		// --- pattern ---
		{name: "pattern/valid code", method: "POST", path: "/codes", body: m{"code": "ABC-1234"}, wantStatus: 200},
		{name: "pattern/lowercase code", method: "POST", path: "/codes", body: m{"code": "abc-1234"}, wantStatus: 400, wantField: "code"},
		{name: "pattern/wrong format", method: "POST", path: "/codes", body: m{"code": "ABCD-123"}, wantStatus: 400, wantField: "code"},
		{name: "pattern/valid phone", method: "POST", path: "/codes", body: m{"code": "ABC-1234", "phone": "+1-555-123-4567"}, wantStatus: 200},
		{name: "pattern/valid slug", method: "POST", path: "/codes", body: m{"code": "ABC-1234", "slug": "my-awesome-post"}, wantStatus: 200},
		{name: "pattern/invalid slug (uppercase)", method: "POST", path: "/codes", body: m{"code": "ABC-1234", "slug": "My-Post"}, wantStatus: 400, wantField: "slug"},

		// --- URL ---
		{name: "url/valid https", method: "POST", path: "/links", body: m{"website": "https://example.com"}, wantStatus: 200},
		{name: "url/valid http with path+query", method: "POST", path: "/links", body: m{"website": "http://example.com/path?query=1"}, wantStatus: 200},
		{name: "url/no scheme", method: "POST", path: "/links", body: m{"website": "example.com"}, wantStatus: 400, wantField: "website"},
		{name: "url/no host", method: "POST", path: "/links", body: m{"website": "https://"}, wantStatus: 400, wantField: "website"},
		{name: "url/relative uri", method: "POST", path: "/links", body: m{"website": "https://example.com", "resourceUri": "/api/v1/users"}, wantStatus: 200},

		// --- floats ---
		{name: "float/valid measurements", method: "POST", path: "/measurements", body: m{"temperature": 25.5, "humidity": 60.0, "pressure": 1013.25}, wantStatus: 200},
		{name: "float/below absolute zero", method: "POST", path: "/measurements", body: m{"temperature": -300.0}, wantStatus: 400, wantField: "temperature"},
		{name: "float/humidity over 100", method: "POST", path: "/measurements", body: m{"temperature": 20.0, "humidity": 150.0}, wantStatus: 400, wantField: "humidity"},
		{name: "float/negative pressure", method: "POST", path: "/measurements", body: m{"temperature": 20.0, "pressure": -10.0}, wantStatus: 400, wantField: "pressure"},

		// --- arrays ---
		{name: "array/valid tags", method: "POST", path: "/tagged", body: m{"name": "Item", "tags": []string{"go", "api", "test"}}, wantStatus: 200},
		{name: "array/empty tags", method: "POST", path: "/tagged", body: m{"name": "Item", "tags": []string{}}, wantStatus: 400, wantField: "tags"},
		{name: "array/too many tags", method: "POST", path: "/tagged", body: m{"name": "Item", "tags": []string{"a", "b", "c", "d", "e", "f"}}, wantStatus: 400, wantField: "tags"},
		{name: "array/missing tags", method: "POST", path: "/tagged", body: m{"name": "Item"}, wantStatus: 400, wantField: "tags"},

		// --- nested object ---
		{name: "nested/valid order", method: "POST", path: "/orders",
			body: m{
				"customerName": "John Doe",
				"shippingAddress": m{
					"street": "123 Main St", "city": "New York", "zipCode": "10001", "country": "US",
				},
			},
			wantStatus: 200},
		{name: "nested/missing required nested field", method: "POST", path: "/orders",
			body: m{
				"customerName": "John Doe",
				"shippingAddress": m{
					"street": "123 Main St", "city": "New York", "country": "US",
				},
			},
			wantStatus: 400, wantField: "shippingAddress.zipCode"},
		{name: "nested/invalid nested enum", method: "POST", path: "/orders",
			body: m{
				"customerName": "John Doe",
				"shippingAddress": m{
					"street": "123 Main St", "city": "Tokyo", "zipCode": "12345", "country": "JP",
				},
			},
			wantStatus: 400, wantField: "shippingAddress.country"},
		{name: "nested/invalid nested pattern", method: "POST", path: "/orders",
			body: m{
				"customerName": "John Doe",
				"shippingAddress": m{
					"street": "123 Main St", "city": "NYC", "zipCode": "ABCDE", "country": "US",
				},
			},
			wantStatus: 400, wantField: "shippingAddress.zipCode"},

		// --- cookies ---
		{name: "cookie/both present", method: "GET", path: "/session", wantStatus: 200,
			cookies: []*http.Cookie{
				{Name: "session_id", Value: "sess-123"},
				{Name: "user_id", Value: "user-456"},
			},
			verify: func(t *testing.T, _ *http.Response, body []byte) {
				r := jsonBody[map[string]string](t, body)
				assert.Equal(t, "sess-123", r["sessionId"])
				assert.Equal(t, "user-456", r["userId"])
			}},
		{name: "cookie/required missing", method: "GET", path: "/session", wantStatus: 400},

		// --- time query ---
		{name: "time/with date query param", method: "GET", path: "/events/" + validUUID + "?startDate=2024-01-15", wantStatus: 200,
			verify: func(t *testing.T, _ *http.Response, body []byte) {
				r := jsonBody[map[string]any](t, body)
				assert.Equal(t, "2024-01-15", r["startDate"])
			}},
		{name: "time/without optional query", method: "GET", path: "/events/" + validUUID, wantStatus: 200},

		// --- status codes ---
		{name: "status/created", method: "POST", path: "/process", body: m{"name": "create", "email": "test@example.com"}, wantStatus: 201},
		{name: "status/accepted", method: "POST", path: "/process", body: m{"name": "accepted", "email": "test@example.com"}, wantStatus: 202},
		{name: "status/no content", method: "POST", path: "/process", body: m{"name": "nocontent", "email": "test@example.com"}, wantStatus: 204},
		{name: "status/custom 207", method: "POST", path: "/process", body: m{"name": "custom", "email": "test@example.com"}, wantStatus: 207},
		{name: "status/default 200", method: "POST", path: "/process", body: m{"name": "other", "email": "test@example.com"}, wantStatus: 200},

		// --- HTTPContext ---
		{name: "ctx/reads header / sets header+cookie", method: "POST", path: "/context-test",
			body:       m{"data": "test"},
			headers:    map[string]string{"X-Custom-Header": "custom-value"},
			wantStatus: 200,
			verify: func(t *testing.T, resp *http.Response, body []byte) {
				assert.Equal(t, "response-value", resp.Header.Get("X-Response-Header"))
				var foundCookie bool
				for _, c := range resp.Cookies() {
					if c.Name == "test_cookie" && c.Value == "cookie-value" {
						foundCookie = true
					}
				}
				assert.True(t, foundCookie, "should have set test_cookie")
				r := jsonBody[map[string]string](t, body)
				assert.Equal(t, "custom-value", r["receivedHeader"])
			}},

		// --- discriminated union ---
		{name: "union/adopt dog", method: "POST", path: "/adopt",
			body: m{
				"adopterName": "John",
				"pet":         m{"type": "dog", "name": "Buddy", "breed": "Golden Retriever"},
			},
			wantStatus: 201,
			verify: func(t *testing.T, _ *http.Response, body []byte) {
				r := jsonBody[map[string]string](t, body)
				assert.Equal(t, "dog", r["petType"])
				assert.Equal(t, "Buddy", r["petName"])
			}},
		{name: "union/adopt cat", method: "POST", path: "/adopt",
			body: m{
				"adopterName": "Jane",
				"pet":         m{"type": "cat", "name": "Whiskers", "indoor": true},
			},
			wantStatus: 201,
			verify: func(t *testing.T, _ *http.Response, body []byte) {
				assert.Equal(t, "cat", jsonBody[map[string]string](t, body)["petType"])
			}},
		{name: "union/unknown pet type returns 500", method: "POST", path: "/adopt",
			body:       m{"adopterName": "Bob", "pet": m{"type": "fish", "name": "Nemo"}},
			wantStatus: 500},
		{name: "union/missing pet field", method: "POST", path: "/adopt",
			body:       m{"adopterName": "Alice"},
			wantStatus: 400, wantField: "pet"},

		// --- nullable ---
		{name: "nullable/all fields present", method: "POST", path: "/nullable",
			body:       m{"name": "John", "nickname": "Johnny", "age": 30},
			wantStatus: 200,
			verify: func(t *testing.T, _ *http.Response, body []byte) {
				r := jsonBody[map[string]any](t, body)
				assert.Equal(t, true, r["hasNickname"])
				assert.Equal(t, true, r["hasAge"])
			}},
		{name: "nullable/optional fields omitted", method: "POST", path: "/nullable",
			body:       m{"name": "John"},
			wantStatus: 200,
			verify: func(t *testing.T, _ *http.Response, body []byte) {
				r := jsonBody[map[string]any](t, body)
				assert.Equal(t, false, r["hasNickname"])
				assert.Equal(t, false, r["hasAge"])
			}},
		{name: "nullable/optional fields explicit null", method: "POST", path: "/nullable",
			body:       m{"name": "John", "nickname": nil, "age": nil},
			wantStatus: 200,
			verify: func(t *testing.T, _ *http.Response, body []byte) {
				r := jsonBody[map[string]any](t, body)
				assert.Equal(t, false, r["hasNickname"])
				assert.Equal(t, false, r["hasAge"])
			}},
		{name: "nullable/age below minimum", method: "POST", path: "/nullable",
			body:       m{"name": "John", "age": -5},
			wantStatus: 400, wantField: "age"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			//nolint:bodyclose // Response body is closed by do() via t.Cleanup
			resp, body := do(t, server, tt.method, tt.path, tt.body, tt.headers, tt.cookies)

			assert.Equal(t, tt.wantStatus, resp.StatusCode, "body: %s", string(body))

			if tt.wantField != "" {
				assertFieldError(t, body, tt.wantField)
			}
			if tt.wantErrorName != "" {
				assert.Equal(t, tt.wantErrorName, jsonBody[ErrorBody](t, body).Error)
			}
			if tt.verify != nil {
				tt.verify(t, resp, body)
			}
		})
	}
}
