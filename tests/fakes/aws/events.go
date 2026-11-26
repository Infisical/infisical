package aws

import "time"

// ParameterDetail names a Parameter Store parameter by its full name, such as /app/DB_URL.
type ParameterDetail struct {
	Name string `json:"name"`
}

// ParameterPut is a PutParameter that stored a value, new or overwritten.
type ParameterPut struct {
	ParameterDetail
	Version int64 `json:"version"`
}

type ParameterDeleted struct{ ParameterDetail }
type ParameterTagged struct{ ParameterDetail }
type ParameterUntagged struct{ ParameterDetail }

func (ParameterPut) EventName() string      { return "aws.parameter-put" }
func (ParameterDeleted) EventName() string  { return "aws.parameter-deleted" }
func (ParameterTagged) EventName() string   { return "aws.parameter-tagged" }
func (ParameterUntagged) EventName() string { return "aws.parameter-untagged" }

// SecretDetail names a Secrets Manager secret.
type SecretDetail struct {
	Name string `json:"name"`
}

type SecretCreated struct{ SecretDetail }
type SecretUpdated struct{ SecretDetail }
type SecretDeleted struct{ SecretDetail }
type SecretTagged struct{ SecretDetail }
type SecretUntagged struct{ SecretDetail }

func (SecretCreated) EventName() string  { return "aws.secret-created" }
func (SecretUpdated) EventName() string  { return "aws.secret-updated" }
func (SecretDeleted) EventName() string  { return "aws.secret-deleted" }
func (SecretTagged) EventName() string   { return "aws.secret-tagged" }
func (SecretUntagged) EventName() string { return "aws.secret-untagged" }

// UserDetail names an IAM user.
type UserDetail struct {
	UserName string `json:"userName"`
}

type UserCreated struct{ UserDetail }
type UserDeleted struct{ UserDetail }

func (UserCreated) EventName() string { return "aws.user-created" }
func (UserDeleted) EventName() string { return "aws.user-deleted" }

// AccessKeyDetail names one of an IAM user's access keys.
type AccessKeyDetail struct {
	UserName    string `json:"userName"`
	AccessKeyID string `json:"accessKeyId"`
}

type AccessKeyCreated struct{ AccessKeyDetail }
type AccessKeyDeleted struct{ AccessKeyDetail }

func (AccessKeyCreated) EventName() string { return "aws.access-key-created" }
func (AccessKeyDeleted) EventName() string { return "aws.access-key-deleted" }

// RoleAssumed is an AssumeRole STS granted, published on the caller's scope with the
// external ID the caller sent, which is what the role's trust policy checked.
type RoleAssumed struct {
	RoleArn    string `json:"roleArn"`
	ExternalID string `json:"externalId"`
}

func (RoleAssumed) EventName() string { return "aws.role-assumed" }

// KeyDetail names a KMS key by its id.
type KeyDetail struct {
	KeyID string `json:"keyId"`
}

type KeyCreated struct{ KeyDetail }

func (KeyCreated) EventName() string { return "aws.key-created" }

// ACMCertificateDetail names an ACM certificate.
type ACMCertificateDetail struct {
	ARN        string `json:"arn"`
	DomainName string `json:"domainName"`
}

// CertificateImported is an ImportCertificate, new or a reimport over an existing ARN.
type CertificateImported struct {
	ACMCertificateDetail
	Reimported bool `json:"reimported"`
}

type CertificateRequested struct{ ACMCertificateDetail }
type CertificateIssued struct{ ACMCertificateDetail }
type CertificateExported struct{ ACMCertificateDetail }

// CertificateDeleted carries when it happened, for tests that check it came after an
// event from another service.
type CertificateDeleted struct {
	ACMCertificateDetail
	At time.Time `json:"at"`
}
type CertificateTagged struct{ ACMCertificateDetail }

func (CertificateImported) EventName() string  { return "aws.certificate-imported" }
func (CertificateRequested) EventName() string { return "aws.certificate-requested" }
func (CertificateIssued) EventName() string    { return "aws.certificate-issued" }
func (CertificateExported) EventName() string  { return "aws.certificate-exported" }
func (CertificateDeleted) EventName() string   { return "aws.certificate-deleted" }
func (CertificateTagged) EventName() string    { return "aws.certificate-tagged" }

// PrivateCertificateIssued is an IssueCertificate on an AWS Private CA.
type PrivateCertificateIssued struct {
	CertificateAuthorityArn string `json:"certificateAuthorityArn"`
	CertificateArn          string `json:"certificateArn"`
}

func (PrivateCertificateIssued) EventName() string { return "aws.private-certificate-issued" }

// ListenerDetail names an Elastic Load Balancing listener.
type ListenerDetail struct {
	ListenerArn string `json:"listenerArn"`
}

type ListenerCertificateAdded struct {
	ListenerDetail
	CertificateArn string `json:"certificateArn"`
}

type ListenerCertificateRemoved struct {
	ListenerDetail
	CertificateArn string    `json:"certificateArn"`
	At             time.Time `json:"at"`
}

func (ListenerCertificateAdded) EventName() string   { return "aws.listener-certificate-added" }
func (ListenerCertificateRemoved) EventName() string { return "aws.listener-certificate-removed" }

// RecordDetail names a Route 53 record set.
type RecordDetail struct {
	ZoneID string `json:"zoneId"`
	Name   string `json:"name"`
	Type   string `json:"type"`
}

// RecordChanged is one change in a ChangeResourceRecordSets batch: UPSERT or DELETE.
type RecordChanged struct {
	RecordDetail
	Action string `json:"action"`
}

func (RecordChanged) EventName() string { return "aws.record-changed" }
