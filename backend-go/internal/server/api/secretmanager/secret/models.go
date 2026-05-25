package secret

import "github.com/infisical/api/pkg/chita"

// SecretRaw represents a secret in API responses.
type SecretRaw struct {
	ID                       string              `json:"id"`
	LegacyID                 string              `json:"_id"`
	Workspace                string              `json:"workspace"`
	Environment              string              `json:"environment"`
	Version                  int                 `json:"version"`
	Type                     string              `json:"type"`
	SecretKey                string              `json:"secretKey"`
	SecretValue              string              `json:"secretValue"`
	SecretComment            string              `json:"secretComment"`
	SecretReminderNote       *string             `json:"secretReminderNote,omitempty"`
	SecretReminderRepeatDays *int                `json:"secretReminderRepeatDays,omitempty"`
	SkipMultilineEncoding    *bool               `json:"skipMultilineEncoding,omitempty"`
	CreatedAt                string              `json:"createdAt"`
	UpdatedAt                string              `json:"updatedAt"`
	Actor                    *SecretActor        `json:"actor,omitempty"`
	IsRotatedSecret          *bool               `json:"isRotatedSecret,omitempty"`
	RotationID               *string             `json:"rotationId,omitempty"`
	SecretPath               *string             `json:"secretPath,omitempty"`
	SecretValueHidden        bool                `json:"secretValueHidden"`
	SecretMetadata           []*ResourceMetadata `json:"secretMetadata,omitempty"`
	Tags                     []*SecretTag        `json:"tags,omitempty"`
}

// Schema returns the OpenAPI schema for SecretRaw.
func (s *SecretRaw) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"id":                       chita.String(&s.ID).Required().Description("Secret ID"),
		"_id":                      chita.String(&s.LegacyID).Required().Description("Legacy secret ID"),
		"workspace":                chita.String(&s.Workspace).Required().Description("Workspace/project ID"),
		"environment":              chita.String(&s.Environment).Required().Description("Environment slug"),
		"version":                  chita.Int(&s.Version).Required().Description("Secret version"),
		"type":                     chita.String(&s.Type).Required().Enum("shared", "personal").Description("Secret type"),
		"secretKey":                chita.String(&s.SecretKey).Required().Description("Secret key"),
		"secretValue":              chita.String(&s.SecretValue).Required().Description("Secret value"),
		"secretComment":            chita.String(&s.SecretComment).Required().Description("Secret comment"),
		"secretReminderNote":       chita.String(s.SecretReminderNote).Optional().Description("Reminder note"),
		"secretReminderRepeatDays": chita.Int(s.SecretReminderRepeatDays).Optional().Description("Reminder repeat days"),
		"skipMultilineEncoding":    chita.Bool(s.SkipMultilineEncoding).Optional().Description("Skip multiline encoding"),
		"createdAt":                chita.String(&s.CreatedAt).Required().Description("Creation timestamp"),
		"updatedAt":                chita.String(&s.UpdatedAt).Required().Description("Last update timestamp"),
		"actor":                    (&SecretActor{}).Schema().Optional().Description("Last modifier"),
		"isRotatedSecret":          chita.Bool(s.IsRotatedSecret).Optional().Description("Whether this is a rotated secret"),
		"rotationId":               chita.String(s.RotationID).Optional().Description("Rotation ID (UUID)"),
		"secretPath":               chita.String(s.SecretPath).Optional().Description("Path of the secret"),
		"secretValueHidden":        chita.Bool(&s.SecretValueHidden).Required().Description("Whether the secret value is hidden"),
		"secretMetadata":           chita.Array((&ResourceMetadata{}).Schema()).Optional().Description("Secret metadata entries"),
		"tags":                     chita.Array((&SecretTag{}).Schema()).Optional().Description("Tags attached to the secret"),
	}).Ref("SecretRaw")
}

