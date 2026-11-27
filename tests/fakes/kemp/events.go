package kemp

// CertificateAdded is a bundle stored under an identifier, new or replacing one.
type CertificateAdded struct {
	Name     string `json:"name"`
	Replaced bool   `json:"replaced"`
}

type CertificateDeleted struct {
	Name string `json:"name"`
}

// IntermediateAdded is a CA certificate stored in the intermediate store.
type IntermediateAdded struct {
	Name string `json:"name"`
}

// VirtualServiceModified is the list of certificates a Virtual Service serves replaced.
type VirtualServiceModified struct {
	Index     string   `json:"index"`
	CertFiles []string `json:"certFiles"`
}

func (CertificateAdded) EventName() string   { return "kemp.certificate-added" }
func (CertificateDeleted) EventName() string { return "kemp.certificate-deleted" }
func (IntermediateAdded) EventName() string  { return "kemp.intermediate-added" }
func (VirtualServiceModified) EventName() string {
	return "kemp.virtual-service-modified"
}
