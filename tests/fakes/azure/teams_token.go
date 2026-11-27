package azure

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"
)

const (
	graphScope = "https://graph.microsoft.com/.default"
	botScope   = "https://api.botframework.com/.default"

	// botFrameworkTenant is the tenant id Microsoft stamps on every Bot Framework token.
	botFrameworkTenant = "d6d49420-f39b-4df7-a1dc-d59a935871db"

	tokenLifetime = time.Hour
)

// TokenGrant is one token request for Microsoft Graph or the Bot Framework, with the
// tenant the token it was answered with carries (empty when the request was refused).
type TokenGrant struct {
	ClientID    string `json:"clientId"`
	GrantType   string `json:"grantType"`
	Scope       string `json:"scope"`
	Code        string `json:"code,omitempty"`
	RedirectURI string `json:"redirectUri,omitempty"`
	IssuedTid   string `json:"issuedTid,omitempty"`
}

// graphOrBot answers the token requests the Teams integration makes: Graph tokens
// (client credentials for the application, authorization code for the consenting user)
// and the Bot Framework token. It reports false for any other scope.
func (t *Tenant) graphOrBot(w http.ResponseWriter, r *http.Request, tenant string) bool {
	scope := r.PostForm.Get("scope")
	if scope != graphScope && scope != botScope {
		return false
	}
	grant := TokenGrant{
		ClientID:    r.PostForm.Get("client_id"),
		GrantType:   r.PostForm.Get("grant_type"),
		Scope:       scope,
		Code:        r.PostForm.Get("code"),
		RedirectURI: r.PostForm.Get("redirect_uri"),
	}
	respond := func(status int, body any) {
		t.mu.Lock()
		t.Grants = append(t.Grants, grant)
		t.mu.Unlock()
		writeJSON(w, status, body)
	}

	if grant.ClientID == "" || r.PostForm.Get("client_secret") == "" {
		respond(http.StatusUnauthorized, aadError("invalid_client", "AADSTS7000216: 'client_secret' is required for this request.", 7000216))
		return true
	}
	if grant.GrantType != "client_credentials" && (grant.GrantType != "authorization_code" || scope == botScope) {
		respond(http.StatusBadRequest, aadError("unsupported_grant_type", "AADSTS70003: The app is configured with an unsupported grant type.", 70003))
		return true
	}
	if grant.GrantType == "authorization_code" && grant.Code == "" {
		respond(http.StatusBadRequest, aadError("invalid_request", "AADSTS900144: The request body must contain the following parameter: 'code'.", 900144))
		return true
	}

	t.mu.Lock()
	consentRequired, appTenant, codeTenant := t.ConsentRequired, t.AppTenant, t.CodeTenants[grant.Code]
	t.mu.Unlock()

	claims := map[string]any{"appid": grant.ClientID, "azp": grant.ClientID}
	switch {
	case scope == botScope:
		claims["tid"] = botFrameworkTenant
		claims["aud"] = "https://api.botframework.com"
		claims["iss"] = "https://sts.windows.net/" + botFrameworkTenant + "/"
	default:
		if consentRequired {
			respond(http.StatusBadRequest, aadError("invalid_grant", fmt.Sprintf(
				"AADSTS65001: The user or administrator has not consented to use the application with ID '%s'. Send an interactive authorization request for this user and resource.",
				grant.ClientID), 65001))
			return true
		}
		tid := tenant
		if grant.GrantType == "client_credentials" && appTenant != "" {
			tid = appTenant
		}
		if grant.GrantType == "authorization_code" && codeTenant != "" {
			tid = codeTenant
		}
		claims["tid"] = tid
		claims["aud"] = "https://graph.microsoft.com"
		claims["iss"] = "https://sts.windows.net/" + tid + "/"
	}
	grant.IssuedTid, _ = claims["tid"].(string)
	now := time.Now()
	claims["iat"], claims["nbf"], claims["exp"] = now.Unix(), now.Unix(), now.Add(tokenLifetime).Unix()

	respond(http.StatusOK, map[string]any{
		"token_type":   "Bearer",
		"expires_in":   int(tokenLifetime.Seconds()),
		"access_token": mintJWT(claims),
	})
	return true
}

func aadError(code, description string, aadCode int) map[string]any {
	return map[string]any{
		"error":             code,
		"error_description": description + "\r\nTrace ID: 00000000-0000-0000-0000-000000000000",
		"error_codes":       []int{aadCode},
	}
}

// jwtKey signs the tokens the fake issues. Infisical only decodes them, never verifies.
var jwtKey = []byte("harness-azure-token-key")

func mintJWT(claims map[string]any) string {
	enc := base64.RawURLEncoding
	header, _ := json.Marshal(map[string]string{"alg": "HS256", "typ": "JWT"})
	payload, _ := json.Marshal(claims)
	signing := enc.EncodeToString(header) + "." + enc.EncodeToString(payload)
	mac := hmac.New(sha256.New, jwtKey)
	mac.Write([]byte(signing))
	return signing + "." + enc.EncodeToString(mac.Sum(nil))
}

// jwtClaim reads a claim out of a bearer token the fake issued.
func jwtClaim(r *http.Request, name string) (string, bool) {
	token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok {
		return "", false
	}
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return "", false
	}
	raw, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return "", false
	}
	var claims map[string]any
	if json.Unmarshal(raw, &claims) != nil {
		return "", false
	}
	value, ok := claims[name].(string)
	return value, ok && value != ""
}
