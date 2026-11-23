package aws

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
