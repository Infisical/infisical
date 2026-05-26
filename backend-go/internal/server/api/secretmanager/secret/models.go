package secret

import "github.com/infisical/api/pkg/chita"

// SecretRaw represents a secret in API responses.
type SecretRaw struct {
	ID                       chita.Required[string] `json:"id"`
	LegacyID                 chita.Required[string] `json:"_id"`
	Workspace                chita.Required[string] `json:"workspace"`
	Environment              chita.Required[string] `json:"environment"`
	Version                  chita.Required[int]    `json:"version"`
	Type                     chita.Required[string] `json:"type"`
	SecretKey                chita.Required[string] `json:"secretKey"`
	SecretValue              chita.Required[string] `json:"secretValue"`
	SecretComment            chita.Required[string] `json:"secretComment"`
	SecretReminderNote       chita.Optional[string] `json:"secretReminderNote,omitempty"`
	SecretReminderRepeatDays chita.Optional[int]    `json:"secretReminderRepeatDays,omitempty"`
	SkipMultilineEncoding    chita.Optional[bool]   `json:"skipMultilineEncoding,omitempty"`
	CreatedAt                chita.Required[string] `json:"createdAt"`
	UpdatedAt                chita.Required[string] `json:"updatedAt"`
	Actor                    *SecretActor           `json:"actor,omitempty"`
	IsRotatedSecret          chita.Optional[bool]   `json:"isRotatedSecret,omitempty"`
	RotationID               chita.Optional[string] `json:"rotationId,omitempty"`
	SecretPath               chita.Optional[string] `json:"secretPath,omitempty"`
	SecretValueHidden        chita.Required[bool]   `json:"secretValueHidden"`
	SecretMetadata           []*ResourceMetadata    `json:"secretMetadata,omitempty"`
	Tags                     []*SecretTag           `json:"tags,omitempty"`
}

// Schema returns the OpenAPI schema for SecretRaw.
func (s *SecretRaw) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"id":                       chita.Str(&s.ID).Description("Secret ID"),
		"_id":                      chita.Str(&s.LegacyID).Description("Legacy secret ID"),
		"workspace":                chita.Str(&s.Workspace).Description("Workspace/project ID"),
		"environment":              chita.Str(&s.Environment).Description("Environment slug"),
		"version":                  chita.Int(&s.Version).Description("Secret version"),
		"type":                     chita.Str(&s.Type).Enum("shared", "personal").Description("Secret type"),
		"secretKey":                chita.Str(&s.SecretKey).Description("Secret key"),
		"secretValue":              chita.Str(&s.SecretValue).Description("Secret value"),
		"secretComment":            chita.Str(&s.SecretComment).Description("Secret comment"),
		"secretReminderNote":       chita.OptStr(&s.SecretReminderNote).Description("Reminder note"),
		"secretReminderRepeatDays": chita.OptInt(&s.SecretReminderRepeatDays).Description("Reminder repeat days"),
		"skipMultilineEncoding":    chita.OptBool(&s.SkipMultilineEncoding).Description("Skip multiline encoding"),
		"createdAt":                chita.Str(&s.CreatedAt).Description("Creation timestamp"),
		"updatedAt":                chita.Str(&s.UpdatedAt).Description("Last update timestamp"),
		"actor":                    (&SecretActor{}).Schema().Description("Last modifier"),
		"isRotatedSecret":          chita.OptBool(&s.IsRotatedSecret).Description("Whether this is a rotated secret"),
		"rotationId":               chita.OptStr(&s.RotationID).Description("Rotation ID (UUID)"),
		"secretPath":               chita.OptStr(&s.SecretPath).Description("Path of the secret"),
		"secretValueHidden":        chita.Bool(&s.SecretValueHidden).Description("Whether the secret value is hidden"),
		"secretMetadata":           chita.Array((&ResourceMetadata{}).Schema()).Description("Secret metadata entries"),
		"tags":                     chita.Array((&SecretTag{}).Schema()).Description("Tags attached to the secret"),
	}).Ref("SecretRaw")
}

