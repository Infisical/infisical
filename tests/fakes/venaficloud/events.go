package venaficloud

// CertificateIssued is published when a certificate request is issued.
type CertificateIssued struct {
	RequestID     string `json:"requestId"`
	CertificateID string `json:"certificateId"`
	ApplicationID string `json:"applicationId"`
	TemplateID    string `json:"templateId"`
}

func (CertificateIssued) EventName() string { return "venaficloud.certificate-issued" }
