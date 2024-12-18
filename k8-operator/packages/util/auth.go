package util

import (
	"context"
	"fmt"

	"errors"

	corev1 "k8s.io/api/core/v1"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	infisicalSdk "github.com/infisical/go-sdk"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

func GetServiceAccountToken(k8sClient client.Client, namespace string, serviceAccountName string) (string, error) {

	serviceAccount := &corev1.ServiceAccount{}
	err := k8sClient.Get(context.TODO(), client.ObjectKey{Name: serviceAccountName, Namespace: namespace}, serviceAccount)
	if err != nil {
		return "", err
	}

	if len(serviceAccount.Secrets) == 0 {
		return "", fmt.Errorf("no secrets found for service account %s", serviceAccountName)
	}

	secretName := serviceAccount.Secrets[0].Name

	secret := &corev1.Secret{}
	err = k8sClient.Get(context.TODO(), client.ObjectKey{Name: secretName, Namespace: namespace}, secret)
	if err != nil {
		return "", err
	}

	token := secret.Data["token"]

	return string(token), nil
}

type AuthStrategyType string

var AuthStrategy = struct {
	SERVICE_TOKEN                 AuthStrategyType
	SERVICE_ACCOUNT               AuthStrategyType
	UNIVERSAL_MACHINE_IDENTITY    AuthStrategyType
	KUBERNETES_MACHINE_IDENTITY   AuthStrategyType
	AWS_IAM_MACHINE_IDENTITY      AuthStrategyType
	AZURE_MACHINE_IDENTITY        AuthStrategyType
	GCP_ID_TOKEN_MACHINE_IDENTITY AuthStrategyType
	GCP_IAM_MACHINE_IDENTITY      AuthStrategyType
}{
	SERVICE_TOKEN:                 "SERVICE_TOKEN",
	SERVICE_ACCOUNT:               "SERVICE_ACCOUNT",
	UNIVERSAL_MACHINE_IDENTITY:    "UNIVERSAL_MACHINE_IDENTITY",
	KUBERNETES_MACHINE_IDENTITY:   "KUBERNETES_AUTH_MACHINE_IDENTITY",
	AWS_IAM_MACHINE_IDENTITY:      "AWS_IAM_MACHINE_IDENTITY",
	AZURE_MACHINE_IDENTITY:        "AZURE_MACHINE_IDENTITY",
	GCP_ID_TOKEN_MACHINE_IDENTITY: "GCP_ID_TOKEN_MACHINE_IDENTITY",
	GCP_IAM_MACHINE_IDENTITY:      "GCP_IAM_MACHINE_IDENTITY",
}

type SecretCrdType string

var SecretCrd = struct {
	INFISICAL_SECRET         SecretCrdType
	INFISICAL_PUSH_SECRET    SecretCrdType
	INFISICAL_DYNAMIC_SECRET SecretCrdType
}{
	INFISICAL_SECRET:         "INFISICAL_SECRET",
	INFISICAL_PUSH_SECRET:    "INFISICAL_PUSH_SECRET",
	INFISICAL_DYNAMIC_SECRET: "INFISICAL_DYNAMIC_SECRET",
}

type SecretAuthInput struct {
	Secret interface{}
	Type   SecretCrdType
}

type AuthenticationDetails struct {
	AuthStrategy          AuthStrategyType
	MachineIdentityScope  v1alpha1.MachineIdentityScopeInWorkspace // This will only be set if a machine identity auth method is used (e.g. UniversalAuth or KubernetesAuth, etc.)
	IsMachineIdentityAuth bool
	SecretType            SecretCrdType
}

var ErrAuthNotApplicable = errors.New("authentication not applicable")

func HandleUniversalAuth(ctx context.Context, reconcilerClient client.Client, secretCrd SecretAuthInput, infisicalClient infisicalSdk.InfisicalClientInterface) (AuthenticationDetails, error) {

	var universalAuthSpec v1alpha1.UniversalAuthDetails

	switch secretCrd.Type {
	case SecretCrd.INFISICAL_SECRET:
		infisicalSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalSecret")
		}
		universalAuthSpec = infisicalSecret.Spec.Authentication.UniversalAuth
	case SecretCrd.INFISICAL_PUSH_SECRET:
		infisicalPushSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalPushSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalPushSecret")
		}

		universalAuthSpec = v1alpha1.UniversalAuthDetails{
			CredentialsRef: infisicalPushSecret.Spec.Authentication.UniversalAuth.CredentialsRef,
			SecretsScope:   v1alpha1.MachineIdentityScopeInWorkspace{},
		}

	case SecretCrd.INFISICAL_DYNAMIC_SECRET:
		infisicalDynamicSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalDynamicSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalDynamicSecret")
		}

		universalAuthSpec = v1alpha1.UniversalAuthDetails{
			CredentialsRef: infisicalDynamicSecret.Spec.Authentication.UniversalAuth.CredentialsRef,
			SecretsScope:   v1alpha1.MachineIdentityScopeInWorkspace{},
		}
	}

	universalAuthKubeSecret, err := GetInfisicalUniversalAuthFromKubeSecret(ctx, reconcilerClient, v1alpha1.KubeSecretReference{
		SecretNamespace: universalAuthSpec.CredentialsRef.SecretNamespace,
		SecretName:      universalAuthSpec.CredentialsRef.SecretName,
	})

	if err != nil {
		return AuthenticationDetails{}, fmt.Errorf("ReconcileInfisicalSecret: unable to get machine identity creds from kube secret [err=%s]", err)
	}

	if universalAuthKubeSecret.ClientId == "" && universalAuthKubeSecret.ClientSecret == "" {
		return AuthenticationDetails{}, ErrAuthNotApplicable
	}

	_, err = infisicalClient.Auth().UniversalAuthLogin(universalAuthKubeSecret.ClientId, universalAuthKubeSecret.ClientSecret)
	if err != nil {
		return AuthenticationDetails{}, fmt.Errorf("unable to login with machine identity credentials [err=%s]", err)
	}

	return AuthenticationDetails{
		AuthStrategy:          AuthStrategy.UNIVERSAL_MACHINE_IDENTITY,
		MachineIdentityScope:  universalAuthSpec.SecretsScope,
		IsMachineIdentityAuth: true,
		SecretType:            secretCrd.Type,
	}, nil
}

