package secretmanager

import (
	. "goa.design/goa/v3/dsl"

	"github.com/infisical/api/internal/server/design/auth"
	"github.com/infisical/api/internal/server/design/common"
)

// SecretTag describes a tag attached to a secret.
var SecretTag = Type("SecretTag", func() {
	Attribute("id", String, "Tag ID (UUID)")
	Attribute("slug", String, "Tag slug")
	Attribute("color", String, "Tag color", func() {
		Meta("struct:field:type", "*string")
	})
	Attribute("name", String, "Tag name")
	Required("id", "slug", "name")
})

// ResourceMetadata describes a metadata entry on a secret.
var ResourceMetadata = Type("ResourceMetadata", func() {
	Attribute("key", String, "Metadata key")
	Attribute("value", String, "Metadata value", func() {
		Default("")
	})
	Attribute("isEncrypted", Boolean, "Whether the value is encrypted", func() {
		Default(false)
	})
	Required("key")
})

// SecretActor describes the actor who last modified a secret.
var SecretActor = Type("SecretActor", func() {
	Attribute("actorId", String, "Actor ID")
	Attribute("actorType", String, "Actor type")
	Attribute("name", String, "Actor name")
	Attribute("membershipId", String, "Membership ID")
	Attribute("groupId", String, "Group ID")
})

// SecretRaw describes the full raw secret response shape.
var SecretRaw = Type("SecretRaw", func() {
	Attribute("id", String, "Secret ID")
	Attribute("legacyId", String, "Legacy secret ID", func() {
		Meta("struct:tag:json", "_id")
	})
	Attribute("workspace", String, "Workspace/project ID")
	Attribute("environment", String, "Environment slug")
	Attribute("version", Int, "Secret version")
	Attribute("type", String, "Secret type (shared or personal)")
	Attribute("secretKey", String, "Secret key")
	Attribute("secretValue", String, "Secret value")
	Attribute("secretComment", String, "Secret comment")
	Attribute("secretReminderNote", String, "Reminder note")
	Attribute("secretReminderRepeatDays", Int, "Reminder repeat days")
	Attribute("skipMultilineEncoding", Boolean, "Skip multiline encoding")
	Attribute("createdAt", String, "Creation timestamp")
	Attribute("updatedAt", String, "Last update timestamp")
	Attribute("actor", SecretActor, "Last modifier")
	Attribute("isRotatedSecret", Boolean, "Whether this is a rotated secret")
	Attribute("rotationId", String, "Rotation ID (UUID)")
	Attribute("secretPath", String, "Path of the secret")
	Attribute("secretValueHidden", Boolean, "Whether the secret value is hidden")
	Attribute("secretMetadata", ArrayOf(ResourceMetadata), "Secret metadata entries")
	Attribute("tags", ArrayOf(SecretTag), "Tags attached to the secret")
	Required("id", "legacyId", "workspace", "environment", "version", "type",
		"secretKey", "secretValue", "secretComment", "createdAt", "updatedAt",
		"secretValueHidden")
})

// ImportSecretRaw describes a secret within an import block (no createdAt/updatedAt).
var ImportSecretRaw = Type("ImportSecretRaw", func() {
	Attribute("id", String, "Secret ID")
	Attribute("legacyId", String, "Legacy secret ID", func() {
		Meta("struct:tag:json", "_id")
	})
	Attribute("workspace", String, "Workspace/project ID")
	Attribute("environment", String, "Environment slug")
	Attribute("version", Int, "Secret version")
	Attribute("type", String, "Secret type (shared or personal)")
	Attribute("secretKey", String, "Secret key")
	Attribute("secretValue", String, "Secret value")
	Attribute("secretComment", String, "Secret comment")
	Attribute("secretReminderNote", String, "Reminder note")
	Attribute("secretReminderRepeatDays", Int, "Reminder repeat days")
	Attribute("skipMultilineEncoding", Boolean, "Skip multiline encoding")
	Attribute("actor", SecretActor, "Last modifier")
	Attribute("isRotatedSecret", Boolean, "Whether this is a rotated secret")
	Attribute("rotationId", String, "Rotation ID (UUID)")
	Attribute("secretValueHidden", Boolean, "Whether the secret value is hidden")
	Attribute("secretMetadata", ArrayOf(ResourceMetadata), "Secret metadata entries")
	Required("id", "legacyId", "workspace", "environment", "version", "type",
		"secretKey", "secretValue", "secretComment", "secretValueHidden")
})

// SecretImport describes a block of imported secrets from another environment/path.
var SecretImport = Type("SecretImport", func() {
	Attribute("secretPath", String, "Import source path")
	Attribute("environment", String, "Import source environment")
	Attribute("folderId", String, "Import source folder ID")
	Attribute("secrets", ArrayOf(ImportSecretRaw), "Imported secrets")
	Required("secretPath", "environment", "secrets")
})