// ImportSecretRaw represents an imported secret in API responses.
type ImportSecretRaw struct {
	ID                       string              `json:"id"`
	LegacyID                 string              `json:"_id"`
	Workspace                string              `json:"workspace"`
	Environment              string              `json:"environment"`
	Version                  int                 `json:"version"`
	Type                     string              `json:"type"`
	SecretKey                string              `json:"secretKey"`
	SecretValue              string              `json:"secretValue"`
	SecretComment            string              `json:"secretComment"`
	SecretReminderNote       *string             `json:"secretReminderNote,omitempty"`
	SecretReminderRepeatDays *int                `json:"secretReminderRepeatDays,omitempty"`
	SkipMultilineEncoding    *bool               `json:"skipMultilineEncoding,omitempty"`
	Actor                    *SecretActor        `json:"actor,omitempty"`
	IsRotatedSecret          *bool               `json:"isRotatedSecret,omitempty"`
	RotationID               *string             `json:"rotationId,omitempty"`
	SecretValueHidden        bool                `json:"secretValueHidden"`
	SecretMetadata           []*ResourceMetadata `json:"secretMetadata,omitempty"`
}

// Schema returns the OpenAPI schema for ImportSecretRaw.
func (s *ImportSecretRaw) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"id":                       chita.String(&s.ID).Required().Description("Secret ID"),
		"_id":                      chita.String(&s.LegacyID).Required().Description("Legacy secret ID"),
		"workspace":                chita.String(&s.Workspace).Required().Description("Workspace/project ID"),
		"environment":              chita.String(&s.Environment).Required().Description("Environment slug"),
		"version":                  chita.Int(&s.Version).Required().Description("Secret version"),
		"type":                     chita.String(&s.Type).Required().Enum("shared", "personal").Description("Secret type"),
		"secretKey":                chita.String(&s.SecretKey).Required().Description("Secret key"),
		"secretValue":              chita.String(&s.SecretValue).Required().Description("Secret value"),
		"secretComment":            chita.String(&s.SecretComment).Required().Description("Secret comment"),
		"secretReminderNote":       chita.String(s.SecretReminderNote).Optional().Description("Reminder note"),
		"secretReminderRepeatDays": chita.Int(s.SecretReminderRepeatDays).Optional().Description("Reminder repeat days"),
		"skipMultilineEncoding":    chita.Bool(s.SkipMultilineEncoding).Optional().Description("Skip multiline encoding"),
		"actor":                    (&SecretActor{}).Schema().Optional().Description("Last modifier"),
		"isRotatedSecret":          chita.Bool(s.IsRotatedSecret).Optional().Description("Whether this is a rotated secret"),
		"rotationId":               chita.String(s.RotationID).Optional().Description("Rotation ID (UUID)"),
		"secretValueHidden":        chita.Bool(&s.SecretValueHidden).Required().Description("Whether the secret value is hidden"),
		"secretMetadata":           chita.Array((&ResourceMetadata{}).Schema()).Optional().Description("Secret metadata entries"),
	}).Ref("ImportSecretRaw")
}

// SecretImport represents an imported secrets block in API responses.
type SecretImport struct {
	SecretPath  string             `json:"secretPath"`
	Environment string             `json:"environment"`
	FolderID    *string            `json:"folderId,omitempty"`
	Secrets     []*ImportSecretRaw `json:"secrets"`
}

// Schema returns the OpenAPI schema for SecretImport.
func (s *SecretImport) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"secretPath":  chita.String(&s.SecretPath).Required().Description("Import source path"),
		"environment": chita.String(&s.Environment).Required().Description("Import source environment"),
		"folderId":    chita.String(s.FolderID).Optional().Description("Import source folder ID"),
		"secrets":     chita.Array((&ImportSecretRaw{}).Schema()).Required().Description("Imported secrets"),
	}).Ref("SecretImport")
}

// SecretActor represents the actor who last modified a secret.
type SecretActor struct {
	ActorID      *string `json:"actorId,omitempty"`
	ActorType    *string `json:"actorType,omitempty"`
	Name         *string `json:"name,omitempty"`
	MembershipID *string `json:"membershipId,omitempty"`
	GroupID      *string `json:"groupId,omitempty"`
}