// ImportSecretRaw represents an imported secret in API responses.
type ImportSecretRaw struct {
	ID                       chita.Required[string] `json:"id"`
	LegacyID                 chita.Required[string] `json:"_id"`
	Workspace                chita.Required[string] `json:"workspace"`
	Environment              chita.Required[string] `json:"environment"`
	Version                  chita.Required[int]    `json:"version"`
	Type                     chita.Required[string] `json:"type"`
	SecretKey                chita.Required[string] `json:"secretKey"`
	SecretValue              chita.Required[string] `json:"secretValue"`
	SecretComment            chita.Required[string] `json:"secretComment"`
	SecretReminderNote       chita.Optional[string] `json:"secretReminderNote,omitempty"`
	SecretReminderRepeatDays chita.Optional[int]    `json:"secretReminderRepeatDays,omitempty"`
	SkipMultilineEncoding    chita.Optional[bool]   `json:"skipMultilineEncoding,omitempty"`
	Actor                    *SecretActor           `json:"actor,omitempty"`
	IsRotatedSecret          chita.Optional[bool]   `json:"isRotatedSecret,omitempty"`
	RotationID               chita.Optional[string] `json:"rotationId,omitempty"`
	SecretValueHidden        chita.Required[bool]   `json:"secretValueHidden"`
	SecretMetadata           []*ResourceMetadata    `json:"secretMetadata,omitempty"`
}

// Schema returns the OpenAPI schema for ImportSecretRaw.
func (s *ImportSecretRaw) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"id":                       chita.Str(&s.ID).Description("Secret ID"),
		"_id":                      chita.Str(&s.LegacyID).Description("Legacy secret ID"),
		"workspace":                chita.Str(&s.Workspace).Description("Workspace/project ID"),
		"environment":              chita.Str(&s.Environment).Description("Environment slug"),
		"version":                  chita.Int(&s.Version).Description("Secret version"),
		"type":                     chita.Str(&s.Type).Enum("shared", "personal").Description("Secret type"),
		"secretKey":                chita.Str(&s.SecretKey).Description("Secret key"),
		"secretValue":              chita.Str(&s.SecretValue).Description("Secret value"),
		"secretComment":            chita.Str(&s.SecretComment).Description("Secret comment"),
		"secretReminderNote":       chita.OptStr(&s.SecretReminderNote).Description("Reminder note"),
		"secretReminderRepeatDays": chita.OptInt(&s.SecretReminderRepeatDays).Description("Reminder repeat days"),
		"skipMultilineEncoding":    chita.OptBool(&s.SkipMultilineEncoding).Description("Skip multiline encoding"),
		"actor":                    (&SecretActor{}).Schema().Description("Last modifier"),
		"isRotatedSecret":          chita.OptBool(&s.IsRotatedSecret).Description("Whether this is a rotated secret"),
		"rotationId":               chita.OptStr(&s.RotationID).Description("Rotation ID (UUID)"),
		"secretValueHidden":        chita.Bool(&s.SecretValueHidden).Description("Whether the secret value is hidden"),
		"secretMetadata":           chita.Array((&ResourceMetadata{}).Schema()).Description("Secret metadata entries"),
	}).Ref("ImportSecretRaw")
}

// SecretImport represents an imported secrets block in API responses.
type SecretImport struct {
	SecretPath  chita.Required[string] `json:"secretPath"`
	Environment chita.Required[string] `json:"environment"`
	FolderID    chita.Optional[string] `json:"folderId,omitempty"`
	Secrets     []*ImportSecretRaw     `json:"secrets"`
}

// Schema returns the OpenAPI schema for SecretImport.
func (s *SecretImport) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"secretPath":  chita.Str(&s.SecretPath).Description("Import source path"),
		"environment": chita.Str(&s.Environment).Description("Import source environment"),
		"folderId":    chita.OptStr(&s.FolderID).Description("Import source folder ID"),
		"secrets":     chita.Array((&ImportSecretRaw{}).Schema()).Required().Description("Imported secrets"),
	}).Ref("SecretImport")
}

