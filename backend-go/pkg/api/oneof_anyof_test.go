package api

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- OneOfSchemas Validation Tests ---

func TestOneOfSchemas_Validate_NonePresent_Required(t *testing.T) {
	strVal := ""
	var intPtr *int

	schema := OneOfSchemas(
		String(&strVal),
		Int(intPtr),
	).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "oneOf", errs[0].Code)
	assert.Contains(t, errs[0].Message, "exactly one")
}

func TestOneOfSchemas_Validate_NonePresent_Optional(t *testing.T) {
	strVal := ""
	var intPtr *int

	schema := OneOfSchemas(
		String(&strVal),
		Int(intPtr),
	).Optional()

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestOneOfSchemas_Validate_OnePresent(t *testing.T) {
	strVal := "hello"
	var intPtr *int

	schema := OneOfSchemas(
		String(&strVal).MinLength(1),
		Int(intPtr),
	).Required()

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestOneOfSchemas_Validate_MultiplePresent(t *testing.T) {
	strVal := "hello"
	intVal := 42

	schema := OneOfSchemas(
		String(&strVal),
		Int(&intVal),
	).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "oneOf", errs[0].Code)
	assert.Contains(t, errs[0].Message, "only one")
}

func TestOneOfSchemas_Validate_PresentButInvalid(t *testing.T) {
	strVal := "hi" // Too short for minLength(5)

	schema := OneOfSchemas(
		String(&strVal).MinLength(5),
	).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "min_length", errs[0].Code)
}

func TestOneOfSchemas_Validate_WithObjects(t *testing.T) {
	// Simulate: either plaintext OR reference
	type SecretReference struct {
		SecretID string
		Version  int
	}

	plaintext := ""
	ref := SecretReference{SecretID: "abc-123", Version: 1}

	schema := OneOfSchemas(
		String(&plaintext).Description("Raw value"),
		Object(map[string]Schema{
			"secretId": String(&ref.SecretID).Required(),
			"version":  Int(&ref.Version).Required(),
		}).Description("Reference"),
	).Required()

	errs := schema.Validate()
	assert.Empty(t, errs) // Object is present (secretId is non-empty)
}

func TestOneOfSchemas_OpenAPI(t *testing.T) {
	strVal := ""
	intVal := 0

	schema := OneOfSchemas(
		String(&strVal).Description("String option"),
		Int(&intVal).Description("Int option"),
	).Title("FlexValue").Description("Either string or int")

	openapi := schema.OpenAPI()

	oneOf, ok := openapi["oneOf"].([]map[string]any)
	require.True(t, ok)
	assert.Len(t, oneOf, 2)

	assert.Equal(t, "FlexValue", openapi["title"])
	assert.Equal(t, "Either string or int", openapi["description"])

	// Should NOT have discriminator for simple oneOf
	_, hasDiscriminator := openapi["discriminator"]
	assert.False(t, hasDiscriminator)
}

// --- AnyOf Validation Tests ---

func TestAnyOf_Validate_NonePresent_Required(t *testing.T) {
	email := ""
	slack := ""

	schema := AnyOf(
		String(&email),
		String(&slack),
	).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "anyOf", errs[0].Code)
	assert.Contains(t, errs[0].Message, "at least one")
}