// Schema returns the OpenAPI schema for SecretActor.
func (s *SecretActor) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"actorId":      chita.String(s.ActorID).Optional().Description("Actor ID"),
		"actorType":    chita.String(s.ActorType).Optional().Description("Actor type"),
		"name":         chita.String(s.Name).Optional().Description("Actor name"),
		"membershipId": chita.String(s.MembershipID).Optional().Description("Membership ID"),
		"groupId":      chita.String(s.GroupID).Optional().Description("Group ID"),
	}).Ref("SecretActor")
}

// SecretTag represents a tag attached to a secret.
type SecretTag struct {
	ID    string  `json:"id"`
	Slug  string  `json:"slug"`
	Color *string `json:"color,omitempty"`
	Name  string  `json:"name"`
}

// Schema returns the OpenAPI schema for SecretTag.
func (s *SecretTag) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"id":    chita.String(&s.ID).Required().Description("Tag ID (UUID)"),
		"slug":  chita.String(&s.Slug).Required().Description("Tag slug"),
		"color": chita.String(s.Color).Optional().Description("Tag color"),
		"name":  chita.String(&s.Name).Required().Description("Tag name"),
	}).Ref("SecretTag")
}

// ResourceMetadata represents a metadata entry on a secret.
type ResourceMetadata struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	IsEncrypted bool   `json:"isEncrypted"`
}

// Schema returns the OpenAPI schema for ResourceMetadata.
func (m *ResourceMetadata) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"key":         chita.String(&m.Key).Required().Description("Metadata key"),
		"value":       chita.String(&m.Value).Required().Description("Metadata value"),
		"isEncrypted": chita.Bool(&m.IsEncrypted).Required().Description("Whether the value is encrypted"),
	}).Ref("ResourceMetadata")
}

// --- ListSecretsV4 ---

// ListSecretsV4Request is the request type for listing secrets (V4).
type ListSecretsV4Request struct {
	ProjectID                string `json:"projectId"`
	Environment              string `json:"environment"`
	SecretPath               string `json:"secretPath"`
	ViewSecretValue          bool   `json:"viewSecretValue"`
	ExpandSecretReferences   bool   `json:"expandSecretReferences"`
	Recursive                bool   `json:"recursive"`
	IncludePersonalOverrides bool   `json:"includePersonalOverrides"`
	IncludeImports           bool   `json:"includeImports"`
	TagSlugs                 string `json:"tagSlugs"`
	MetadataFilter           string `json:"metadataFilter"`
}

// Schema returns the validation and OpenAPI schema for ListSecretsV4Request.
func (r *ListSecretsV4Request) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"projectId":                chita.String(&r.ProjectID).From(chita.SourceQuery).Required().Description("Project ID"),
		"environment":              chita.String(&r.Environment).From(chita.SourceQuery).Required().Description("Environment slug"),
		"secretPath":               chita.String(&r.SecretPath).From(chita.SourceQuery).Optional().Default("/").Description("Secret path"),
		"viewSecretValue":          chita.Bool(&r.ViewSecretValue).From(chita.SourceQuery).Optional().Default(true).Description("Whether to include the secret value"),
		"expandSecretReferences":   chita.Bool(&r.ExpandSecretReferences).From(chita.SourceQuery).Optional().Default(true).Description("Whether to expand secret references"),
		"recursive":                chita.Bool(&r.Recursive).From(chita.SourceQuery).Optional().Default(false).Description("Whether to list secrets recursively"),
		"includePersonalOverrides": chita.Bool(&r.IncludePersonalOverrides).From(chita.SourceQuery).Optional().Default(false).Description("Whether to include personal overrides"),
		"includeImports":           chita.Bool(&r.IncludeImports).From(chita.SourceQuery).Optional().Default(true).Description("Whether to include imported secrets"),
		"tagSlugs":                 chita.String(&r.TagSlugs).From(chita.SourceQuery).Optional().Description("Comma-separated tag slugs to filter by"),
		"metadataFilter":           chita.String(&r.MetadataFilter).From(chita.SourceQuery).Optional().Description("Pipe-delimited metadata filter (key=k,value=v|...)"),
	})
}

