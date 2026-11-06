package acmeca

// ChallengeAccepted is published when a client answers a challenge.
type ChallengeAccepted struct {
	Identifier string `json:"identifier"`
	Token      string `json:"token"`
}

func (ChallengeAccepted) EventName() string { return "acmeca.challenge-accepted" }

// CertificateIssued is published when a finalized order is signed.
type CertificateIssued struct{ Issued }

func (CertificateIssued) EventName() string { return "acmeca.certificate-issued" }
