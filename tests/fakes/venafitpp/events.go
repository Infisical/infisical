package venafitpp

// CertificateRequested is published when a certificate is requested under a policy.
type CertificateRequested struct {
	DN string `json:"dn"`
}

// TokenRevoked is published when a client revokes its access token.
type TokenRevoked struct {
	Username string `json:"username"`
}

func (CertificateRequested) EventName() string { return "venafitpp.certificate-requested" }
func (TokenRevoked) EventName() string         { return "venafitpp.token-revoked" }