func HandleKubernetesAuth(ctx context.Context, reconcilerClient client.Client, secretCrd SecretAuthInput, infisicalClient infisicalSdk.InfisicalClientInterface) (AuthenticationDetails, error) {
	var kubernetesAuthSpec v1alpha1.KubernetesAuthDetails

	switch secretCrd.Type {
	case SecretCrd.INFISICAL_SECRET:
		infisicalSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalSecret")
		}
		kubernetesAuthSpec = infisicalSecret.Spec.Authentication.KubernetesAuth
	case SecretCrd.INFISICAL_PUSH_SECRET:
		infisicalPushSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalPushSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalPushSecret")
		}
		kubernetesAuthSpec = v1alpha1.KubernetesAuthDetails{
			IdentityID: infisicalPushSecret.Spec.Authentication.KubernetesAuth.IdentityID,
			ServiceAccountRef: v1alpha1.KubernetesServiceAccountRef{
				Namespace: infisicalPushSecret.Spec.Authentication.KubernetesAuth.ServiceAccountRef.Namespace,
				Name:      infisicalPushSecret.Spec.Authentication.KubernetesAuth.ServiceAccountRef.Name,
			},
			SecretsScope: v1alpha1.MachineIdentityScopeInWorkspace{},
		}

	case SecretCrd.INFISICAL_DYNAMIC_SECRET:
		infisicalDynamicSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalDynamicSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalDynamicSecret")
		}

		kubernetesAuthSpec = v1alpha1.KubernetesAuthDetails{
			IdentityID: infisicalDynamicSecret.Spec.Authentication.KubernetesAuth.IdentityID,
			ServiceAccountRef: v1alpha1.KubernetesServiceAccountRef{
				Namespace: infisicalDynamicSecret.Spec.Authentication.KubernetesAuth.ServiceAccountRef.Namespace,
				Name:      infisicalDynamicSecret.Spec.Authentication.KubernetesAuth.ServiceAccountRef.Name,
			},
			SecretsScope: v1alpha1.MachineIdentityScopeInWorkspace{},
		}
	}

	if kubernetesAuthSpec.IdentityID == "" {
		return AuthenticationDetails{}, ErrAuthNotApplicable
	}

	serviceAccountToken, err := GetServiceAccountToken(reconcilerClient, kubernetesAuthSpec.ServiceAccountRef.Namespace, kubernetesAuthSpec.ServiceAccountRef.Name)
	if err != nil {
		return AuthenticationDetails{}, fmt.Errorf("unable to get service account token [err=%s]", err)
	}

	_, err = infisicalClient.Auth().KubernetesRawServiceAccountTokenLogin(kubernetesAuthSpec.IdentityID, serviceAccountToken)
	if err != nil {
		return AuthenticationDetails{}, fmt.Errorf("unable to login with Kubernetes native auth [err=%s]", err)
	}

	return AuthenticationDetails{
		AuthStrategy:          AuthStrategy.KUBERNETES_MACHINE_IDENTITY,
		MachineIdentityScope:  kubernetesAuthSpec.SecretsScope,
		IsMachineIdentityAuth: true,
		SecretType:            secretCrd.Type,
	}, nil

}

