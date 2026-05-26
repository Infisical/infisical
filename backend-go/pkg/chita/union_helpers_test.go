package chita

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- ParseUnionField Integration Tests (json.RawMessage in request struct) ---

type PetRequest struct {
	Name   string          `json:"name"`
	PetRaw json.RawMessage `json:"pet"`
	Pet    Animal          `json:"-"`
}

func (r *PetRequest) UnmarshalJSON(data []byte) error {
	type Plain PetRequest
	if err := json.Unmarshal(data, (*Plain)(r)); err != nil {
		return err
	}
	return ParseUnionField(r.PetRaw, &r.Pet, AnimalParser)
}

func TestParseUnionField_InRequest(t *testing.T) {
	data := []byte(`{
		"name": "Buddy",
		"pet": {"type": "dog", "breed": "Golden Retriever"}
	}`)

	var req PetRequest
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	assert.Equal(t, "Buddy", req.Name)
	require.NotNil(t, req.Pet)

	dog, ok := req.Pet.(*Dog)
	require.True(t, ok)
	assert.Equal(t, "Golden Retriever", dog.Breed.Get())
}

func TestParseUnionField_InRequest_NullPet(t *testing.T) {
	data := []byte(`{"name": "NoPet", "pet": null}`)

	var req PetRequest
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	assert.Equal(t, "NoPet", req.Name)
	assert.Nil(t, req.Pet)
}

func TestParseUnionField_InRequest_MissingPet(t *testing.T) {
	data := []byte(`{"name": "NoPet"}`)

	var req PetRequest
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	assert.Equal(t, "NoPet", req.Name)
	assert.Nil(t, req.Pet)
}

// --- NestedUnionDef Tests ---

type NestedAuthMethod interface {
	Union
	nestedAuthMarker()
}

type PasswordPayload struct {
	Username Required[string] `json:"username"`
	Password Required[string] `json:"password"`
}

func (p *PasswordPayload) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"username": Str(&p.Username).MinLength(1),
		"password": Str(&p.Password).MinLength(8),
	})
}

func (p *PasswordPayload) unionMarker()      {}
func (p *PasswordPayload) nestedAuthMarker() {}

type OAuthPayload struct {
	Provider    Required[string] `json:"provider"`
	AccessToken Required[string] `json:"accessToken"`
}

func (o *OAuthPayload) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"provider":    Str(&o.Provider).Enum("google", "github"),
		"accessToken": Str(&o.AccessToken),
	})
}

func (o *OAuthPayload) unionMarker()      {}
func (o *OAuthPayload) nestedAuthMarker() {}

var NestedAuthParser = NestedUnionDef[NestedAuthMethod]{
	Discriminator: "method",
	PayloadField:  "payload",
	Variants: map[string]func() NestedAuthMethod{
		"password": func() NestedAuthMethod { return &PasswordPayload{} },
		"oauth":    func() NestedAuthMethod { return &OAuthPayload{} },
	},
}

func TestNestedUnionDef_Parse(t *testing.T) {
	tests := []struct {
		name        string
		data        json.RawMessage
		wantNil     bool
		wantErr     bool
		errContains string
		verify      func(t *testing.T, auth NestedAuthMethod)
	}{
		{
			name: "password",
			data: json.RawMessage(`{"method": "password", "payload": {"username": "john", "password": "secret123"}}`),
			verify: func(t *testing.T, auth NestedAuthMethod) {
				pwd, ok := auth.(*PasswordPayload)
				require.True(t, ok)
				assert.Equal(t, "john", pwd.Username.Get())
			},
		},
		{
			name: "oauth",
			data: json.RawMessage(`{"method": "oauth", "payload": {"provider": "github", "accessToken": "gho_xxx"}}`),
			verify: func(t *testing.T, auth NestedAuthMethod) {
				oauth, ok := auth.(*OAuthPayload)
				require.True(t, ok)
				assert.Equal(t, "github", oauth.Provider.Get())
			},
		},
		{name: "null", data: json.RawMessage(`null`), wantNil: true},
		{name: "empty", data: nil, wantNil: true},
		{name: "missing discriminator", data: json.RawMessage(`{"payload": {}}`), wantErr: true, errContains: "method"},
		{name: "missing payload", data: json.RawMessage(`{"method": "password"}`), wantErr: true, errContains: "payload"},
		{name: "unknown type", data: json.RawMessage(`{"method": "saml", "payload": {}}`), wantErr: true, errContains: "saml"},
		{name: "invalid json", data: json.RawMessage(`{invalid}`), wantErr: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			auth, err := NestedAuthParser.Parse(tt.data)
			if tt.wantErr {
				require.Error(t, err)
				if tt.errContains != "" {
					assert.Contains(t, err.Error(), tt.errContains)
				}
				return
			}
			require.NoError(t, err)
			if tt.wantNil {
				assert.Nil(t, auth)
				return
			}
			require.NotNil(t, auth)
			if tt.verify != nil {
				tt.verify(t, auth)
			}
		})
	}
}

