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
	UniversalAuthMachineIdentity UniversalAuthMachineIdentityDetails `json:"universalAuthMachineIdentity"`
}

type UniversalAuthMachineIdentityDetails struct {
	// +kubebuilder:validation:Required
	Credentials KubeSecretReference `json:"credentials"`
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
}

type MachineIdentityScopeInWorkspace struct {
	// +kubebuilder:validation:Required
	SecretsPath string `json:"secretsPath"`
	// +kubebuilder:validation:Required
	EnvSlug string `json:"envSlug"`
	// +kubebuilder:validation:Required
	ProjectId string `json:"projectId"`
}

type KubeSecretReference struct {
	// The name of the Kubernetes Secret
	// +kubebuilder:validation:Required
	SecretName string `json:"secretName"`

	// The name space where the Kubernetes Secret is located
	// +kubebuilder:validation:Required
	SecretNamespace string `json:"secretNamespace"`
}

type MangedKubeSecretConfig struct {
	// The name of the Kubernetes Secret
	// +kubebuilder:validation:Required
	SecretName string `json:"secretName"`

	// The name space where the Kubernetes Secret is located
	// +kubebuilder:validation:Required
	SecretNamespace string `json:"secretNamespace"`

	// The Kubernetes Secret type (experimental feature). More info: https://kubernetes.io/docs/concepts/configuration/secret/#secret-types
	// +kubebuilder:validation:Optional
	// +kubebuilder:default:=Opaque
	SecretType string `json:"secretType"`

	// The Kubernetes Secret creation policy.
	// Enum with values: 'Owner', 'Orphan'.
	// Owner creates the secret and sets .metadata.ownerReferences of the InfisicalSecret CRD that created it.
	// Orphan will not set the secret owner. This will result in the secret being orphaned and not deleted when the resource is deleted.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default:=Orphan
	CreationPolicy string `json:"creationPolicy"`
}

// InfisicalSecretSpec defines the desired state of InfisicalSecret
type InfisicalSecretSpec struct {
	// +kubebuilder:validation:Optional
	TokenSecretReference KubeSecretReference `json:"tokenSecretReference"`

	// +kubebuilder:validation:Optional
	Authentication Authentication `json:"authentication"`

	// +kubebuilder:validation:Required
	ManagedSecretReference MangedKubeSecretConfig `json:"managedSecretReference"`

	// +kubebuilder:default:=60
	ResyncInterval int `json:"resyncInterval"`

	// Infisical host to pull secrets from
	// +kubebuilder:validation:Optional
	HostAPI string `json:"hostAPI"`
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
