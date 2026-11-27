package panos

// CertificateImported is a certificate or key pair imported into the candidate
// configuration.
type CertificateImported struct {
	Name     string `json:"name"`
	Category string `json:"category"`
}

type CertificateDeleted struct {
	Name string `json:"name"`
}

// ProfileUpdated is an SSL/TLS service profile pointed at a certificate.
type ProfileUpdated struct {
	Name        string `json:"name"`
	Certificate string `json:"certificate"`
}

// Committed is the candidate configuration committed, as it was made running.
type Committed struct {
	Commit
}

func (CertificateImported) EventName() string { return "panos.certificate-imported" }
func (CertificateDeleted) EventName() string  { return "panos.certificate-deleted" }
func (ProfileUpdated) EventName() string      { return "panos.profile-updated" }
func (Committed) EventName() string           { return "panos.config-committed" }
