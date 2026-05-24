package api

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- ParseUnionField Tests ---

func TestParseUnionField_ValidDog(t *testing.T) {
	raw := json.RawMessage(`{"type": "dog", "breed": "Labrador"}`)
	var animal Animal

	err := ParseUnionField(raw, &animal, AnimalParser)
	require.NoError(t, err)
	require.NotNil(t, animal)

	dog, ok := animal.(*Dog)
	require.True(t, ok)
	assert.Equal(t, "dog", dog.Type)
	assert.Equal(t, "Labrador", dog.Breed)
}

func TestParseUnionField_ValidCat(t *testing.T) {
	raw := json.RawMessage(`{"type": "cat", "color": "orange"}`)
	var animal Animal

	err := ParseUnionField(raw, &animal, AnimalParser)
	require.NoError(t, err)
	require.NotNil(t, animal)

	cat, ok := animal.(*Cat)
	require.True(t, ok)
	assert.Equal(t, "cat", cat.Type)
	assert.Equal(t, "orange", cat.Color)
}

func TestParseUnionField_Null(t *testing.T) {
	raw := json.RawMessage(`null`)
	var animal Animal

	err := ParseUnionField(raw, &animal, AnimalParser)
	require.NoError(t, err)
	assert.Nil(t, animal)
}

func TestParseUnionField_Empty(t *testing.T) {
	var raw json.RawMessage
	var animal Animal

	err := ParseUnionField(raw, &animal, AnimalParser)
	require.NoError(t, err)
	assert.Nil(t, animal)
}

func TestParseUnionField_UnknownType(t *testing.T) {
	raw := json.RawMessage(`{"type": "bird", "wingspan": 2}`)
	var animal Animal

	err := ParseUnionField(raw, &animal, AnimalParser)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "bird")
}

func TestParseUnionField_InvalidJSON(t *testing.T) {
	raw := json.RawMessage(`{invalid}`)
	var animal Animal

	err := ParseUnionField(raw, &animal, AnimalParser)
	require.Error(t, err)
}

// --- Request with json.RawMessage pattern ---

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
	assert.Equal(t, "Golden Retriever", dog.Breed)
}

func TestParseUnionField_InRequest_NullPet(t *testing.T) {
	data := []byte(`{
		"name": "NoPet",
		"pet": null
	}`)

	var req PetRequest
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	assert.Equal(t, "NoPet", req.Name)
	assert.Nil(t, req.Pet)
}

func TestParseUnionField_InRequest_MissingPet(t *testing.T) {
	data := []byte(`{
		"name": "NoPet"
	}`)

	var req PetRequest
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	assert.Equal(t, "NoPet", req.Name)
	assert.Nil(t, req.Pet)
}

// --- NestedUnionDef Tests ---

// Test types for nested union
type NestedAuthMethod interface {
	Union
	nestedAuthMarker()
}

type PasswordPayload struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

func (p *PasswordPayload) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"username": String(&p.Username).Required().MinLength(1),
		"password": String(&p.Password).Required().MinLength(8),
	})
}

func (p *PasswordPayload) unionMarker()      {}
func (p *PasswordPayload) nestedAuthMarker() {}

type OAuthPayload struct {
	Provider    string `json:"provider"`
	AccessToken string `json:"accessToken"`
}

func (o *OAuthPayload) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"provider":    String(&o.Provider).Required().Enum("google", "github"),
		"accessToken": String(&o.AccessToken).Required(),
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

func TestNestedUnionDef_Parse_Password(t *testing.T) {
	data := json.RawMessage(`{
		"method": "password",
		"payload": {"username": "john", "password": "secret123"}
	}`)

	auth, err := NestedAuthParser.Parse(data)
	require.NoError(t, err)
	require.NotNil(t, auth)

	pwd, ok := auth.(*PasswordPayload)
	require.True(t, ok)
	assert.Equal(t, "john", pwd.Username)
	assert.Equal(t, "secret123", pwd.Password)
}

func TestNestedUnionDef_Parse_OAuth(t *testing.T) {
	data := json.RawMessage(`{
		"method": "oauth",
		"payload": {"provider": "github", "accessToken": "gho_xxx"}
	}`)

	auth, err := NestedAuthParser.Parse(data)
	require.NoError(t, err)
	require.NotNil(t, auth)

	oauth, ok := auth.(*OAuthPayload)
	require.True(t, ok)
	assert.Equal(t, "github", oauth.Provider)
	assert.Equal(t, "gho_xxx", oauth.AccessToken)
}

func TestNestedUnionDef_Parse_Null(t *testing.T) {
	data := json.RawMessage(`null`)

	auth, err := NestedAuthParser.Parse(data)
	require.NoError(t, err)
	assert.Nil(t, auth)
}