// SecretActor represents the actor who last modified a secret.
type SecretActor struct {
	ActorID      chita.Optional[string] `json:"actorId,omitempty"`
	ActorType    chita.Optional[string] `json:"actorType,omitempty"`
	Name         chita.Optional[string] `json:"name,omitempty"`
	MembershipID chita.Optional[string] `json:"membershipId,omitempty"`
	GroupID      chita.Optional[string] `json:"groupId,omitempty"`
}

// Schema returns the OpenAPI schema for SecretActor.
func (s *SecretActor) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"actorId":      chita.OptStr(&s.ActorID).Description("Actor ID"),
		"actorType":    chita.OptStr(&s.ActorType).Description("Actor type"),
		"name":         chita.OptStr(&s.Name).Description("Actor name"),
		"membershipId": chita.OptStr(&s.MembershipID).Description("Membership ID"),
		"groupId":      chita.OptStr(&s.GroupID).Description("Group ID"),
	}).Ref("SecretActor")
}

// SecretTag represents a tag attached to a secret.
type SecretTag struct {
	ID    chita.Required[string] `json:"id"`
	Slug  chita.Required[string] `json:"slug"`
	Color chita.Optional[string] `json:"color,omitempty"`
	Name  chita.Required[string] `json:"name"`
}

// Schema returns the OpenAPI schema for SecretTag.
func (s *SecretTag) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"id":    chita.Str(&s.ID).Description("Tag ID (UUID)"),
		"slug":  chita.Str(&s.Slug).Description("Tag slug"),
		"color": chita.OptStr(&s.Color).Description("Tag color"),
		"name":  chita.Str(&s.Name).Description("Tag name"),
	}).Ref("SecretTag")
}

// ResourceMetadata represents a metadata entry on a secret.
type ResourceMetadata struct {
	Key         chita.Required[string] `json:"key"`
	Value       chita.Required[string] `json:"value"`
	IsEncrypted chita.Required[bool]   `json:"isEncrypted"`
}

// Schema returns the OpenAPI schema for ResourceMetadata.
func (m *ResourceMetadata) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"key":         chita.Str(&m.Key).Description("Metadata key"),
		"value":       chita.Str(&m.Value).Description("Metadata value"),
		"isEncrypted": chita.Bool(&m.IsEncrypted).Description("Whether the value is encrypted"),
	}).Ref("ResourceMetadata")
}

// --- ListSecretsV4 ---

// ListSecretsV4Request is the request type for listing secrets (V4).
type ListSecretsV4Request struct {
	ProjectID                chita.Required[string] `json:"-"`
	Environment              chita.Required[string] `json:"-"`
	SecretPath               chita.Optional[string] `json:"-"`
	ViewSecretValue          chita.Optional[bool]   `json:"-"`
	ExpandSecretReferences   chita.Optional[bool]   `json:"-"`
	Recursive                chita.Optional[bool]   `json:"-"`
	IncludePersonalOverrides chita.Optional[bool]   `json:"-"`
	IncludeImports           chita.Optional[bool]   `json:"-"`
	TagSlugs                 chita.Optional[string] `json:"-"`
	MetadataFilter           chita.Optional[string] `json:"-"`
}

