package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type Authentication struct {
	// +kubebuilder:validation:Optional
	ServiceAccount ServiceAccountDetails `json:"serviceAccount"`
	// +kubebuilder:validation:Optional
	ServiceToken ServiceTokenDetails `json:"serviceToken"`
	// +kubebuilder:validation:Optional
	UniversalAuth UniversalAuthDetails `json:"universalAuth"`
	// +kubebuilder:validation:Optional
	KubernetesAuth KubernetesAuthDetails `json:"kubernetesAuth"`
	// +kubebuilder:validation:Optional
	AwsIamAuth AWSIamAuthDetails `json:"awsIamAuth"`
	// +kubebuilder:validation:Optional
	AzureAuth AzureAuthDetails `json:"azureAuth"`
	// +kubebuilder:validation:Optional
	GcpIdTokenAuth GCPIdTokenAuthDetails `json:"gcpIdTokenAuth"`
	// +kubebuilder:validation:Optional
	GcpIamAuth GcpIamAuthDetails `json:"gcpIamAuth"`
}

type UniversalAuthDetails struct {
	// +kubebuilder:validation:Required
	CredentialsRef KubeSecretReference `json:"credentialsRef"`
	// +kubebuilder:validation:Required
	SecretsScope MachineIdentityScopeInWorkspace `json:"secretsScope"`
}

type KubernetesAuthDetails struct {
	// +kubebuilder:validation:Required
	IdentityID string `json:"identityId"`
	// +kubebuilder:validation:Required
	ServiceAccountRef KubernetesServiceAccountRef `json:"serviceAccountRef"`

	// +kubebuilder:validation:Required
	SecretsScope MachineIdentityScopeInWorkspace `json:"secretsScope"`
}

type KubernetesServiceAccountRef struct {
	// +kubebuilder:validation:Required
	Name string `json:"name"`
	// +kubebuilder:validation:Required
	Namespace string `json:"namespace"`
}

type AWSIamAuthDetails struct {
	// +kubebuilder:validation:Required
	IdentityID string `json:"identityId"`

	// +kubebuilder:validation:Required
	SecretsScope MachineIdentityScopeInWorkspace `json:"secretsScope"`
}

type AzureAuthDetails struct {
	// +kubebuilder:validation:Required
	IdentityID string `json:"identityId"`
	// +kubebuilder:validation:Optional
	Resource string `json:"resource"`

	// +kubebuilder:validation:Required
	SecretsScope MachineIdentityScopeInWorkspace `json:"secretsScope"`
}

type GCPIdTokenAuthDetails struct {
	// +kubebuilder:validation:Required
	IdentityID string `json:"identityId"`

	// +kubebuilder:validation:Required
	SecretsScope MachineIdentityScopeInWorkspace `json:"secretsScope"`
}

type GcpIamAuthDetails struct {
	// +kubebuilder:validation:Required
	IdentityID string `json:"identityId"`
	// +kubebuilder:validation:Required
	ServiceAccountKeyFilePath string `json:"serviceAccountKeyFilePath"`

	// +kubebuilder:validation:Required
	SecretsScope MachineIdentityScopeInWorkspace `json:"secretsScope"`
}

type ServiceTokenDetails struct {
	// +kubebuilder:validation:Required
	ServiceTokenSecretReference KubeSecretReference `json:"serviceTokenSecretReference"`
	// +kubebuilder:validation:Required
	SecretsScope SecretScopeInWorkspace `json:"secretsScope"`
}

type ServiceAccountDetails struct {
	ServiceAccountSecretReference KubeSecretReference `json:"serviceAccountSecretReference"`
	ProjectId                     string              `json:"projectId"`
	EnvironmentName               string              `json:"environmentName"`
}

type SecretScopeInWorkspace struct {
	// +kubebuilder:validation:Required
	SecretsPath string `json:"secretsPath"`
	// +kubebuilder:validation:Required
	EnvSlug string `json:"envSlug"`
	// +kubebuilder:validation:Optional
	Recursive bool `json:"recursive"`
}

type MachineIdentityScopeInWorkspace struct {
	// +kubebuilder:validation:Required
	SecretsPath string `json:"secretsPath"`
	// +kubebuilder:validation:Required
	EnvSlug string `json:"envSlug"`
	// +kubebuilder:validation:Required
	ProjectSlug string `json:"projectSlug"`
	// +kubebuilder:validation:Optional
	Recursive bool `json:"recursive"`
}

// InfisicalSecretSpec defines the desired state of InfisicalSecret
type InfisicalSecretSpec struct {
	// +kubebuilder:validation:Optional
	TokenSecretReference KubeSecretReference `json:"tokenSecretReference"`

	// +kubebuilder:validation:Optional
	Authentication Authentication `json:"authentication"`

	// +kubebuilder:validation:Optional
	ManagedSecretReference ManagedKubeSecretConfig `json:"managedSecretReference"`

	// +kubebuilder:validation:Optional
	ManagedKubeSecretReferences []ManagedKubeSecretConfig `json:"managedKubeSecretReferences"`
	// +kubebuilder:validation:Optional
	ManagedKubeConfigMapReferences []ManagedKubeConfigMapConfig `json:"managedKubeConfigMapReferences"`

	// +kubebuilder:default:=60
	ResyncInterval int `json:"resyncInterval"`

	// Infisical host to pull secrets from
	// +kubebuilder:validation:Optional
	HostAPI string `json:"hostAPI"`

	// +kubebuilder:validation:Optional
	TLS TLSConfig `json:"tls"`
}

// InfisicalSecretStatus defines the observed state of InfisicalSecret
type InfisicalSecretStatus struct {
	Conditions []metav1.Condition `json:"conditions"`
}

//+kubebuilder:object:root=true
//+kubebuilder:subresource:status

// InfisicalSecret is the Schema for the infisicalsecrets API
type InfisicalSecret struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   InfisicalSecretSpec   `json:"spec,omitempty"`
	Status InfisicalSecretStatus `json:"status,omitempty"`
}

//+kubebuilder:object:root=true

// InfisicalSecretList contains a list of InfisicalSecret
type InfisicalSecretList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []InfisicalSecret `json:"items"`
}

func init() {
	SchemeBuilder.Register(&InfisicalSecret{}, &InfisicalSecretList{})
}