func TestNestedUnionDef_Parse_Empty(t *testing.T) {
	var data json.RawMessage

	auth, err := NestedAuthParser.Parse(data)
	require.NoError(t, err)
	assert.Nil(t, auth)
}

func TestNestedUnionDef_Parse_MissingDiscriminator(t *testing.T) {
	data := json.RawMessage(`{
		"payload": {"username": "john", "password": "secret123"}
	}`)

	_, err := NestedAuthParser.Parse(data)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "method")
}

func TestNestedUnionDef_Parse_MissingPayload(t *testing.T) {
	data := json.RawMessage(`{
		"method": "password"
	}`)

	_, err := NestedAuthParser.Parse(data)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "payload")
}

func TestNestedUnionDef_Parse_UnknownType(t *testing.T) {
	data := json.RawMessage(`{
		"method": "saml",
		"payload": {"assertion": "..."}
	}`)

	_, err := NestedAuthParser.Parse(data)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "saml")
}

func TestNestedUnionDef_Parse_InvalidJSON(t *testing.T) {
	data := json.RawMessage(`{invalid}`)

	_, err := NestedAuthParser.Parse(data)
	require.Error(t, err)
}

func TestNestedUnionDef_ParseWithType(t *testing.T) {
	payload := json.RawMessage(`{"username": "jane", "password": "password123"}`)

	auth, err := NestedAuthParser.ParseWithType("password", payload)
	require.NoError(t, err)
	require.NotNil(t, auth)

	pwd, ok := auth.(*PasswordPayload)
	require.True(t, ok)
	assert.Equal(t, "jane", pwd.Username)
}

func TestNestedUnionDef_ParseWithType_UnknownType(t *testing.T) {
	payload := json.RawMessage(`{"data": "..."}`)

	_, err := NestedAuthParser.ParseWithType("unknown", payload)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown")
}

func TestNestedUnionDef_ParseWithType_Null(t *testing.T) {
	payload := json.RawMessage(`null`)

	// Null payload should error since OpenAPI marks it as required
	_, err := NestedAuthParser.ParseWithType("password", payload)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "missing")
}

func TestNestedUnionDef_OpenAPI(t *testing.T) {
	openapi := NestedAuthParser.OpenAPI()

	assert.Equal(t, "object", openapi["type"])

	props, ok := openapi["properties"].(map[string]any)
	require.True(t, ok)

	// Check discriminator field
	methodProp, ok := props["method"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "string", methodProp["type"])

	enumVals, ok := methodProp["enum"].([]string)
	require.True(t, ok)
	assert.Contains(t, enumVals, "password")
	assert.Contains(t, enumVals, "oauth")

	// Check payload field has oneOf
	payloadProp, ok := props["payload"].(map[string]any)
	require.True(t, ok)
	_, hasOneOf := payloadProp["oneOf"]
	assert.True(t, hasOneOf)

	// Check required fields
	required, ok := openapi["required"].([]string)
	require.True(t, ok)
	assert.Contains(t, required, "method")
	assert.Contains(t, required, "payload")
}

// --- ParseNestedUnionField Tests ---

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
	assert.Equal(t, "john", pwd.Username)
	assert.Equal(t, "secret123", pwd.Password)
}

func TestParseNestedUnionField_NullDiscriminator(t *testing.T) {
	data := []byte(`{
		"clientId": "app-123",
		"method": null,
		"payload": {"username": "john", "password": "secret123"}
	}`)

	var req NestedLoginRequest
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	assert.Nil(t, req.Auth) // Discriminator is null, so no auth
}

func TestParseNestedUnionField_MissingDiscriminator(t *testing.T) {
	data := []byte(`{
		"clientId": "app-123",
		"payload": {"username": "john", "password": "secret123"}
	}`)

	var req NestedLoginRequest
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	assert.Nil(t, req.Auth) // Discriminator missing, so no auth
}

// --- Multiple Union Fields Test ---

type MultiUnionRequestHelper struct {
	PetRaw  json.RawMessage  `json:"pet"`
	AuthRaw json.RawMessage  `json:"auth"`
	Pet     Animal           `json:"-"`
	Auth    NestedAuthMethod `json:"-"`
}

func (r *MultiUnionRequestHelper) UnmarshalJSON(data []byte) error {
	type Plain MultiUnionRequestHelper
	if err := json.Unmarshal(data, (*Plain)(r)); err != nil {
		return err
	}

	if err := ParseUnionField(r.PetRaw, &r.Pet, AnimalParser); err != nil {
		return err
	}

	return nil
}

func TestMultipleUnionFields_Helper(t *testing.T) {
	data := []byte(`{
		"pet": {"type": "cat", "color": "black"},
		"auth": null
	}`)

	var req MultiUnionRequestHelper
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	require.NotNil(t, req.Pet)
	cat, ok := req.Pet.(*Cat)
	require.True(t, ok)
	assert.Equal(t, "black", cat.Color)
}
