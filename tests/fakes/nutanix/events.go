package nutanix

// CertificateReplaced is a cluster's SSL certificate slot taking a new certificate.
type CertificateReplaced struct {
	ClusterID string `json:"clusterId"`
}

func (CertificateReplaced) EventName() string { return "nutanix.certificate-replaced" }