// ListSecretsV4Response is the response type for listing secrets (V4).
type ListSecretsV4Response struct {
	chita.StatusOK
	Secrets []*SecretRaw    `json:"secrets"`
	Imports []*SecretImport `json:"imports,omitempty"`
}

// Schema returns the OpenAPI schema for ListSecretsV4Response.
func (r *ListSecretsV4Response) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"secrets": chita.Array((&SecretRaw{}).Schema()).Required().Description("List of secrets"),
		"imports": chita.Array((&SecretImport{}).Schema()).Optional().Description("Imported secret blocks"),
	})
}

// --- ListSecretsRawV3 (deprecated) ---

// ListSecretsRawV3Request is the request type for listing raw secrets (V3, deprecated).
type ListSecretsRawV3Request struct {
	WorkspaceID            *string `json:"workspaceId"`
	WorkspaceSlug          *string `json:"workspaceSlug"`
	Environment            *string `json:"environment"`
	SecretPath             string  `json:"secretPath"`
	ViewSecretValue        bool    `json:"viewSecretValue"`
	ExpandSecretReferences bool    `json:"expandSecretReferences"`
	Recursive              bool    `json:"recursive"`
	IncludeImports         bool    `json:"include_imports"`
	TagSlugs               *string `json:"tagSlugs"`
	MetadataFilter         *string `json:"metadataFilter"`
}

// Schema returns the validation and OpenAPI schema for ListSecretsRawV3Request.
func (r *ListSecretsRawV3Request) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"workspaceId":            chita.String(r.WorkspaceID).From(chita.SourceQuery).Optional().Description("Workspace/project ID"),
		"workspaceSlug":          chita.String(r.WorkspaceSlug).From(chita.SourceQuery).Optional().Description("Workspace/project slug"),
		"environment":            chita.String(r.Environment).From(chita.SourceQuery).Optional().Description("Environment slug"),
		"secretPath":             chita.String(&r.SecretPath).From(chita.SourceQuery).Optional().Default("/").Description("Secret path"),
		"viewSecretValue":        chita.Bool(&r.ViewSecretValue).From(chita.SourceQuery).Optional().Default(true).Description("Whether to include the secret value"),
		"expandSecretReferences": chita.Bool(&r.ExpandSecretReferences).From(chita.SourceQuery).Optional().Default(true).Description("Whether to expand secret references"),
		"recursive":              chita.Bool(&r.Recursive).From(chita.SourceQuery).Optional().Default(false).Description("Whether to list secrets recursively"),
		"include_imports":        chita.Bool(&r.IncludeImports).From(chita.SourceQuery).Optional().Default(true).Description("Whether to include imported secrets"),
		"tagSlugs":               chita.String(r.TagSlugs).From(chita.SourceQuery).Optional().Description("Comma-separated tag slugs to filter by"),
		"metadataFilter":         chita.String(r.MetadataFilter).From(chita.SourceQuery).Optional().Description("Pipe-delimited metadata filter"),
	})
}

// --- GetSecretByNameRawV3 (deprecated) ---

// GetSecretByNameRawV3Request is the request type for getting a raw secret by name (V3, deprecated).
type GetSecretByNameRawV3Request struct {
	SecretName             string  `json:"-"`
	WorkspaceID            *string `json:"workspaceId"`
	WorkspaceSlug          *string `json:"workspaceSlug"`
	Environment            *string `json:"environment"`
	SecretPath             string  `json:"secretPath"`
	Version                *int    `json:"version"`
	Type                   string  `json:"type"`
	ViewSecretValue        bool    `json:"viewSecretValue"`
	ExpandSecretReferences bool    `json:"expandSecretReferences"`
	IncludeImports         bool    `json:"include_imports"`
}

