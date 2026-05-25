package chita

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Test Union Types ---

type Animal interface {
	Union
	animalMarker()
}

type Dog struct {
	Type  string `json:"type"`
	Breed string `json:"breed"`
}

func (d *Dog) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"type":  String(&d.Type).Required(),
		"breed": String(&d.Breed).Required().MinLength(1),
	})
}

func (d *Dog) unionMarker()  {}
func (d *Dog) animalMarker() {}

type Cat struct {
	Type  string `json:"type"`
	Color string `json:"color"`
}

func (c *Cat) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"type":  String(&c.Type).Required(),
		"color": String(&c.Color).Required().MinLength(1),
	})
}

func (c *Cat) unionMarker()  {}
func (c *Cat) animalMarker() {}

var AnimalParser = UnionDef[Animal]{
	Discriminator: "type",
	Variants: map[string]func() Animal{
		"dog": func() Animal { return &Dog{} },
		"cat": func() Animal { return &Cat{} },
	},
}

// --- UnionDef.Parse Tests ---

func TestUnionDef_Parse_Dog(t *testing.T) {
	data := json.RawMessage(`{"type": "dog", "breed": "Labrador"}`)

	animal, err := AnimalParser.Parse(data)
	require.NoError(t, err)
	require.NotNil(t, animal)

	dog, ok := animal.(*Dog)
	require.True(t, ok)
	assert.Equal(t, "dog", dog.Type)
	assert.Equal(t, "Labrador", dog.Breed)
}

func TestUnionDef_Parse_Cat(t *testing.T) {
	data := json.RawMessage(`{"type": "cat", "color": "orange"}`)

	animal, err := AnimalParser.Parse(data)
	require.NoError(t, err)
	require.NotNil(t, animal)

	cat, ok := animal.(*Cat)
	require.True(t, ok)
	assert.Equal(t, "cat", cat.Type)
	assert.Equal(t, "orange", cat.Color)
}

func TestUnionDef_Parse_UnknownType(t *testing.T) {
	data := json.RawMessage(`{"type": "bird", "wingspan": 2}`)

	_, err := AnimalParser.Parse(data)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "unknown type value")
	assert.Contains(t, err.Error(), "bird")
}

func TestUnionDef_Parse_MissingDiscriminator(t *testing.T) {
	data := json.RawMessage(`{"breed": "Labrador"}`)

	_, err := AnimalParser.Parse(data)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "missing discriminator")
}

func TestUnionDef_Parse_InvalidJSON(t *testing.T) {
	data := json.RawMessage(`{invalid}`)

	_, err := AnimalParser.Parse(data)
	require.Error(t, err)
}

func TestUnionDef_Parse_Null(t *testing.T) {
	data := json.RawMessage(`null`)

	animal, err := AnimalParser.Parse(data)
	require.NoError(t, err)
	assert.Nil(t, animal)
}

func TestUnionDef_Parse_Empty(t *testing.T) {
	var data json.RawMessage

	animal, err := AnimalParser.Parse(data)
	require.NoError(t, err)
	assert.Nil(t, animal)
}

// --- Custom Discriminator Field ---

type Vehicle interface {
	Union
	vehicleMarker()
}

type Car struct {
	Kind  string `json:"kind"`
	Doors int    `json:"doors"`
}

func (c *Car) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"kind":  String(&c.Kind).Required(),
		"doors": Int(&c.Doors).Required(),
	})
}

func (c *Car) unionMarker()   {}
func (c *Car) vehicleMarker() {}

type Bike struct {
	Kind  string `json:"kind"`
	Gears int    `json:"gears"`
}

func (b *Bike) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"kind":  String(&b.Kind).Required(),
		"gears": Int(&b.Gears).Required(),
	})
}

func (b *Bike) unionMarker()   {}
func (b *Bike) vehicleMarker() {}

var VehicleParser = UnionDef[Vehicle]{
	Discriminator: "kind",
	Variants: map[string]func() Vehicle{
		"car":  func() Vehicle { return &Car{} },
		"bike": func() Vehicle { return &Bike{} },
	},
}