// ListSecretsResult is the response for listing secrets.
var ListSecretsResult = ResultType("application/vnd.list-secrets-result", func() {
	TypeName("ListSecretsResult")
	Attributes(func() {
		Attribute("secrets", ArrayOf(SecretRaw), "List of secrets")
		Attribute("imports", ArrayOf(SecretImport), "Imported secret blocks")
		Required("secrets")
	})
})

// GetSecretResult is the response for getting a single secret.
var GetSecretResult = ResultType("application/vnd.get-secret-result", func() {
	TypeName("GetSecretResult")
	Attributes(func() {
		Attribute("secret", SecretRaw, "The requested secret")
		Required("secret")
	})
})

var _ = Service("secrets", func() {
	Description("Service for managing secrets.")

	common.CommonServiceErrors()

	// ─── V4 Endpoints ───

	Method("listSecretsV4", func() {
		Description("List secrets for a project environment (V4).")
		auth.Secured(auth.JWTAuth, auth.IdentityAccessTokenAuth, auth.ServiceTokenAuth).
			Payload(func() {
				Attribute("projectId", String, "Project ID", func() {
					Meta("struct:tag:json", "projectId")
				})
				Attribute("environment", String, "Environment slug", func() {
					Meta("struct:tag:json", "environment")
				})
				Attribute("secretPath", String, "Secret path", func() {
					Default("/")
					Meta("struct:tag:json", "secretPath")
				})
				Attribute("viewSecretValue", Boolean, "Whether to include the secret value", func() {
					Default(true)
					Meta("struct:tag:json", "viewSecretValue")
				})
				Attribute("expandSecretReferences", Boolean, "Whether to expand secret references", func() {
					Default(true)
					Meta("struct:tag:json", "expandSecretReferences")
				})
				Attribute("recursive", Boolean, "Whether to list secrets recursively", func() {
					Default(false)
					Meta("struct:tag:json", "recursive")
				})
				Attribute("includePersonalOverrides", Boolean, "Whether to include personal overrides", func() {
					Default(false)
					Meta("struct:tag:json", "includePersonalOverrides")
				})
				Attribute("includeImports", Boolean, "Whether to include imported secrets", func() {
					Default(true)
					Meta("struct:tag:json", "includeImports")
				})
				Attribute("tagSlugs", String, "Comma-separated tag slugs to filter by", func() {
					Meta("struct:tag:json", "tagSlugs")
				})
				Attribute("metadataFilter", String, "Pipe-delimited metadata filter (key=k,value=v|...)", func() {
					Meta("struct:tag:json", "metadataFilter")
				})
				Required("projectId", "environment")
			})
		Result(ListSecretsResult)
		HTTP(func() {
			GET("/api/v4/secrets")
			Params(func() {
				Param("projectId")
				Param("environment")
				Param("secretPath")
				Param("viewSecretValue")
				Param("expandSecretReferences")
				Param("recursive")
				Param("includePersonalOverrides")
				Param("includeImports")
				Param("tagSlugs")
				Param("metadataFilter")
			})
			Response(StatusOK)
		})
	})

	Method("getSecretByNameV4", func() {
		Description("Get a secret by name (V4).")
		auth.Secured(auth.JWTAuth, auth.IdentityAccessTokenAuth, auth.ServiceTokenAuth).
			Payload(func() {
				Attribute("secretName", String, "Secret name", func() {
					MinLength(1)
					Meta("struct:tag:json", "secretName")
				})
				Attribute("projectId", String, "Project ID", func() {
					Meta("struct:tag:json", "projectId")
				})
				Attribute("environment", String, "Environment slug", func() {
					Meta("struct:tag:json", "environment")
				})
				Attribute("secretPath", String, "Secret path", func() {
					Default("/")
					Meta("struct:tag:json", "secretPath")
				})
				Attribute("version", Int, "Secret version", func() {
					Meta("struct:tag:json", "version")
				})
				Attribute("type", String, "Secret type (shared or personal)", func() {
					Default("shared")
					Enum("shared", "personal")
					Meta("struct:tag:json", "type")
				})
				Attribute("viewSecretValue", Boolean, "Whether to include the secret value", func() {
					Default(true)
					Meta("struct:tag:json", "viewSecretValue")
				})
				Attribute("expandSecretReferences", Boolean, "Whether to expand secret references", func() {
					Default(true)
					Meta("struct:tag:json", "expandSecretReferences")
				})
				Attribute("includeImports", Boolean, "Whether to include imported secrets", func() {
					Default(true)
					Meta("struct:tag:json", "includeImports")
				})
				Required("secretName", "projectId", "environment")
			})
		Result(GetSecretResult)
		HTTP(func() {
			GET("/api/v4/secrets/{secretName}")
			Params(func() {
				Param("projectId")
				Param("environment")
				Param("secretPath")
				Param("version")
				Param("type")
				Param("viewSecretValue")
				Param("expandSecretReferences")
				Param("includeImports")
			})
			Response(StatusOK)
		})
	})

	// ─── V3 Endpoints (Deprecated) ───

	Method("listSecretsRawV3", func() {
		Description("List raw secrets for a project environment (V3, deprecated).")
		auth.Secured(auth.JWTAuth, auth.IdentityAccessTokenAuth, auth.ServiceTokenAuth).
			Payload(func() {
				Attribute("workspaceId", String, "Workspace/project ID", func() {
					Meta("struct:tag:json", "workspaceId")
				})
				Attribute("workspaceSlug", String, "Workspace/project slug", func() {
					Meta("struct:tag:json", "workspaceSlug")
				})
				Attribute("environment", String, "Environment slug", func() {
					Meta("struct:tag:json", "environment")
				})
				Attribute("secretPath", String, "Secret path", func() {
					Default("/")
					Meta("struct:tag:json", "secretPath")
				})
				Attribute("viewSecretValue", Boolean, "Whether to include the secret value", func() {
					Default(true)
					Meta("struct:tag:json", "viewSecretValue")
				})
				Attribute("expandSecretReferences", Boolean, "Whether to expand secret references", func() {
					Default(false)
					Meta("struct:tag:json", "expandSecretReferences")
				})
				Attribute("recursive", Boolean, "Whether to list secrets recursively", func() {
					Default(false)
					Meta("struct:tag:json", "recursive")
				})
				Attribute("include_imports", Boolean, "Whether to include imported secrets", func() {
					Default(false)
					Meta("struct:tag:json", "include_imports")
				})
				Attribute("tagSlugs", String, "Comma-separated tag slugs to filter by", func() {
					Meta("struct:tag:json", "tagSlugs")
				})
				Attribute("metadataFilter", String, "Pipe-delimited metadata filter (key=k,value=v|...)", func() {
					Meta("struct:tag:json", "metadataFilter")
				})
			})
		Result(ListSecretsResult)
		HTTP(func() {
			GET("/api/v3/secrets/raw")
			Params(func() {
				Param("workspaceId")
				Param("workspaceSlug")
				Param("environment")
				Param("secretPath")
				Param("viewSecretValue")
				Param("expandSecretReferences")
				Param("recursive")
				Param("include_imports")
				Param("tagSlugs")
				Param("metadataFilter")
			})
			Response(StatusOK)
		})
	})

	Method("getSecretByNameRawV3", func() {
		Description("Get a raw secret by name (V3, deprecated).")
		auth.Secured(auth.JWTAuth, auth.IdentityAccessTokenAuth, auth.ServiceTokenAuth).
			Payload(func() {
				Attribute("secretName", String, "Secret name", func() {
					MinLength(1)
					Meta("struct:tag:json", "secretName")
				})
				Attribute("workspaceId", String, "Workspace/project ID", func() {
					Meta("struct:tag:json", "workspaceId")
				})
				Attribute("workspaceSlug", String, "Workspace/project slug", func() {
					Meta("struct:tag:json", "workspaceSlug")
				})
				Attribute("environment", String, "Environment slug", func() {
					Meta("struct:tag:json", "environment")
				})
				Attribute("secretPath", String, "Secret path", func() {
					Default("/")
					Meta("struct:tag:json", "secretPath")
				})
				Attribute("version", Int, "Secret version", func() {
					Meta("struct:tag:json", "version")
				})
				Attribute("type", String, "Secret type (shared or personal)", func() {
					Default("shared")
					Enum("shared", "personal")
					Meta("struct:tag:json", "type")
				})
				Attribute("viewSecretValue", Boolean, "Whether to include the secret value", func() {
					Default(true)
					Meta("struct:tag:json", "viewSecretValue")
				})
				Attribute("expandSecretReferences", Boolean, "Whether to expand secret references", func() {
					Default(false)
					Meta("struct:tag:json", "expandSecretReferences")
				})
				Attribute("include_imports", Boolean, "Whether to include imported secrets", func() {
					Default(false)
					Meta("struct:tag:json", "include_imports")
				})
				Required("secretName")
			})
		Result(GetSecretResult)
		HTTP(func() {
			GET("/api/v3/secrets/raw/{secretName}")
			Params(func() {
				Param("workspaceId")
				Param("workspaceSlug")
				Param("environment")
				Param("secretPath")
				Param("version")
				Param("type")
				Param("viewSecretValue")
				Param("expandSecretReferences")
				Param("include_imports")
			})
			Response(StatusOK)
		})
	})
})
