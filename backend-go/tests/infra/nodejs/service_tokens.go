//go:build integration

package nodejs

import "github.com/google/uuid"

// ServiceTokenScope defines the environment/path scope for a service token.
type ServiceTokenScope struct {
	Environment string `json:"environment"`
	SecretPath  string `json:"secretPath"`
}

// CreateServiceTokenRequest is the request body for POST /api/v2/service-token.
type CreateServiceTokenRequest struct {
	Name         string              `json:"name"`
	WorkspaceID  string              `json:"workspaceId"`
	Scopes       []ServiceTokenScope `json:"scopes"`
	EncryptedKey string              `json:"encryptedKey"`
	IV           string              `json:"iv"`
	Tag          string              `json:"tag"`
	ExpiresIn    *int                `json:"expiresIn"`
	Permissions  []string            `json:"permissions"`
}

// CreateServiceTokenResponse is the response from POST /api/v2/service-token.
type CreateServiceTokenResponse struct {
	ServiceToken     string `json:"serviceToken"`
	ServiceTokenData struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	} `json:"serviceTokenData"`
}

// ServiceTokenSeed holds the created service token info.
type ServiceTokenSeed struct {
	ID    string
	Name  string
	Token string
}

// ServiceTokensAPI groups service-token endpoints.
type ServiceTokensAPI struct{ apiBase }

// Create starts a service-token build. By default it is scoped to dev:/ with
// read+write permissions; override with Scopes/Permissions.
func (a ServiceTokensAPI) Create(projectID string) *createServiceTokenBuilder {
	return &createServiceTokenBuilder{
		a:           a,
		projectID:   projectID,
		scopes:      []ServiceTokenScope{{Environment: "dev", SecretPath: "/"}},
		permissions: []string{"read", "write"},
	}
}

type createServiceTokenBuilder struct {
	a           ServiceTokensAPI
	projectID   string
	scopes      []ServiceTokenScope
	permissions []string
	expiresIn   *int
}

// Scopes replaces the token's env/path scopes.
func (b *createServiceTokenBuilder) Scopes(scopes ...ServiceTokenScope) *createServiceTokenBuilder {
	b.scopes = scopes
	return b
}

// Permissions replaces the token's permissions (e.g. "read", "write").
func (b *createServiceTokenBuilder) Permissions(permissions ...string) *createServiceTokenBuilder {
	b.permissions = permissions
	return b
}

// ExpiresIn sets the token expiry in seconds.
func (b *createServiceTokenBuilder) ExpiresIn(seconds int) *createServiceTokenBuilder {
	b.expiresIn = &seconds
	return b
}

// Do creates the service token and returns its seed.
func (b *createServiceTokenBuilder) Do() *ServiceTokenSeed {
	b.a.t.Helper()

	var resp CreateServiceTokenResponse
	r, err := b.a.svc.client.R().
		SetAuthToken(b.a.svc.userToken).
		SetBody(CreateServiceTokenRequest{
			Name:         "test-service-token-" + uuid.New().String()[:8],
			WorkspaceID:  b.projectID,
			Scopes:       b.scopes,
			EncryptedKey: "",
			IV:           "",
			Tag:          "",
			ExpiresIn:    b.expiresIn,
			Permissions:  b.permissions,
		}).
		SetResult(&resp).
		Post("/api/v2/service-token")
	b.a.check("ServiceTokens.Create", r, err)

	return &ServiceTokenSeed{ID: resp.ServiceTokenData.ID, Name: resp.ServiceTokenData.Name, Token: resp.ServiceToken}
}

// Delete removes a service token.
func (a ServiceTokensAPI) Delete(serviceTokenID string) {
	a.t.Helper()
	r, err := a.svc.client.R().
		SetAuthToken(a.svc.userToken).
		Delete("/api/v2/service-token/" + serviceTokenID)
	a.check("ServiceTokens.Delete", r, err)
}