func TestAnyOf_Validate_NonePresent_Optional(t *testing.T) {
	email := ""
	slack := ""

	schema := AnyOf(
		String(&email),
		String(&slack),
	).Optional()

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestAnyOf_Validate_OnePresent(t *testing.T) {
	email := "test@example.com"
	slack := ""

	schema := AnyOf(
		String(&email).Email(),
		String(&slack),
	).Required()

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestAnyOf_Validate_MultiplePresent(t *testing.T) {
	email := "test@example.com"
	slack := "#channel"

	schema := AnyOf(
		String(&email).Email(),
		String(&slack).MinLength(1),
	).Required()

	errs := schema.Validate()
	assert.Empty(t, errs) // Multiple present is OK for anyOf
}

func TestAnyOf_Validate_MultiplePresent_OneInvalid(t *testing.T) {
	email := "invalid-email" // Invalid email format
	slack := "#channel"

	schema := AnyOf(
		String(&email).Email(),
		String(&slack).MinLength(1),
	).Required()

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "format", errs[0].Code) // Email validation failed
}

func TestAnyOf_Validate_WithObjects(t *testing.T) {
	type EmailConfig struct {
		To      string
		Subject string
	}
	type SlackConfig struct {
		Channel string
	}

	email := EmailConfig{To: "test@example.com", Subject: "Alert"}
	slack := SlackConfig{} // Empty

	schema := AnyOf(
		Object(map[string]Schema{
			"to":      String(&email.To).Required().Email(),
			"subject": String(&email.Subject).Required(),
		}),
		Object(map[string]Schema{
			"channel": String(&slack.Channel).Required(),
		}),
	).Required()

	errs := schema.Validate()
	// Email object is present (to is non-empty)
	// Slack object validation will have errors but email is valid
	// Actually, let me think about this...
	// Both objects are validated if present
	// Email is present (to is non-empty)
	// Slack is NOT present (channel is empty)
	// So only email is validated
	assert.Empty(t, errs)
}

func TestAnyOf_OpenAPI(t *testing.T) {
	email := ""
	slack := ""

	schema := AnyOf(
		String(&email).Description("Email config"),
		String(&slack).Description("Slack config"),
	).Title("NotificationConfig").Description("At least one channel")

	openapi := schema.OpenAPI()

	anyOf, ok := openapi["anyOf"].([]map[string]any)
	require.True(t, ok)
	assert.Len(t, anyOf, 2)

	assert.Equal(t, "NotificationConfig", openapi["title"])
	assert.Equal(t, "At least one channel", openapi["description"])
}

// --- AllOf Validation Tests (unchanged, but verify) ---

func TestAllOf_Validate_AllValid(t *testing.T) {
	name := "John"
	age := 25

	schema := AllOf(
		Object(map[string]Schema{
			"name": String(&name).Required().MinLength(1),
		}),
		Object(map[string]Schema{
			"age": Int(&age).Required().Min(0),
		}),
	)

	errs := schema.Validate()
	assert.Empty(t, errs)
}

func TestAllOf_Validate_OneInvalid(t *testing.T) {
	name := "" // Invalid - required
	age := 25

	schema := AllOf(
		Object(map[string]Schema{
			"name": String(&name).Required().MinLength(1),
		}),
		Object(map[string]Schema{
			"age": Int(&age).Required().Min(0),
		}),
	)

	errs := schema.Validate()
	require.Len(t, errs, 1)
	assert.Equal(t, "name", errs[0].Field)
}

func TestAllOf_Validate_MultipleInvalid(t *testing.T) {
	name := "" // Invalid
	age := -10 // Invalid - min 0

	schema := AllOf(
		Object(map[string]Schema{
			"name": String(&name).Required().MinLength(1),
		}),
		Object(map[string]Schema{
			"age": Int(&age).Required().Min(0),
		}),
	)

	errs := schema.Validate()
	assert.Len(t, errs, 2)
}

// --- Real-world Use Case Tests ---

func TestOneOf_SecretValue_UsCase(t *testing.T) {
	// Use case: Secret value can be plaintext OR reference, not both
	type SecretValue struct {
		Plaintext *string
		Reference *struct {
			SecretID string
			Version  int
		}
	}

	t.Run("plaintext provided", func(t *testing.T) {
		plaintext := "my-secret-value"
		sv := SecretValue{Plaintext: &plaintext}

		schema := OneOfSchemas(
			String(sv.Plaintext),
			// Reference would be nil, so its object properties wouldn't be present
		).Required()

		errs := schema.Validate()
		assert.Empty(t, errs)
	})

	t.Run("neither provided", func(t *testing.T) {
		var plaintext string
		schema := OneOfSchemas(
			String(&plaintext), // Empty string
		).Required()

		errs := schema.Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "oneOf", errs[0].Code)
	})
}

func TestAnyOf_NotificationConfig_UseCase(t *testing.T) {
	// Use case: Notification config - at least one channel required
	type NotificationConfig struct {
		Email   *string
		Slack   *string
		Webhook *string
	}

	t.Run("one channel configured", func(t *testing.T) {
		email := "ops@example.com"
		nc := NotificationConfig{Email: &email}

		schema := AnyOf(
			String(nc.Email).Email(),
			String(nc.Slack),
			String(nc.Webhook),
		).Required()

		errs := schema.Validate()
		assert.Empty(t, errs)
	})

	t.Run("multiple channels configured", func(t *testing.T) {
		email := "ops@example.com"
		slack := "#alerts"
		nc := NotificationConfig{Email: &email, Slack: &slack}

		schema := AnyOf(
			String(nc.Email).Email(),
			String(nc.Slack).MinLength(1),
			String(nc.Webhook),
		).Required()

		errs := schema.Validate()
		assert.Empty(t, errs) // Both present and valid is OK
	})

	t.Run("no channels configured", func(t *testing.T) {
		nc := NotificationConfig{}

		schema := AnyOf(
			String(nc.Email),
			String(nc.Slack),
			String(nc.Webhook),
		).Required()

		errs := schema.Validate()
		require.Len(t, errs, 1)
		assert.Equal(t, "anyOf", errs[0].Code)
	})
}
