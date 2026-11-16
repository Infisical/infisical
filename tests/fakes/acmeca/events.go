package acmeca

// ChallengeAccepted is published when a client answers a challenge.
type ChallengeAccepted struct {
	Identifier string `json:"identifier"`
	Token      string `json:"token"`
}

func (ChallengeAccepted) EventName() string { return "acmeca.challenge-accepted" }

// ChallengeRejected is published when a client answers a challenge whose DNS-01
// record is missing or does not hold the key authorization digest.
type ChallengeRejected struct {
	Identifier string   `json:"identifier"`
	Record     string   `json:"record"`
	Want       string   `json:"want"`
	Got        []string `json:"got"`
}

func (ChallengeRejected) EventName() string { return "acmeca.challenge-rejected" }

// CertificateIssued is published when a finalized order is signed.
type CertificateIssued struct{ Issued }

func (CertificateIssued) EventName() string { return "acmeca.certificate-issued" }
