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

type Project struct {
	ID           string `json:"id"`
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	OrgID        string `json:"orgId"`
	Environments []struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
		ID   string `json:"id"`
	}
}
