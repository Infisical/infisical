package godaddy

// CertificateDetail names a certificate order.
type CertificateDetail struct {
	CertificateID string `json:"certificateId"`
	CommonName    string `json:"commonName"`
}

// CertificateOrdered is published when an order is placed.
type CertificateOrdered CertificateDetail

// CertificateIssued is published when an order's certificate is issued.
type CertificateIssued CertificateDetail

func (CertificateOrdered) EventName() string { return "godaddy.certificate-ordered" }
func (CertificateIssued) EventName() string  { return "godaddy.certificate-issued" }

// CertificateRenewalRequested is published when GoDaddy accepts a renewal.
type CertificateRenewalRequested CertificateDetail

// CertificateRevoked is published when a certificate is revoked.
type CertificateRevoked struct {
	CertificateID string `json:"certificateId"`
	CommonName    string `json:"commonName"`
	Reason        string `json:"reason"`
}

func (CertificateRenewalRequested) EventName() string { return "godaddy.certificate-renewal-requested" }
func (CertificateRevoked) EventName() string          { return "godaddy.certificate-revoked" }
