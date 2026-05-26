package chita

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- OneOfSchemas Validation Tests ---

func TestOneOfSchemas_Validate_NonePresent_Required(t *testing.T) {
	var strVal Required[string]
	var intVal Required[int]

	schema := OneOfSchemas(
		Str(&strVal),
		Int(&intVal),
	).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "oneOf", errs[0].Code)
	assert.Contains(t, errs[0].Message, "exactly one")
}

func TestOneOfSchemas_Validate_NonePresent_Optional(t *testing.T) {
	var strVal Required[string]
	var intVal Required[int]

	schema := OneOfSchemas(
		Str(&strVal),
		Int(&intVal),
	).Optional()

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestOneOfSchemas_Validate_OnePresent(t *testing.T) {
	strVal := NewRequired("hello")
	var intVal Required[int]

	schema := OneOfSchemas(
		Str(&strVal).MinLength(1),
		Int(&intVal),
	).Required()

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestOneOfSchemas_Validate_MultiplePresent(t *testing.T) {
	strVal := NewRequired("hello")
	intVal := NewRequired(42)

	schema := OneOfSchemas(
		Str(&strVal),
		Int(&intVal),
	).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "oneOf", errs[0].Code)
	assert.Contains(t, errs[0].Message, "only one")
}

func TestOneOfSchemas_Validate_PresentButInvalid(t *testing.T) {
	strVal := NewRequired("hi") // Too short for minLength(5)

	schema := OneOfSchemas(
		Str(&strVal).MinLength(5),
	).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "min_length", errs[0].Code)
}

func TestOneOfSchemas_Validate_WithObjects(t *testing.T) {
	type SecretReference struct {
		SecretID Required[string]
		Version  Required[int]
	}

	var plaintext Required[string]
	ref := SecretReference{SecretID: NewRequired("abc-123"), Version: NewRequired(1)}

	schema := OneOfSchemas(
		Str(&plaintext).Description("Raw value"),
		Object(map[string]Schema{
			"secretId": Str(&ref.SecretID),
			"version":  Int(&ref.Version),
		}).Description("Reference"),
	).Required()

	errs := schema.Validate()
	assert.Empty(t, errs) // Object is present (secretId is set)
}

func TestOneOfSchemas_OpenAPI(t *testing.T) {
	var strVal Required[string]
	var intVal Required[int]

	schema := OneOfSchemas(
		Str(&strVal).Description("String option"),
		Int(&intVal).Description("Int option"),
	).Title("FlexValue").Description("Either string or int")

	openapi := schema.OpenAPI()

	oneOf, ok := openapi["oneOf"].([]map[string]any)
	require.True(t, ok)
	assert.Len(t, oneOf, 2)

	assert.Equal(t, "FlexValue", openapi["title"])
	assert.Equal(t, "Either string or int", openapi["description"])

	_, hasDiscriminator := openapi["discriminator"]
	assert.False(t, hasDiscriminator)
}

// --- AnyOf Validation Tests ---

func TestAnyOf_Validate_NonePresent_Required(t *testing.T) {
	var email Required[string]
	var slack Required[string]

	schema := AnyOf(
		Str(&email),
		Str(&slack),
	).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "anyOf", errs[0].Code)
	assert.Contains(t, errs[0].Message, "at least one")
}

