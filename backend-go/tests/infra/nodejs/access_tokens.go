//go:build integration

package nodejs

// IPAddress represents a trusted IP address.
type IPAddress struct {
	IPAddress string `json:"ipAddress"`
}

// CreateUniversalAuthRequest is the request body for POST /api/v1/auth/universal-auth/identities/{id}.
type CreateUniversalAuthRequest struct {
	IdentityID                    string      `json:"identityId"`
	AccessTokenTrustedIPs         []IPAddress `json:"accessTokenTrustedIps"`
	AccessTokenTTL                int         `json:"accessTokenTTL"`
	AccessTokenMaxTTL             int         `json:"accessTokenMaxTTL"`
	AccessTokenNumUsesLimit       int         `json:"accessTokenNumUsesLimit"`
	ClientSecretTrustedIPs        []IPAddress `json:"clientSecretTrustedIps"`
	ClientSecretNumUsesLimit      int         `json:"clientSecretNumUsesLimit"`
	IsClientSecretRotationEnabled bool        `json:"isClientSecretRotationEnabled"`
}

// CreateUniversalAuthResponse is the response from POST /api/v1/auth/universal-auth/identities/{id}.
type CreateUniversalAuthResponse struct {
	IdentityUniversalAuth struct {
		ID       string `json:"id"`
		ClientID string `json:"clientId"`
	} `json:"identityUniversalAuth"`
}

// CreateClientSecretRequest is the request body for POST /api/v1/auth/universal-auth/identities/{id}/client-secrets.
type CreateClientSecretRequest struct {
	Description  string `json:"description"`
	TTL          int    `json:"ttl"`
	NumUsesLimit int    `json:"numUsesLimit"`
}

// CreateClientSecretResponse is the response from POST /api/v1/auth/universal-auth/identities/{id}/client-secrets.
// Note: clientId is NOT in this response - it's in the universal auth creation response.
type CreateClientSecretResponse struct {
	ClientSecretData struct {
		ID                 string `json:"id"`
		ClientSecretPrefix string `json:"clientSecretPrefix"`
	} `json:"clientSecretData"`
	ClientSecret string `json:"clientSecret"`
}

// UniversalAuthLoginRequest is the request body for POST /api/v1/auth/universal-auth/login.
type UniversalAuthLoginRequest struct {
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
}

// UniversalAuthLoginResponse is the response from POST /api/v1/auth/universal-auth/login.
type UniversalAuthLoginResponse struct {
	AccessToken string `json:"accessToken"`
}

// AccessTokensAPI groups identity access-token endpoints.
type AccessTokensAPI struct{ apiBase }

// ForIdentity provisions universal-auth on the identity and returns a fresh
// access token, useful for exercising API calls as that identity.
func (a AccessTokensAPI) ForIdentity(identityID string) string {
	a.t.Helper()

	// 1. Attach a universal auth method (returns the clientId).
	var universalAuthResp CreateUniversalAuthResponse
	r, err := a.svc.client.R().
		SetAuthToken(a.svc.identityToken).
		SetBody(CreateUniversalAuthRequest{
			IdentityID:                    identityID,
			AccessTokenTrustedIPs:         []IPAddress{{IPAddress: "0.0.0.0/0"}},
			AccessTokenTTL:                3600,
			AccessTokenMaxTTL:             7200,
			AccessTokenNumUsesLimit:       0,
			ClientSecretTrustedIPs:        []IPAddress{{IPAddress: "0.0.0.0/0"}},
			ClientSecretNumUsesLimit:      0,
			IsClientSecretRotationEnabled: false,
		}).
		SetResult(&universalAuthResp).
		Post("/api/v1/auth/universal-auth/identities/" + identityID)
	a.check("AccessTokens.ForIdentity(universal-auth)", r, err)

	clientID := universalAuthResp.IdentityUniversalAuth.ClientID

	// 2. Mint a client secret.
	var clientSecretResp CreateClientSecretResponse
	r, err = a.svc.client.R().
		SetAuthToken(a.svc.identityToken).
		SetBody(CreateClientSecretRequest{Description: "test-client-secret", TTL: 0, NumUsesLimit: 0}).
		SetResult(&clientSecretResp).
		Post("/api/v1/auth/universal-auth/identities/" + identityID + "/client-secrets")
	a.check("AccessTokens.ForIdentity(client-secret)", r, err)

	// 3. Log in to obtain the access token.
	var loginResp UniversalAuthLoginResponse
	r, err = a.svc.client.R().
		SetBody(UniversalAuthLoginRequest{ClientID: clientID, ClientSecret: clientSecretResp.ClientSecret}).
		SetResult(&loginResp).
		Post("/api/v1/auth/universal-auth/login")
	a.check("AccessTokens.ForIdentity(login)", r, err)

	return loginResp.AccessToken
}

// Revoke revokes an identity access token.
func (a AccessTokensAPI) Revoke(accessToken string) {
	a.t.Helper()
	r, err := a.svc.client.R().
		SetBody(map[string]string{"accessToken": accessToken}).
		Post("/api/v1/auth/token/revoke")
	a.check("AccessTokens.Revoke", r, err)
}
