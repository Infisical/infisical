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
