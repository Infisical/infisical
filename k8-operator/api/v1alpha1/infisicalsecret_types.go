package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type ServiceTokenDetails struct {
	ServiceTokenSecretReference KubeSecretReference `json:"serviceTokenSecretReference"`
}

type ServiceAccountDetails struct {
	ServiceAccountSecretReference KubeSecretReference `json:"serviceAccountSecretReference"`
	ProjectId                     string              `json:"projectId"`
	EnvironmentName               string              `json:"environmentName"`
}

type Authentication struct {
	// +kubebuilder:validation:Optional
	ServiceAccount ServiceAccountDetails `json:"serviceAccount"`
	// +kubebuilder:validation:Optional
	ServiceToken ServiceTokenDetails `json:"serviceToken"`
}

type KubeSecretReference struct {
	// The name of the Kubernetes Secret
	// +kubebuilder:validation:Required
	SecretName string `json:"secretName"`

	// The name space where the Kubernetes Secret is located
	// +kubebuilder:validation:Required
	SecretNamespace string `json:"secretNamespace"`
}

// InfisicalSecretSpec defines the desired state of InfisicalSecret
type InfisicalSecretSpec struct {
	// +kubebuilder:validation:Optional
	TokenSecretReference KubeSecretReference `json:"tokenSecretReference"`

	// +kubebuilder:validation:Optional
	Authentication Authentication `json:"authentication"`

	// +kubebuilder:validation:Required
	ManagedSecretReference KubeSecretReference `json:"managedSecretReference"`

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