// Schema returns the validation and OpenAPI schema for ListSecretsV4Request.
func (r *ListSecretsV4Request) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"projectId":                chita.Str(&r.ProjectID).From(chita.SourceQuery).Description("Project ID"),
		"environment":              chita.Str(&r.Environment).From(chita.SourceQuery).Description("Environment slug"),
		"secretPath":               chita.OptStr(&r.SecretPath).From(chita.SourceQuery).Default("/").Description("Secret path"),
		"viewSecretValue":          chita.OptBool(&r.ViewSecretValue).From(chita.SourceQuery).Default(true).Description("Whether to include the secret value"),
		"expandSecretReferences":   chita.OptBool(&r.ExpandSecretReferences).From(chita.SourceQuery).Default(true).Description("Whether to expand secret references"),
		"recursive":                chita.OptBool(&r.Recursive).From(chita.SourceQuery).Default(false).Description("Whether to list secrets recursively"),
		"includePersonalOverrides": chita.OptBool(&r.IncludePersonalOverrides).From(chita.SourceQuery).Default(false).Description("Whether to include personal overrides"),
		"includeImports":           chita.OptBool(&r.IncludeImports).From(chita.SourceQuery).Default(true).Description("Whether to include imported secrets"),
		"tagSlugs":                 chita.OptStr(&r.TagSlugs).From(chita.SourceQuery).Description("Comma-separated tag slugs to filter by"),
		"metadataFilter":           chita.OptStr(&r.MetadataFilter).From(chita.SourceQuery).Description("Pipe-delimited metadata filter (key=k,value=v|...)"),
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
	WorkspaceID            chita.Optional[string] `json:"-"`
	WorkspaceSlug          chita.Optional[string] `json:"-"`
	Environment            chita.Optional[string] `json:"-"`
	SecretPath             chita.Optional[string] `json:"-"`
	ViewSecretValue        chita.Optional[bool]   `json:"-"`
	ExpandSecretReferences chita.Optional[bool]   `json:"-"`
	Recursive              chita.Optional[bool]   `json:"-"`
	IncludeImports         chita.Optional[bool]   `json:"-"`
	TagSlugs               chita.Optional[string] `json:"-"`
	MetadataFilter         chita.Optional[string] `json:"-"`
}

// Schema returns the validation and OpenAPI schema for ListSecretsRawV3Request.
func (r *ListSecretsRawV3Request) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"workspaceId":            chita.OptStr(&r.WorkspaceID).From(chita.SourceQuery).Description("Workspace/project ID"),
		"workspaceSlug":          chita.OptStr(&r.WorkspaceSlug).From(chita.SourceQuery).Description("Workspace/project slug"),
		"environment":            chita.OptStr(&r.Environment).From(chita.SourceQuery).Description("Environment slug"),
		"secretPath":             chita.OptStr(&r.SecretPath).From(chita.SourceQuery).Default("/").Description("Secret path"),
		"viewSecretValue":        chita.OptBool(&r.ViewSecretValue).From(chita.SourceQuery).Default(true).Description("Whether to include the secret value"),
		"expandSecretReferences": chita.OptBool(&r.ExpandSecretReferences).From(chita.SourceQuery).Default(true).Description("Whether to expand secret references"),
		"recursive":              chita.OptBool(&r.Recursive).From(chita.SourceQuery).Default(false).Description("Whether to list secrets recursively"),
		"include_imports":        chita.OptBool(&r.IncludeImports).From(chita.SourceQuery).Default(true).Description("Whether to include imported secrets"),
		"tagSlugs":               chita.OptStr(&r.TagSlugs).From(chita.SourceQuery).Description("Comma-separated tag slugs to filter by"),
		"metadataFilter":         chita.OptStr(&r.MetadataFilter).From(chita.SourceQuery).Description("Pipe-delimited metadata filter"),
	})
}

// --- GetSecretByNameRawV3 (deprecated) ---

// GetSecretByNameRawV3Request is the request type for getting a raw secret by name (V3, deprecated).
type GetSecretByNameRawV3Request struct {
	SecretName             chita.Required[string] `json:"-"`
	WorkspaceID            chita.Optional[string] `json:"-"`
	WorkspaceSlug          chita.Optional[string] `json:"-"`
	Environment            chita.Optional[string] `json:"-"`
	SecretPath             chita.Optional[string] `json:"-"`
	Version                chita.Optional[int]    `json:"-"`
	Type                   chita.Optional[string] `json:"-"`
	ViewSecretValue        chita.Optional[bool]   `json:"-"`
	ExpandSecretReferences chita.Optional[bool]   `json:"-"`
	IncludeImports         chita.Optional[bool]   `json:"-"`
}