func TestNestedUnionDef_ParseWithType(t *testing.T) {
	t.Run("valid", func(t *testing.T) {
		payload := json.RawMessage(`{"username": "jane", "password": "password123"}`)
		auth, err := NestedAuthParser.ParseWithType("password", payload)
		require.NoError(t, err)
		pwd, ok := auth.(*PasswordPayload)
		require.True(t, ok)
		assert.Equal(t, "jane", pwd.Username.Get())
	})

	t.Run("unknown type", func(t *testing.T) {
		_, err := NestedAuthParser.ParseWithType("unknown", json.RawMessage(`{}`))
		require.Error(t, err)
		assert.Contains(t, err.Error(), "unknown")
	})

	t.Run("null payload", func(t *testing.T) {
		_, err := NestedAuthParser.ParseWithType("password", json.RawMessage(`null`))
		require.Error(t, err)
		assert.Contains(t, err.Error(), "missing")
	})
}

func TestNestedUnionDef_OpenAPI(t *testing.T) {
	openapi := NestedAuthParser.OpenAPI()

	assert.Equal(t, "object", openapi["type"])

	props := openapi["properties"].(map[string]any)
	methodProp := props["method"].(map[string]any)
	assert.Equal(t, "string", methodProp["type"])
	assert.Contains(t, methodProp["enum"].([]string), "password")
	assert.Contains(t, methodProp["enum"].([]string), "oauth")

	payloadProp := props["payload"].(map[string]any)
	_, hasOneOf := payloadProp["oneOf"]
	assert.True(t, hasOneOf)

	required := openapi["required"].([]string)
	assert.Contains(t, required, "method")
	assert.Contains(t, required, "payload")
}

// --- ParseNestedUnionField Integration Tests ---

type NestedLoginRequest struct {
	ClientID   string           `json:"clientId"`
	MethodRaw  json.RawMessage  `json:"method"`
	PayloadRaw json.RawMessage  `json:"payload"`
	Auth       NestedAuthMethod `json:"-"`
}

func (r *NestedLoginRequest) UnmarshalJSON(data []byte) error {
	type Plain NestedLoginRequest
	if err := json.Unmarshal(data, (*Plain)(r)); err != nil {
		return err
	}
	return ParseNestedUnionField(r.MethodRaw, r.PayloadRaw, &r.Auth, NestedAuthParser)
}

func TestParseNestedUnionField_InRequest(t *testing.T) {
	data := []byte(`{
		"clientId": "app-123",
		"method": "password",
		"payload": {"username": "john", "password": "secret123"}
	}`)

	var req NestedLoginRequest
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	assert.Equal(t, "app-123", req.ClientID)
	require.NotNil(t, req.Auth)

	pwd, ok := req.Auth.(*PasswordPayload)
	require.True(t, ok)
	assert.Equal(t, "john", pwd.Username.Get())
}

func TestParseNestedUnionField_NullOrMissingDiscriminator(t *testing.T) {
	tests := []struct {
		name string
		data []byte
	}{
		{"null", []byte(`{"clientId": "app", "method": null, "payload": {}}`)},
		{"missing", []byte(`{"clientId": "app", "payload": {}}`)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var req NestedLoginRequest
			err := json.Unmarshal(tt.data, &req)
			require.NoError(t, err)
			assert.Nil(t, req.Auth)
		})
	}
}

// --- DefaultVariant Tests ---

type DogWithDefault struct {
	UnionBase
	Type  Required[string] `json:"type"`
	Breed Required[string] `json:"breed"`
}

func (d *DogWithDefault) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"type":  Const("dog"),
		"breed": Str(&d.Breed).Default("Unknown"),
	})
}

func (d *DogWithDefault) animalMarker() {}

var AnimalWithDefaultParser = UnionDef[Animal]{
	Discriminator: "type",
	Variants: map[string]func() Animal{
		"dog": func() Animal { return &DogWithDefault{} },
		"cat": func() Animal { return &Cat{} },
	},
}

func TestUnionFromSchema_DefaultVariant(t *testing.T) {
	t.Run("applied when absent", func(t *testing.T) {
		var raw json.RawMessage
		var animal Animal
		schema := UnionFrom(&raw, &animal, AnimalWithDefaultParser).DefaultVariant("dog")

		errs := schema.Validate()
		assert.Empty(t, errs)
		require.NotNil(t, animal)

		dog, ok := animal.(*DogWithDefault)
		require.True(t, ok)
		assert.Equal(t, "Unknown", dog.Breed.Get())
	})

	t.Run("overridden by present value", func(t *testing.T) {
		raw := json.RawMessage(`{"type": "cat", "color": "black"}`)
		var animal Animal
		schema := UnionFrom(&raw, &animal, AnimalWithDefaultParser).DefaultVariant("dog")

		errs := schema.Validate()
		assert.Empty(t, errs)

		cat, ok := animal.(*Cat)
		require.True(t, ok)
		assert.Equal(t, "black", cat.Color.Get())
	})

	t.Run("invalid name errors", func(t *testing.T) {
		var raw json.RawMessage
		var animal Animal
		schema := UnionFrom(&raw, &animal, AnimalWithDefaultParser).DefaultVariant("fish")

		errs := schema.Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "invalid_default", errs[0].Code)
	})

	t.Run("openapi includes default", func(t *testing.T) {
		var raw json.RawMessage
		var animal Animal
		schema := UnionFrom(&raw, &animal, AnimalWithDefaultParser).DefaultVariant("dog")

		openapi := schema.OpenAPI()
		defaultVal := openapi["default"].(map[string]any)
		assert.Equal(t, "dog", defaultVal["type"])
	})
}

func TestUnionFromSchema_Required_NoDefault_Fails(t *testing.T) {
	var raw json.RawMessage
	var animal Animal
	schema := UnionFrom(&raw, &animal, AnimalParser).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "required", errs[0].Code)
}
