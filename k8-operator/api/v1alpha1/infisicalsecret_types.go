package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type KubeSecretReference struct {
	// The name of the Kubernetes Secret
	// +kubebuilder:validation:Required
	Name string `json:"name"`

	// The name space where the Kubernetes Secret is located
	// +kubebuilder:validation:Required
	Namespace string `json:"namespace,omitempty"`
}

// InfisicalSecretSpec defines the desired state of InfisicalSecret
type InfisicalSecretSpec struct {
	InfisicalToken KubeSecretReference `json:"infisicalToken,omitempty"`
	ManagedSecret  KubeSecretReference `json:"managedSecret,omitempty"`

	// The Infisical project id
	// +kubebuilder:validation:Required
	ProjectId string `json:"projectId,omitempty"`

	// The Infisical environment such as dev, prod, testing
	// +kubebuilder:validation:Required
	Environment string `json:"environment,omitempty"`
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
