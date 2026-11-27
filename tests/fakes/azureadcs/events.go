package azureadcs

// CertificateIssued is published when a request is issued under a template.
type CertificateIssued struct {
	RequestID int    `json:"requestId"`
	Template  string `json:"template"`
	Username  string `json:"username"`
}

// RequestDenied is published when a request names a template the CA does not offer.
type RequestDenied struct {
	RequestID int    `json:"requestId"`
	Template  string `json:"template"`
}

func (CertificateIssued) EventName() string { return "azureadcs.certificate-issued" }
func (RequestDenied) EventName() string     { return "azureadcs.request-denied" }
