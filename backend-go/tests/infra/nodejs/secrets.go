//go:build integration

package nodejs

// SecretMetadataEntry represents a metadata key-value pair for a secret.
type SecretMetadataEntry struct {
	Key         string `json:"key"`
	Value       string `json:"value"`
	IsEncrypted bool   `json:"isEncrypted,omitempty"`
}

// CreateSecretRequest is the request body for POST /api/v4/secrets/{key}.
type CreateSecretRequest struct {
	ProjectID                string                `json:"projectId"`
	Environment              string                `json:"environment"`
	SecretPath               string                `json:"secretPath"`
	SecretValue              string                `json:"secretValue"`
	SecretComment            string                `json:"secretComment,omitempty"`
	SecretMetadata           []SecretMetadataEntry `json:"secretMetadata,omitempty"`
	Type                     string                `json:"type"`
	TagIDs                   []string              `json:"tagIds,omitempty"`
	SecretReminderNote       string                `json:"secretReminderNote,omitempty"`
	SecretReminderRepeatDays *int                  `json:"secretReminderRepeatDays,omitempty"`
	SkipMultilineEncoding    bool                  `json:"skipMultilineEncoding,omitempty"`
}

// CreateSecretResponse is the response from POST /api/v4/secrets/{key}.
type CreateSecretResponse struct {
	Secret struct {
		ID string `json:"id"`
	} `json:"secret"`
}

// UpdateSecretRequest is the request body for PATCH /api/v4/secrets/{key}.
type UpdateSecretRequest struct {
	ProjectID   string `json:"projectId"`
	Environment string `json:"environment"`
	SecretPath  string `json:"secretPath"`
	SecretValue string `json:"secretValue"`
}

// UpdateSecretResponse is the response from PATCH /api/v4/secrets/{key}.
type UpdateSecretResponse struct {
	Secret struct {
		ID      string `json:"id"`
		Version int    `json:"version"`
	} `json:"secret"`
}

// GetSecretResponse is the response from GET /api/v4/secrets/{key}.
type GetSecretResponse struct {
	Secret struct {
		ID          string `json:"id"`
		Key         string `json:"secretKey"`
		Value       string `json:"secretValue"`
		Version     int    `json:"version"`
		SecretPath  string `json:"secretPath"`
		Environment string `json:"environment"`
	} `json:"secret"`
}

// SecretSeed contains metadata for a secret created via the Node.js API.
type SecretSeed struct {
	ID      string
	Key     string
	Value   string
	Version int
}

// SecretsAPI groups secret endpoints.
type SecretsAPI struct{ apiBase }

// Create starts a secret build. Path defaults to "/" and Type to shared.
func (a SecretsAPI) Create(projectID, environment, key, value string) *createSecretBuilder {
	return &createSecretBuilder{
		a:   a,
		key: key,
		req: CreateSecretRequest{
			ProjectID:   projectID,
			Environment: environment,
			SecretPath:  "/",
			SecretValue: value,
			Type:        "shared",
		},
	}
}

type createSecretBuilder struct {
	a   SecretsAPI
	key string
	req CreateSecretRequest
}

// Path sets the secret folder path (default "/").
func (b *createSecretBuilder) Path(path string) *createSecretBuilder {
	b.req.SecretPath = path
	return b
}

// Comment sets the secret comment.
func (b *createSecretBuilder) Comment(comment string) *createSecretBuilder {
	b.req.SecretComment = comment
	return b
}

// Metadata appends metadata entries.
func (b *createSecretBuilder) Metadata(entries ...SecretMetadataEntry) *createSecretBuilder {
	b.req.SecretMetadata = append(b.req.SecretMetadata, entries...)
	return b
}

// Tags appends tag IDs.
func (b *createSecretBuilder) Tags(tagIDs ...string) *createSecretBuilder {
	b.req.TagIDs = append(b.req.TagIDs, tagIDs...)
	return b
}

// Personal marks the secret as a personal override (sent with the user token).
func (b *createSecretBuilder) Personal() *createSecretBuilder {
	b.req.Type = "personal"
	return b
}

// Reminder sets the reminder note and repeat interval.
func (b *createSecretBuilder) Reminder(note string, repeatDays int) *createSecretBuilder {
	b.req.SecretReminderNote = note
	b.req.SecretReminderRepeatDays = &repeatDays
	return b
}

// SkipMultilineEncoding sets the skipMultilineEncoding flag.
func (b *createSecretBuilder) SkipMultilineEncoding() *createSecretBuilder {
	b.req.SkipMultilineEncoding = true
	return b
}

// Do creates the secret and returns its seed.
func (b *createSecretBuilder) Do() *SecretSeed {
	b.a.t.Helper()

	token := b.a.svc.identityToken
	if b.req.Type == "personal" {
		token = b.a.svc.userToken
	}

	var resp CreateSecretResponse
	r, err := b.a.svc.client.R().
		SetAuthToken(token).
		SetBody(b.req).
		SetResult(&resp).
		Post("/api/v4/secrets/" + b.key)
	b.a.check("Secrets.Create", r, err)

	return &SecretSeed{ID: resp.Secret.ID, Key: b.key, Value: b.req.SecretValue, Version: 1}
}

// Update starts a secret value update. Path defaults to "/".
func (a SecretsAPI) Update(projectID, environment, key, newValue string) *updateSecretBuilder {
	return &updateSecretBuilder{
		a:   a,
		key: key,
		req: UpdateSecretRequest{
			ProjectID:   projectID,
			Environment: environment,
			SecretPath:  "/",
			SecretValue: newValue,
		},
	}
}

type updateSecretBuilder struct {
	a   SecretsAPI
	key string
	req UpdateSecretRequest
}

// Path sets the secret folder path (default "/").
func (b *updateSecretBuilder) Path(path string) *updateSecretBuilder {
	b.req.SecretPath = path
	return b
}

// Do updates the secret value.
func (b *updateSecretBuilder) Do() {
	b.a.t.Helper()
	r, err := b.a.svc.client.R().
		SetAuthToken(b.a.svc.identityToken).
		SetBody(b.req).
		Patch("/api/v4/secrets/" + b.key)
	b.a.check("Secrets.Update", r, err)
}

// Get starts a secret read. Path defaults to "/".
func (a SecretsAPI) Get(projectID, environment, key string) *getSecretBuilder {
	return &getSecretBuilder{a: a, projectID: projectID, environment: environment, key: key, path: "/"}
}

type getSecretBuilder struct {
	a           SecretsAPI
	projectID   string
	environment string
	key         string
	path        string
}

// Path sets the secret folder path (default "/").
func (b *getSecretBuilder) Path(path string) *getSecretBuilder {
	b.path = path
	return b
}

// Do reads the secret and returns its seed.
func (b *getSecretBuilder) Do() *SecretSeed {
	b.a.t.Helper()
	var resp GetSecretResponse
	r, err := b.a.svc.client.R().
		SetAuthToken(b.a.svc.identityToken).
		SetQueryParams(map[string]string{
			"projectId":   b.projectID,
			"environment": b.environment,
			"secretPath":  b.path,
		}).
		SetResult(&resp).
		Get("/api/v4/secrets/" + b.key)
	b.a.check("Secrets.Get", r, err)

	return &SecretSeed{ID: resp.Secret.ID, Key: resp.Secret.Key, Value: resp.Secret.Value, Version: resp.Secret.Version}
}
