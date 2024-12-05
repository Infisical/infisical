package model

type ServiceAccountDetails struct {
	AccessKey  string
	PublicKey  string
	PrivateKey string
}

type MachineIdentityDetails struct {
	ClientId     string
	ClientSecret string
}

type RequestUpdateUpdateDetails struct {
	Modified bool
	ETag     string
}

type SingleEnvironmentVariable struct {
	Key        string `json:"key"`
	Value      string `json:"value"`
	SecretPath string `json:"secretPath"`
	Type       string `json:"type"`
	ID         string `json:"id"`
}

type SecretTemplateOptions struct {
	Value      string `json:"value"`
	SecretPath string `json:"secretPath"`
}
