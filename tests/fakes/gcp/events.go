package gcp

// TokenExchanged is an external token STS accepted for a federated access token. It
// carries what the token said, so a test can assert on what Infisical signed.
type TokenExchanged struct{ Exchange }

// AccessTokenIssued is a service account access token IAM Credentials issued to a
// federated identity.
type AccessTokenIssued struct{ AccessToken }

func (TokenExchanged) EventName() string    { return "gcp.token-exchanged" }
func (AccessTokenIssued) EventName() string { return "gcp.access-token-issued" }