func HandleAwsIamAuth(ctx context.Context, reconcilerClient client.Client, secretCrd SecretAuthInput, infisicalClient infisicalSdk.InfisicalClientInterface) (AuthenticationDetails, error) {
	awsIamAuthSpec := v1alpha1.AWSIamAuthDetails{}

	switch secretCrd.Type {
	case SecretCrd.INFISICAL_SECRET:
		infisicalSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalSecret")
		}

		awsIamAuthSpec = infisicalSecret.Spec.Authentication.AwsIamAuth
	case SecretCrd.INFISICAL_PUSH_SECRET:
		infisicalPushSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalPushSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalPushSecret")
		}

		awsIamAuthSpec = v1alpha1.AWSIamAuthDetails{
			IdentityID:   infisicalPushSecret.Spec.Authentication.AwsIamAuth.IdentityID,
			SecretsScope: v1alpha1.MachineIdentityScopeInWorkspace{},
		}

	case SecretCrd.INFISICAL_DYNAMIC_SECRET:
		infisicalDynamicSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalDynamicSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalDynamicSecret")
		}

		awsIamAuthSpec = v1alpha1.AWSIamAuthDetails{
			IdentityID:   infisicalDynamicSecret.Spec.Authentication.AwsIamAuth.IdentityID,
			SecretsScope: v1alpha1.MachineIdentityScopeInWorkspace{},
		}
	}

	if awsIamAuthSpec.IdentityID == "" {
		return AuthenticationDetails{}, ErrAuthNotApplicable
	}

	_, err := infisicalClient.Auth().AwsIamAuthLogin(awsIamAuthSpec.IdentityID)
	if err != nil {
		return AuthenticationDetails{}, fmt.Errorf("unable to login with AWS IAM auth [err=%s]", err)
	}

	return AuthenticationDetails{
		AuthStrategy:          AuthStrategy.AWS_IAM_MACHINE_IDENTITY,
		MachineIdentityScope:  awsIamAuthSpec.SecretsScope,
		IsMachineIdentityAuth: true,
		SecretType:            secretCrd.Type,
	}, nil

}

func HandleAzureAuth(ctx context.Context, reconcilerClient client.Client, secretCrd SecretAuthInput, infisicalClient infisicalSdk.InfisicalClientInterface) (AuthenticationDetails, error) {
	azureAuthSpec := v1alpha1.AzureAuthDetails{}

	switch secretCrd.Type {
	case SecretCrd.INFISICAL_SECRET:
		infisicalSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalSecret")
		}

		azureAuthSpec = infisicalSecret.Spec.Authentication.AzureAuth

	case SecretCrd.INFISICAL_PUSH_SECRET:
		infisicalPushSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalPushSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalPushSecret")
		}

		azureAuthSpec = v1alpha1.AzureAuthDetails{
			IdentityID:   infisicalPushSecret.Spec.Authentication.AzureAuth.IdentityID,
			Resource:     infisicalPushSecret.Spec.Authentication.AzureAuth.Resource,
			SecretsScope: v1alpha1.MachineIdentityScopeInWorkspace{},
		}

	case SecretCrd.INFISICAL_DYNAMIC_SECRET:
		infisicalDynamicSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalDynamicSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalDynamicSecret")
		}

		azureAuthSpec = v1alpha1.AzureAuthDetails{
			IdentityID:   infisicalDynamicSecret.Spec.Authentication.AzureAuth.IdentityID,
			Resource:     infisicalDynamicSecret.Spec.Authentication.AzureAuth.Resource,
			SecretsScope: v1alpha1.MachineIdentityScopeInWorkspace{},
		}
	}

	if azureAuthSpec.IdentityID == "" {
		return AuthenticationDetails{}, ErrAuthNotApplicable
	}

	_, err := infisicalClient.Auth().AzureAuthLogin(azureAuthSpec.IdentityID, azureAuthSpec.Resource) // If resource is empty(""), it will default to "https://management.azure.com/" in the SDK.
	if err != nil {
		return AuthenticationDetails{}, fmt.Errorf("unable to login with Azure auth [err=%s]", err)
	}

	return AuthenticationDetails{
		AuthStrategy:          AuthStrategy.AZURE_MACHINE_IDENTITY,
		MachineIdentityScope:  azureAuthSpec.SecretsScope,
		IsMachineIdentityAuth: true,
		SecretType:            secretCrd.Type,
	}, nil

}

