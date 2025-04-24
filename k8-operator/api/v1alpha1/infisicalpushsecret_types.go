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
	EnvironmentSlug string `json:"environmentSlug"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Immutable
	ProjectID string `json:"projectId"`
}

type InfisicalPushSecretSecretSource struct {
	// The name of the Kubernetes Secret
	// +kubebuilder:validation:Required
	SecretName string `json:"secretName"`

	// The name space where the Kubernetes Secret is located
	// +kubebuilder:validation:Required
	SecretNamespace string `json:"secretNamespace"`

	// +kubebuilder:validation:Optional
	Template *SecretTemplate `json:"template,omitempty"`
}

type SecretPush struct {
	// +kubebuilder:validation:Required
	Secret InfisicalPushSecretSecretSource `json:"secret"`
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
	Authentication GenericInfisicalAuthentication `json:"authentication"`

	// +kubebuilder:validation:Required
	Push SecretPush `json:"push"`

	ResyncInterval string `json:"resyncInterval"`

	// Infisical host to pull secrets from
	// +kubebuilder:validation:Optional
	HostAPI string `json:"hostAPI"`

	// +kubebuilder:validation:Optional
	TLS TLSConfig `json:"tls"`
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
