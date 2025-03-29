package v1alpha1

type GenericInfisicalAuthentication struct {
	// +kubebuilder:validation:Optional
	UniversalAuth GenericUniversalAuth `json:"universalAuth,omitempty"`
	// +kubebuilder:validation:Optional
	KubernetesAuth GenericKubernetesAuth `json:"kubernetesAuth,omitempty"`
	// +kubebuilder:validation:Optional
	AwsIamAuth GenericAwsIamAuth `json:"awsIamAuth,omitempty"`
	// +kubebuilder:validation:Optional
	AzureAuth GenericAzureAuth `json:"azureAuth,omitempty"`
	// +kubebuilder:validation:Optional
	GcpIdTokenAuth GenericGcpIdTokenAuth `json:"gcpIdTokenAuth,omitempty"`
	// +kubebuilder:validation:Optional
	GcpIamAuth GenericGcpIamAuth `json:"gcpIamAuth,omitempty"`
}

type GenericUniversalAuth struct {
	// +kubebuilder:validation:Required
	CredentialsRef KubeSecretReference `json:"credentialsRef"`
}

type GenericAwsIamAuth struct {
	// +kubebuilder:validation:Required
	IdentityID string `json:"identityId"`
}

type GenericAzureAuth struct {
	// +kubebuilder:validation:Required
	IdentityID string `json:"identityId"`
	// +kubebuilder:validation:Optional
	Resource string `json:"resource,omitempty"`
}

type GenericGcpIdTokenAuth struct {
	// +kubebuilder:validation:Required
	IdentityID string `json:"identityId"`
}

type GenericGcpIamAuth struct {
	// +kubebuilder:validation:Required
	IdentityID string `json:"identityId"`
	// +kubebuilder:validation:Required
	ServiceAccountKeyFilePath string `json:"serviceAccountKeyFilePath"`
}

type GenericKubernetesAuth struct {
	// +kubebuilder:validation:Required
	IdentityID string `json:"identityId"`
	// +kubebuilder:validation:Required
	ServiceAccountRef KubernetesServiceAccountRef `json:"serviceAccountRef"`
}

type TLSConfig struct {
	// Reference to secret containing CA cert
	// +kubebuilder:validation:Optional
	CaRef CaReference `json:"caRef,omitempty"`
}

type CaReference struct {
	// The name of the Kubernetes Secret
	// +kubebuilder:validation:Required
	SecretName string `json:"secretName"`

	// The namespace where the Kubernetes Secret is located
	// +kubebuilder:validation:Required
	SecretNamespace string `json:"secretNamespace"`

	// +kubebuilder:validation:Required
	// The name of the secret property with the CA certificate value
	SecretKey string `json:"key"`
}

type KubeSecretReference struct {
	// The name of the Kubernetes Secret
	// +kubebuilder:validation:Required
	SecretName string `json:"secretName"`

	// The name space where the Kubernetes Secret is located
	// +kubebuilder:validation:Required
	SecretNamespace string `json:"secretNamespace"`
}

type ManagedKubeSecretConfig struct {
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

	// The template to transform the secret data
	// +kubebuilder:validation:Optional
	Template *SecretTemplate `json:"template,omitempty"`
}

type ManagedKubeConfigMapConfig struct {
	// The name of the Kubernetes ConfigMap
	// +kubebuilder:validation:Required
	ConfigMapName string `json:"configMapName"`

	// The Kubernetes ConfigMap creation policy.
	// Enum with values: 'Owner', 'Orphan'.
	// Owner creates the config map and sets .metadata.ownerReferences of the InfisicalSecret CRD that created it.
	// Orphan will not set the config map owner. This will result in the config map being orphaned and not deleted when the resource is deleted.
	// +kubebuilder:validation:Optional
	// +kubebuilder:default:=Orphan
	CreationPolicy string `json:"creationPolicy"`

	// The namespace where the Kubernetes ConfigMap is located
	// +kubebuilder:validation:Required
	ConfigMapNamespace string `json:"configMapNamespace"`

	// The template to transform the secret data
	// +kubebuilder:validation:Optional
	Template *SecretTemplate `json:"template,omitempty"`
}

type SecretTemplate struct {
	// This injects all retrieved secrets into the top level of your template.
	// Secrets defined in the template will take precedence over the injected ones.
	// +kubebuilder:validation:Optional
	IncludeAllSecrets bool `json:"includeAllSecrets"`
	// The template key values
	// +kubebuilder:validation:Optional
	Data map[string]string `json:"data,omitempty"`
}
