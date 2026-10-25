package oidcidp

// TokenIssued is a code redeemed for an ID token: Infisical completed a login.
type TokenIssued struct {
	Subject string `json:"subject"`
	Email   string `json:"email"`
}

func (TokenIssued) EventName() string { return "oidc.token-issued" }