func TestUnionDef_Parse_CustomDiscriminator(t *testing.T) {
	data := json.RawMessage(`{"kind": "car", "doors": 4}`)

	vehicle, err := VehicleParser.Parse(data)
	require.NoError(t, err)

	car, ok := vehicle.(*Car)
	require.True(t, ok)
	assert.Equal(t, "car", car.Kind)
	assert.Equal(t, 4, car.Doors)
}

// --- ParseUnions Helper Tests ---

type CreatePetRequest struct {
	Name   string `json:"name"`
	Animal Animal `json:"-"`
}

func (r *CreatePetRequest) UnmarshalJSON(data []byte) error {
	type Plain CreatePetRequest
	if err := json.Unmarshal(data, (*Plain)(r)); err != nil {
		return err
	}
	return ParseUnions(data,
		U("animal", &r.Animal, AnimalParser),
	)
}

func TestParseUnions_SingleField(t *testing.T) {
	data := []byte(`{
		"name": "Buddy",
		"animal": {"type": "dog", "breed": "Golden Retriever"}
	}`)

	var req CreatePetRequest
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	assert.Equal(t, "Buddy", req.Name)
	require.NotNil(t, req.Animal)

	dog, ok := req.Animal.(*Dog)
	require.True(t, ok)
	assert.Equal(t, "Golden Retriever", dog.Breed)
}

func TestParseUnions_NullField(t *testing.T) {
	data := []byte(`{
		"name": "NoAnimal",
		"animal": null
	}`)

	var req CreatePetRequest
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	assert.Equal(t, "NoAnimal", req.Name)
	assert.Nil(t, req.Animal)
}

func TestParseUnions_MissingField(t *testing.T) {
	data := []byte(`{
		"name": "NoAnimal"
	}`)

	var req CreatePetRequest
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	assert.Equal(t, "NoAnimal", req.Name)
	assert.Nil(t, req.Animal)
}

func TestParseUnions_InvalidUnion(t *testing.T) {
	data := []byte(`{
		"name": "Invalid",
		"animal": {"type": "unknown"}
	}`)

	var req CreatePetRequest
	err := json.Unmarshal(data, &req)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "animal")
}

// --- Multiple Union Fields ---

type MultiUnionRequest struct {
	Pet     Animal  `json:"-"`
	Vehicle Vehicle `json:"-"`
}

func (r *MultiUnionRequest) UnmarshalJSON(data []byte) error {
	return ParseUnions(data,
		U("pet", &r.Pet, AnimalParser),
		U("vehicle", &r.Vehicle, VehicleParser),
	)
}

func TestParseUnions_MultipleFields(t *testing.T) {
	data := []byte(`{
		"pet": {"type": "cat", "color": "black"},
		"vehicle": {"kind": "bike", "gears": 21}
	}`)

	var req MultiUnionRequest
	err := json.Unmarshal(data, &req)
	require.NoError(t, err)

	cat, ok := req.Pet.(*Cat)
	require.True(t, ok)
	assert.Equal(t, "black", cat.Color)

	bike, ok := req.Vehicle.(*Bike)
	require.True(t, ok)
	assert.Equal(t, 21, bike.Gears)
}

// --- UnionDef.OpenAPI Tests ---

func TestUnionDef_OpenAPI(t *testing.T) {
	openapi := AnimalParser.OpenAPI()

	oneOf, ok := openapi["oneOf"].([]map[string]any)
	require.True(t, ok)
	assert.Len(t, oneOf, 2)

	disc, ok := openapi["discriminator"].(map[string]any)
	require.True(t, ok)
	assert.Equal(t, "type", disc["propertyName"])
	// mapping is omitted for inline schemas
	_, hasMapping := disc["mapping"]
	assert.False(t, hasMapping)
}

// --- UnionSchema Tests ---

