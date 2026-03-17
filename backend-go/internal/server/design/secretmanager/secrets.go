package secretmanager

import (
	. "goa.design/goa/v3/dsl"
)

// Secret describes the input for creating a secret.
var Secret = Type("Secret", func() {
	Attribute("key", String, "Secret key", func() {
		Example("DATABASE_URL")
	})
	Attribute("value", String, "Secret value")
	Attribute("environment", String, "Environment slug")
	Attribute("projectId", String, "Project ID")
	Required("key", "value", "environment", "projectId")
})

// SecretResult describes the output of a secret operation.
var SecretResult = ResultType("application/vnd.secret", func() {
	TypeName("SecretResult")
	Attributes(func() {
		Attribute("id", String, "Secret ID")
		Attribute("key", String, "Secret key")
		Attribute("value", String, "Secret value")
		Attribute("environment", String, "Environment slug")
		Attribute("projectId", String, "Project ID")
	})
	Required("id", "key", "value", "environment", "projectId")
})

var _ = Service("secrets", func() {
	Description("Service for managing secrets.")

	Method("getHealth", func() {
		Description("Health check for the secrets service.")
		Result(String)
		HTTP(func() {
			GET("/api/v1/secret-manager/secrets/health")
			Response(StatusOK)
		})
	})

	Method("createSecret", func() {
		Description("Create a new secret.")
		Payload(Secret)
		Result(SecretResult)
		HTTP(func() {
			POST("/api/v1/secret-manager/secrets")
			Response(StatusCreated)
		})
	})

	Method("getSecret", func() {
		Description("Get a secret by ID.")
		Payload(func() {
			Attribute("id", String, "Secret ID")
			Required("id")
		})
		Result(SecretResult)
		HTTP(func() {
			GET("/api/v1/secret-manager/secrets/{id}")
			Response(StatusOK)
		})
	})

	Method("updateSecret", func() {
		Description("Update an existing secret.")
		Payload(func() {
			Attribute("id", String, "Secret ID")
			Attribute("key", String, "Secret key")
			Attribute("value", String, "Secret value")
			Required("id")
		})
		Result(SecretResult)
		HTTP(func() {
			PATCH("/api/v1/secret-manager/secrets/{id}")
			Response(StatusOK)
		})
	})

	Method("deleteSecret", func() {
		Description("Delete a secret by ID.")
		Payload(func() {
			Attribute("id", String, "Secret ID")
			Required("id")
		})
		HTTP(func() {
			DELETE("/api/v1/secret-manager/secrets/{id}")
			Response(StatusNoContent)
		})
	})

	Method("listSecrets", func() {
		Description("List secrets for an environment.")
		Payload(func() {
			Attribute("projectId", String, "Project ID")
			Attribute("environment", String, "Environment slug")
			Required("projectId", "environment")
		})
		Result(CollectionOf(SecretResult))
		HTTP(func() {
			GET("/api/v1/secret-manager/secrets")
			Params(func() {
				Param("projectId")
				Param("environment")
			})
			Response(StatusOK)
		})
	})
})