// Schema returns the validation and OpenAPI schema for GetSecretByNameRawV3Request.
func (r *GetSecretByNameRawV3Request) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"secretName":             chita.String(&r.SecretName).From(chita.SourcePath).Required().MinLength(1).Description("Secret name"),
		"workspaceId":            chita.String(r.WorkspaceID).From(chita.SourceQuery).Optional().Description("Workspace/project ID"),
		"workspaceSlug":          chita.String(r.WorkspaceSlug).From(chita.SourceQuery).Optional().Description("Workspace/project slug"),
		"environment":            chita.String(r.Environment).From(chita.SourceQuery).Optional().Description("Environment slug"),
		"secretPath":             chita.String(&r.SecretPath).From(chita.SourceQuery).Optional().Default("/").Description("Secret path"),
		"version":                chita.Int(r.Version).From(chita.SourceQuery).Optional().Description("Secret version"),
		"type":                   chita.String(&r.Type).From(chita.SourceQuery).Optional().Enum("shared", "personal").Default("shared").Description("Secret type"),
		"viewSecretValue":        chita.Bool(&r.ViewSecretValue).From(chita.SourceQuery).Optional().Default(true).Description("Whether to include the secret value"),
		"expandSecretReferences": chita.Bool(&r.ExpandSecretReferences).From(chita.SourceQuery).Optional().Default(true).Description("Whether to expand secret references"),
		"include_imports":        chita.Bool(&r.IncludeImports).From(chita.SourceQuery).Optional().Default(true).Description("Whether to include imported secrets"),
	})
}

// --- GetSecretByNameV4 ---

// GetSecretByNameV4Request is the request type for getting a secret by name (V4).
type GetSecretByNameV4Request struct {
	SecretName             string `json:"-"`
	ProjectID              string `json:"projectId"`
	Environment            string `json:"environment"`
	SecretPath             string `json:"secretPath"`
	Version                *int   `json:"version"`
	Type                   string `json:"type"`
	ViewSecretValue        bool   `json:"viewSecretValue"`
	ExpandSecretReferences bool   `json:"expandSecretReferences"`
	IncludeImports         bool   `json:"includeImports"`
}

// Schema returns the validation and OpenAPI schema for GetSecretByNameV4Request.
func (r *GetSecretByNameV4Request) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"secretName":             chita.String(&r.SecretName).From(chita.SourcePath).Required().MinLength(1).Description("Secret name"),
		"projectId":              chita.String(&r.ProjectID).From(chita.SourceQuery).Required().Description("Project ID"),
		"environment":            chita.String(&r.Environment).From(chita.SourceQuery).Required().Description("Environment slug"),
		"secretPath":             chita.String(&r.SecretPath).From(chita.SourceQuery).Optional().Default("/").Description("Secret path"),
		"version":                chita.Int(r.Version).From(chita.SourceQuery).Optional().Description("Secret version"),
		"type":                   chita.String(&r.Type).From(chita.SourceQuery).Optional().Enum("shared", "personal").Default("shared").Description("Secret type"),
		"viewSecretValue":        chita.Bool(&r.ViewSecretValue).From(chita.SourceQuery).Optional().Default(true).Description("Whether to include the secret value"),
		"expandSecretReferences": chita.Bool(&r.ExpandSecretReferences).From(chita.SourceQuery).Optional().Default(true).Description("Whether to expand secret references"),
		"includeImports":         chita.Bool(&r.IncludeImports).From(chita.SourceQuery).Optional().Default(true).Description("Whether to include imported secrets"),
	})
}

// GetSecretByNameV4Response is the response type for getting a secret by name (V4).
type GetSecretByNameV4Response struct {
	chita.StatusOK
	Secret *SecretRaw `json:"secret"`
}

// Schema returns the OpenAPI schema for GetSecretByNameV4Response.
func (r *GetSecretByNameV4Response) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"secret": (&SecretRaw{}).Schema().Required().Description("The requested secret"),
	})
}
