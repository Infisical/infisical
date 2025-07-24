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

// GeneratorKind represents a kind of generator.
// +kubebuilder:validation:Enum=Password;UUID
type GeneratorKind string

const (
	GeneratorKindPassword GeneratorKind = "Password"
	GeneratorKindUUID     GeneratorKind = "UUID"
)

type ClusterGeneratorSpec struct {
	// Kind the kind of this generator.
	Kind GeneratorKind `json:"kind"`

	// Generator the spec for this generator, must match the kind.
	Generator GeneratorSpec `json:"generator,omitempty"`
}

type GeneratorSpec struct {
	// +kubebuilder:validation:Optional
	PasswordSpec *PasswordSpec `json:"passwordSpec,omitempty"`
	// +kubebuilder:validation:Optional
	UUIDSpec *UUIDSpec `json:"uuidSpec,omitempty"`
}

// ClusterGenerator represents a cluster-wide generator
// +kubebuilder:object:root=true
// +kubebuilder:storageversion
// +kubebuilder:subresource:status
// +kubebuilder:resource:scope=Cluster
type ClusterGenerator struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec ClusterGeneratorSpec `json:"spec,omitempty"`
}

// +kubebuilder:object:root=true

// ClusterGeneratorList contains a list of ClusterGenerator resources.
type ClusterGeneratorList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []ClusterGenerator `json:"items"`
}

// ! UUID Generator

// UUIDSpec controls the behavior of the uuid generator.
type UUIDSpec struct{}

// UUID generates a version 4 UUID (e56657e3-764f-11ef-a397-65231a88c216).
// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
type UUID struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec UUIDSpec `json:"spec,omitempty"`
}

// +kubebuilder:object:root=true

// UUIDList contains a list of UUID resources.
type UUIDList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []UUID `json:"items"`
}

// ! Password Generator

// PasswordSpec controls the behavior of the password generator.
type PasswordSpec struct {
	// Length of the password to be generated.
	// Defaults to 24
	// +kubebuilder:validation:Optional
	// +kubebuilder:default=24
	Length int `json:"length"`

	// digits specifies the number of digits in the generated
	// password. If omitted it defaults to 25% of the length of the password
	Digits *int `json:"digits,omitempty"`

	// symbols specifies the number of symbol characters in the generated
	// password. If omitted it defaults to 25% of the length of the password
	Symbols *int `json:"symbols,omitempty"`

	// symbolCharacters specifies the special characters that should be used
	// in the generated password.
	SymbolCharacters *string `json:"symbolCharacters,omitempty"`

	// Set noUpper to disable uppercase characters
	// +kubebuilder:validation:Optional
	// +kubebuilder:default=false
	NoUpper bool `json:"noUpper"`

	// set allowRepeat to true to allow repeating characters.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default=false
	AllowRepeat bool `json:"allowRepeat"`
}

// Password generates a random password based on the
// configuration parameters in spec.
// You can specify the length, characterset and other attributes.
// +kubebuilder:object:root=true
// +kubebuilder:storageversion
// +kubebuilder:subresource:status
// +kubebuilder:resource:scope=Namespaced
type Password struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec PasswordSpec `json:"spec,omitempty"`
}

// +kubebuilder:object:root=true

// PasswordList contains a list of Password resources.
type PasswordList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []Password `json:"items"`
}

func init() {
	SchemeBuilder.Register(&Password{}, &PasswordList{})
	SchemeBuilder.Register(&UUID{}, &UUIDList{})
	SchemeBuilder.Register(&ClusterGenerator{}, &ClusterGeneratorList{})
}
