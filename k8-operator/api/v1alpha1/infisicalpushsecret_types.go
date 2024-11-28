package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type InfisicalPushSecretDestination struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Immutable
	SecretsPath string `json:"secretsPath"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Immutable
	EnvSlug string `json:"envSlug"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Immutable
	ProjectID string `json:"projectId"`
}

type PushSecretTlsConfig struct {
	// Reference to secret containing CA cert
	// +kubebuilder:validation:Optional
	CaRef CaReference `json:"caRef,omitempty"`
}

// PushSecretUniversalAuth defines universal authentication
type PushSecretUniversalAuth struct {
	// +kubebuilder:validation:Required
	CredentialsRef KubeSecretReference `json:"credentialsRef"`
}

type PushSecretAwsIamAuth struct {
	// +kubebuilder:validation:Required
	IdentityID string `json:"identityId"`
}

type PushSecretAzureAuth struct {
	// +kubebuilder:validation:Required
	IdentityID string `json:"identityId"`
	// +kubebuilder:validation:Optional
	Resource string `json:"resource,omitempty"`
}

type PushSecretGcpIdTokenAuth struct {
	// +kubebuilder:validation:Required
	IdentityID string `json:"identityId"`
}

type PushSecretGcpIamAuth struct {
	// +kubebuilder:validation:Required
	IdentityID string `json:"identityId"`
	// +kubebuilder:validation:Required
	ServiceAccountKeyFilePath string `json:"serviceAccountKeyFilePath"`
}

// Rest of your types should be defined similarly...
type PushSecretKubernetesAuth struct {
	// +kubebuilder:validation:Required
	IdentityID string `json:"identityId"`
	// +kubebuilder:validation:Required
	ServiceAccountRef KubernetesServiceAccountRef `json:"serviceAccountRef"`
}

type PushSecretAuthentication struct {
	// +kubebuilder:validation:Optional
	UniversalAuth PushSecretUniversalAuth `json:"universalAuth,omitempty"`
	// +kubebuilder:validation:Optional
	KubernetesAuth PushSecretKubernetesAuth `json:"kubernetesAuth,omitempty"`
	// +kubebuilder:validation:Optional
	AwsIamAuth PushSecretAwsIamAuth `json:"awsIamAuth,omitempty"`
	// +kubebuilder:validation:Optional
	AzureAuth PushSecretAzureAuth `json:"azureAuth,omitempty"`
	// +kubebuilder:validation:Optional
	GcpIdTokenAuth PushSecretGcpIdTokenAuth `json:"gcpIdTokenAuth,omitempty"`
	// +kubebuilder:validation:Optional
	GcpIamAuth PushSecretGcpIamAuth `json:"gcpIamAuth,omitempty"`
}

type SecretPush struct {
	// +kubebuilder:validation:Required
	Secret KubeSecretReference `json:"secret"`
}

// InfisicalPushSecretSpec defines the desired state of InfisicalPushSecret
type InfisicalPushSecretSpec struct {
	// +kubebuilder:validation:Optional
	UpdatePolicy string `json:"updatePolicy"`

	// +kubebuilder:validation:Optional
	DeletionPolicy string `json:"deletionPolicy"`

	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Immutable
	Destination InfisicalPushSecretDestination `json:"destination"`

	// +kubebuilder:validation:Optional
	Authentication PushSecretAuthentication `json:"authentication"`

	// +kubebuilder:validation:Required
	Push SecretPush `json:"push"`

	ResyncInterval string `json:"resyncInterval"`

	// Infisical host to pull secrets from
	// +kubebuilder:validation:Optional
	HostAPI string `json:"hostAPI"`

	// +kubebuilder:validation:Optional
	TLS PushSecretTlsConfig `json:"tls"`
}

// InfisicalPushSecretStatus defines the observed state of InfisicalPushSecret
type InfisicalPushSecretStatus struct {
	Conditions []metav1.Condition `json:"conditions"`

	// managed secrets is a map where the key is the ID, and the value is the secret key (string[id], string[key] )
	ManagedSecrets map[string]string `json:"managedSecrets"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// InfisicalPushSecret is the Schema for the infisicalpushsecrets API
type InfisicalPushSecret struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   InfisicalPushSecretSpec   `json:"spec,omitempty"`
	Status InfisicalPushSecretStatus `json:"status,omitempty"`
}

//+kubebuilder:object:root=true

// InfisicalPushSecretList contains a list of InfisicalPushSecret
type InfisicalPushSecretList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []InfisicalPushSecret `json:"items"`
}

func init() {
	SchemeBuilder.Register(&InfisicalPushSecret{}, &InfisicalPushSecretList{})
}