func TestUnionSchema_Validate_Required(t *testing.T) {
	var animal Animal
	schema := UnionField(&animal, AnimalParser).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "required", errs[0].Code)
}

func TestUnionSchema_Validate_Optional(t *testing.T) {
	var animal Animal
	schema := UnionField(&animal, AnimalParser).Optional()

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestUnionSchema_Validate_WithValue(t *testing.T) {
	dog := &Dog{Type: "dog", Breed: "Poodle"}
	var animal Animal = dog
	schema := UnionField(&animal, AnimalParser).Required()

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestUnionSchema_Validate_InvalidValue(t *testing.T) {
	dog := &Dog{Type: "dog", Breed: ""} // Breed is required, minlength 1
	var animal Animal = dog
	schema := UnionField(&animal, AnimalParser).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "required", errs[0].Code)
}

func TestUnionSchema_OpenAPI(t *testing.T) {
	var animal Animal
	schema := UnionField(&animal, AnimalParser).
		Required().
		Title("Pet").
		Description("The animal").
		Deprecated().
		Nullable()

	openapi := schema.OpenAPI()

	assert.NotNil(t, openapi["oneOf"])
	assert.NotNil(t, openapi["discriminator"])
	assert.Equal(t, "Pet", openapi["title"])
	assert.Equal(t, "The animal", openapi["description"])
	assert.Equal(t, true, openapi["deprecated"])
	assert.Equal(t, true, openapi["nullable"])
}

func TestUnionSchema_IsRequired(t *testing.T) {
	var animal Animal
	schema := UnionField(&animal, AnimalParser).Required()
	assert.True(t, schema.IsRequired())

	schema = UnionField(&animal, AnimalParser).Optional()
	assert.False(t, schema.IsRequired())
}

// --- Nested Union Tests ---

type NestedAnimal interface {
	Union
	nestedAnimalMarker()
}

type WildDog struct {
	Type   string `json:"type"`
	Breed  string `json:"breed"`
	Region string `json:"region"`
}

func (w *WildDog) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"type":   String(&w.Type).Required(),
		"breed":  String(&w.Breed).Required(),
		"region": String(&w.Region).Required(),
	})
}

func (w *WildDog) unionMarker()        {}
func (w *WildDog) nestedAnimalMarker() {}

type DomesticDog struct {
	Type  string `json:"type"`
	Breed string `json:"breed"`
	Owner string `json:"owner"`
}

func (d *DomesticDog) Schema() *ObjectSchema {
	return Object(map[string]Schema{
		"type":  String(&d.Type).Required(),
		"breed": String(&d.Breed).Required(),
		"owner": String(&d.Owner).Required(),
	})
}

func (d *DomesticDog) unionMarker()        {}
func (d *DomesticDog) nestedAnimalMarker() {}

var NestedDogParser = UnionDef[NestedAnimal]{
	Discriminator: "type",
	Variants: map[string]func() NestedAnimal{
		"wild":     func() NestedAnimal { return &WildDog{} },
		"domestic": func() NestedAnimal { return &DomesticDog{} },
	},
}

type Shelter struct {
	Name   string       `json:"name"`
	Animal NestedAnimal `json:"-"`
}

func (s *Shelter) UnmarshalJSON(data []byte) error {
	type Plain Shelter
	if err := json.Unmarshal(data, (*Plain)(s)); err != nil {
		return err
	}
	return ParseUnions(data,
		U("animal", &s.Animal, NestedDogParser),
	)
}

func TestNestedUnion_Parse(t *testing.T) {
	data := []byte(`{
		"name": "Happy Paws",
		"animal": {"type": "wild", "breed": "Wolf", "region": "Alaska"}
	}`)

	var shelter Shelter
	err := json.Unmarshal(data, &shelter)
	require.NoError(t, err)

	assert.Equal(t, "Happy Paws", shelter.Name)

	wild, ok := shelter.Animal.(*WildDog)
	require.True(t, ok)
	assert.Equal(t, "Wolf", wild.Breed)
	assert.Equal(t, "Alaska", wild.Region)
}