func HandleGcpIdTokenAuth(ctx context.Context, reconcilerClient client.Client, secretCrd SecretAuthInput, infisicalClient infisicalSdk.InfisicalClientInterface) (AuthenticationDetails, error) {
	gcpIdTokenSpec := v1alpha1.GCPIdTokenAuthDetails{}

	switch secretCrd.Type {
	case SecretCrd.INFISICAL_SECRET:
		infisicalSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalSecret")
		}

		gcpIdTokenSpec = infisicalSecret.Spec.Authentication.GcpIdTokenAuth
	case SecretCrd.INFISICAL_PUSH_SECRET:
		infisicalPushSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalPushSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalPushSecret")
		}

		gcpIdTokenSpec = v1alpha1.GCPIdTokenAuthDetails{
			IdentityID:   infisicalPushSecret.Spec.Authentication.GcpIdTokenAuth.IdentityID,
			SecretsScope: v1alpha1.MachineIdentityScopeInWorkspace{},
		}

	case SecretCrd.INFISICAL_DYNAMIC_SECRET:
		infisicalDynamicSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalDynamicSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalDynamicSecret")
		}

		gcpIdTokenSpec = v1alpha1.GCPIdTokenAuthDetails{
			IdentityID:   infisicalDynamicSecret.Spec.Authentication.GcpIdTokenAuth.IdentityID,
			SecretsScope: v1alpha1.MachineIdentityScopeInWorkspace{},
		}
	}

	if gcpIdTokenSpec.IdentityID == "" {
		return AuthenticationDetails{}, ErrAuthNotApplicable
	}

	_, err := infisicalClient.Auth().GcpIdTokenAuthLogin(gcpIdTokenSpec.IdentityID)
	if err != nil {
		return AuthenticationDetails{}, fmt.Errorf("unable to login with GCP Id Token auth [err=%s]", err)
	}

	return AuthenticationDetails{
		AuthStrategy:          AuthStrategy.GCP_ID_TOKEN_MACHINE_IDENTITY,
		MachineIdentityScope:  gcpIdTokenSpec.SecretsScope,
		IsMachineIdentityAuth: true,
		SecretType:            secretCrd.Type,
	}, nil

}

func HandleGcpIamAuth(ctx context.Context, reconcilerClient client.Client, secretCrd SecretAuthInput, infisicalClient infisicalSdk.InfisicalClientInterface) (AuthenticationDetails, error) {
	gcpIamSpec := v1alpha1.GcpIamAuthDetails{}

	switch secretCrd.Type {
	case SecretCrd.INFISICAL_SECRET:
		infisicalSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalSecret")
		}

		gcpIamSpec = infisicalSecret.Spec.Authentication.GcpIamAuth
	case SecretCrd.INFISICAL_PUSH_SECRET:
		infisicalPushSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalPushSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalPushSecret")
		}

		gcpIamSpec = v1alpha1.GcpIamAuthDetails{
			IdentityID:                infisicalPushSecret.Spec.Authentication.GcpIamAuth.IdentityID,
			ServiceAccountKeyFilePath: infisicalPushSecret.Spec.Authentication.GcpIamAuth.ServiceAccountKeyFilePath,
			SecretsScope:              v1alpha1.MachineIdentityScopeInWorkspace{},
		}

	case SecretCrd.INFISICAL_DYNAMIC_SECRET:
		infisicalDynamicSecret, ok := secretCrd.Secret.(v1alpha1.InfisicalDynamicSecret)

		if !ok {
			return AuthenticationDetails{}, errors.New("unable to cast secret to InfisicalDynamicSecret")
		}

		gcpIamSpec = v1alpha1.GcpIamAuthDetails{
			IdentityID:                infisicalDynamicSecret.Spec.Authentication.GcpIamAuth.IdentityID,
			ServiceAccountKeyFilePath: infisicalDynamicSecret.Spec.Authentication.GcpIamAuth.ServiceAccountKeyFilePath,
			SecretsScope:              v1alpha1.MachineIdentityScopeInWorkspace{},
		}
	}

	if gcpIamSpec.IdentityID == "" && gcpIamSpec.ServiceAccountKeyFilePath == "" {
		return AuthenticationDetails{}, ErrAuthNotApplicable
	}

	_, err := infisicalClient.Auth().GcpIamAuthLogin(gcpIamSpec.IdentityID, gcpIamSpec.ServiceAccountKeyFilePath)
	if err != nil {
		return AuthenticationDetails{}, fmt.Errorf("unable to login with GCP IAM auth [err=%s]", err)
	}

	return AuthenticationDetails{
		AuthStrategy:          AuthStrategy.GCP_IAM_MACHINE_IDENTITY,
		MachineIdentityScope:  gcpIamSpec.SecretsScope,
		IsMachineIdentityAuth: true,
		SecretType:            secretCrd.Type,
	}, nil
}
