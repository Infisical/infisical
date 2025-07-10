/*
Copyright 2022.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package v1alpha1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type InfisicalDynamicSecretLease struct {
	ID                string      `json:"id"`
	Version           int64       `json:"version"`
	CreationTimestamp metav1.Time `json:"creationTimestamp"`
	ExpiresAt         metav1.Time `json:"expiresAt"`
}

type DynamicSecretDetails struct {
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Immutable
	SecretName string `json:"secretName"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Immutable
	SecretPath string `json:"secretsPath"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Immutable
	EnvironmentSlug string `json:"environmentSlug"`
	// +kubebuilder:validation:Required
	// +kubebuilder:validation:Immutable
	ProjectID string `json:"projectId"`
}

// InfisicalDynamicSecretSpec defines the desired state of InfisicalDynamicSecret.
type InfisicalDynamicSecretSpec struct {
	// +kubebuilder:validation:Required
	ManagedSecretReference ManagedKubeSecretConfig `json:"managedSecretReference"` // The destination to store the lease in.

	// +kubebuilder:validation:Required
	Authentication GenericInfisicalAuthentication `json:"authentication"` // The authentication to use for authenticating with Infisical.

	// +kubebuilder:validation:Required
	DynamicSecret DynamicSecretDetails `json:"dynamicSecret"` // The dynamic secret to create the lease for. Required.

	LeaseRevocationPolicy string `json:"leaseRevocationPolicy"` // Revoke will revoke the lease when the resource is deleted. Optional, will default to no revocation.
	LeaseTTL              string `json:"leaseTTL"`              // The TTL of the lease in seconds. Optional, will default to the dynamic secret default TTL.

	// +kubebuilder:validation:Optional
	HostAPI string `json:"hostAPI"`

	// +kubebuilder:validation:Optional
	TLS TLSConfig `json:"tls"`
}

// InfisicalDynamicSecretStatus defines the observed state of InfisicalDynamicSecret.
type InfisicalDynamicSecretStatus struct {
	Conditions []metav1.Condition `json:"conditions"`

	Lease           *InfisicalDynamicSecretLease `json:"lease,omitempty"`
	DynamicSecretID string                       `json:"dynamicSecretId,omitempty"`
	// The MaxTTL can be null, if it's null, there's no max TTL and we should never have to renew.
	MaxTTL string `json:"maxTTL,omitempty"`
}

// +kubebuilder:object:root=true
// +kubebuilder:subresource:status

// InfisicalDynamicSecret is the Schema for the infisicaldynamicsecrets API.
type InfisicalDynamicSecret struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   InfisicalDynamicSecretSpec   `json:"spec,omitempty"`
	Status InfisicalDynamicSecretStatus `json:"status,omitempty"`
}

// +kubebuilder:object:root=true

// InfisicalDynamicSecretList contains a list of InfisicalDynamicSecret.
type InfisicalDynamicSecretList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []InfisicalDynamicSecret `json:"items"`
}

func init() {
	SchemeBuilder.Register(&InfisicalDynamicSecret{}, &InfisicalDynamicSecretList{})
}