func TestAnyOf_Validate_NonePresent_Optional(t *testing.T) {
	var email Required[string]
	var slack Required[string]

	schema := AnyOf(
		Str(&email),
		Str(&slack),
	).Optional()

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestAnyOf_Validate_OnePresent(t *testing.T) {
	email := NewRequired("test@example.com")
	var slack Required[string]

	schema := AnyOf(
		Str(&email).Email(),
		Str(&slack),
	).Required()

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestAnyOf_Validate_MultiplePresent(t *testing.T) {
	email := NewRequired("test@example.com")
	slack := NewRequired("#channel")

	schema := AnyOf(
		Str(&email).Email(),
		Str(&slack).MinLength(1),
	).Required()

	errs := schema.Validate()
	assert.Empty(t, errs) // Multiple present is OK for anyOf
}

func TestAnyOf_Validate_MultiplePresent_OneInvalid(t *testing.T) {
	email := NewRequired("invalid-email") // Invalid email format
	slack := NewRequired("#channel")

	schema := AnyOf(
		Str(&email).Email(),
		Str(&slack).MinLength(1),
	).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "format", errs[0].Code) // Email validation failed
}

func TestAnyOf_Validate_WithObjects(t *testing.T) {
	type EmailConfig struct {
		To      Required[string]
		Subject Required[string]
	}
	type SlackConfig struct {
		Channel Required[string]
	}

	email := EmailConfig{To: NewRequired("test@example.com"), Subject: NewRequired("Alert")}
	var slack SlackConfig // Empty

	schema := AnyOf(
		Object(map[string]Schema{
			"to":      Str(&email.To).Email(),
			"subject": Str(&email.Subject),
		}),
		Object(map[string]Schema{
			"channel": Str(&slack.Channel),
		}),
	).Required()

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestAnyOf_OpenAPI(t *testing.T) {
	var email Required[string]
	var slack Required[string]

	schema := AnyOf(
		Str(&email).Description("Email config"),
		Str(&slack).Description("Slack config"),
	).Title("NotificationConfig").Description("At least one channel")

	openapi := schema.OpenAPI()

	anyOf, ok := openapi["anyOf"].([]map[string]any)
	require.True(t, ok)
	assert.Len(t, anyOf, 2)

	assert.Equal(t, "NotificationConfig", openapi["title"])
	assert.Equal(t, "At least one channel", openapi["description"])
}

// --- AllOf Validation Tests ---

func TestAllOf_Validate_AllValid(t *testing.T) {
	name := NewRequired("John")
	age := NewRequired(25)

	schema := AllOf(
		Object(map[string]Schema{
			"name": Str(&name).MinLength(1),
		}),
		Object(map[string]Schema{
			"age": Int(&age).Min(0),
		}),
	)

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestAllOf_Validate_OneInvalid(t *testing.T) {
	var name Required[string] // Not set - invalid
	age := NewRequired(25)

	schema := AllOf(
		Object(map[string]Schema{
			"name": Str(&name).MinLength(1),
		}),
		Object(map[string]Schema{
			"age": Int(&age).Min(0),
		}),
	)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "name", errs[0].Field)
}

func TestAllOf_Validate_MultipleInvalid(t *testing.T) {
	var name Required[string] // Not set
	age := NewRequired(-10)   // Invalid - min 0

	schema := AllOf(
		Object(map[string]Schema{
			"name": Str(&name).MinLength(1),
		}),
		Object(map[string]Schema{
			"age": Int(&age).Min(0),
		}),
	)

	errs := schema.Validate()
	assert.Len(t, errs, 2)
}

// --- Real-world Use Case Tests ---

func TestOneOf_SecretValue_UseCase(t *testing.T) {
	t.Run("plaintext provided", func(t *testing.T) {
		plaintext := NewRequired("my-secret-value")

		schema := OneOfSchemas(
			Str(&plaintext),
		).Required()

		errs := schema.Validate()
		assert.Empty(t, errs)
	})

	t.Run("neither provided", func(t *testing.T) {
		var plaintext Required[string]

		schema := OneOfSchemas(
			Str(&plaintext),
		).Required()

		errs := schema.Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "oneOf", errs[0].Code)
	})
}

func TestAnyOf_NotificationConfig_UseCase(t *testing.T) {
	t.Run("one channel configured", func(t *testing.T) {
		email := NewRequired("ops@example.com")
		var slack Required[string]
		var webhook Required[string]

		schema := AnyOf(
			Str(&email).Email(),
			Str(&slack),
			Str(&webhook),
		).Required()

		errs := schema.Validate()
		assert.Empty(t, errs)
	})

	t.Run("multiple channels configured", func(t *testing.T) {
		email := NewRequired("ops@example.com")
		slack := NewRequired("#alerts")
		var webhook Required[string]

		schema := AnyOf(
			Str(&email).Email(),
			Str(&slack).MinLength(1),
			Str(&webhook),
		).Required()

		errs := schema.Validate()
		assert.Empty(t, errs)
	})

	t.Run("no channels configured", func(t *testing.T) {
		var email Required[string]
		var slack Required[string]
		var webhook Required[string]

		schema := AnyOf(
			Str(&email),
			Str(&slack),
			Str(&webhook),
		).Required()

		errs := schema.Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "anyOf", errs[0].Code)
	})
}