// Schema returns the validation and OpenAPI schema for GetSecretByNameRawV3Request.
func (r *GetSecretByNameRawV3Request) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"secretName":             chita.Str(&r.SecretName).From(chita.SourcePath).MinLength(1).Description("Secret name"),
		"workspaceId":            chita.OptStr(&r.WorkspaceID).From(chita.SourceQuery).Description("Workspace/project ID"),
		"workspaceSlug":          chita.OptStr(&r.WorkspaceSlug).From(chita.SourceQuery).Description("Workspace/project slug"),
		"environment":            chita.OptStr(&r.Environment).From(chita.SourceQuery).Description("Environment slug"),
		"secretPath":             chita.OptStr(&r.SecretPath).From(chita.SourceQuery).Default("/").Description("Secret path"),
		"version":                chita.OptInt(&r.Version).From(chita.SourceQuery).Description("Secret version"),
		"type":                   chita.OptStr(&r.Type).From(chita.SourceQuery).Enum("shared", "personal").Default("shared").Description("Secret type"),
		"viewSecretValue":        chita.OptBool(&r.ViewSecretValue).From(chita.SourceQuery).Default(true).Description("Whether to include the secret value"),
		"expandSecretReferences": chita.OptBool(&r.ExpandSecretReferences).From(chita.SourceQuery).Default(true).Description("Whether to expand secret references"),
		"include_imports":        chita.OptBool(&r.IncludeImports).From(chita.SourceQuery).Default(true).Description("Whether to include imported secrets"),
	})
}

// --- GetSecretByNameV4 ---

// GetSecretByNameV4Request is the request type for getting a secret by name (V4).
type GetSecretByNameV4Request struct {
	SecretName             chita.Required[string] `json:"-"`
	ProjectID              chita.Required[string] `json:"-"`
	Environment            chita.Required[string] `json:"-"`
	SecretPath             chita.Optional[string] `json:"-"`
	Version                chita.Optional[int]    `json:"-"`
	Type                   chita.Optional[string] `json:"-"`
	ViewSecretValue        chita.Optional[bool]   `json:"-"`
	ExpandSecretReferences chita.Optional[bool]   `json:"-"`
	IncludeImports         chita.Optional[bool]   `json:"-"`
}

// Schema returns the validation and OpenAPI schema for GetSecretByNameV4Request.
func (r *GetSecretByNameV4Request) Schema() *chita.ObjectSchema {
	return chita.Object(map[string]chita.Schema{
		"secretName":             chita.Str(&r.SecretName).From(chita.SourcePath).MinLength(1).Description("Secret name"),
		"projectId":              chita.Str(&r.ProjectID).From(chita.SourceQuery).Description("Project ID"),
		"environment":            chita.Str(&r.Environment).From(chita.SourceQuery).Description("Environment slug"),
		"secretPath":             chita.OptStr(&r.SecretPath).From(chita.SourceQuery).Default("/").Description("Secret path"),
		"version":                chita.OptInt(&r.Version).From(chita.SourceQuery).Description("Secret version"),
		"type":                   chita.OptStr(&r.Type).From(chita.SourceQuery).Enum("shared", "personal").Default("shared").Description("Secret type"),
		"viewSecretValue":        chita.OptBool(&r.ViewSecretValue).From(chita.SourceQuery).Default(true).Description("Whether to include the secret value"),
		"expandSecretReferences": chita.OptBool(&r.ExpandSecretReferences).From(chita.SourceQuery).Default(true).Description("Whether to expand secret references"),
		"includeImports":         chita.OptBool(&r.IncludeImports).From(chita.SourceQuery).Default(true).Description("Whether to include imported secrets"),
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
