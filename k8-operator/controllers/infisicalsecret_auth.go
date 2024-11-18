package controllers

import (
	"context"
	"errors"
	"fmt"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/util"
	infisicalSdk "github.com/infisical/go-sdk"
)

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

type AuthenticationDetails struct {
	authStrategy          AuthStrategyType
	machineIdentityScope  v1alpha1.MachineIdentityScopeInWorkspace // This will only be set if a machine identity auth method is used (e.g. UniversalAuth or KubernetesAuth, etc.)
	isMachineIdentityAuth bool
}

var ErrAuthNotApplicable = errors.New("authentication not applicable")

func (r *InfisicalSecretReconciler) handleUniversalAuth(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret, infisicalClient infisicalSdk.InfisicalClientInterface) (AuthenticationDetails, error) {

	// Machine Identities:
	universalAuthKubeSecret, err := r.GetInfisicalUniversalAuthFromKubeSecret(ctx, infisicalSecret)
	universalAuthSpec := infisicalSecret.Spec.Authentication.UniversalAuth

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

	fmt.Println("Successfully authenticated with machine identity credentials")

	return AuthenticationDetails{authStrategy: AuthStrategy.UNIVERSAL_MACHINE_IDENTITY, machineIdentityScope: universalAuthSpec.SecretsScope, isMachineIdentityAuth: true}, nil

}

func (r *InfisicalSecretReconciler) handleKubernetesAuth(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret, infisicalClient infisicalSdk.InfisicalClientInterface) (AuthenticationDetails, error) {
	kubernetesAuthSpec := infisicalSecret.Spec.Authentication.KubernetesAuth

	if kubernetesAuthSpec.IdentityID == "" {
		return AuthenticationDetails{}, ErrAuthNotApplicable
	}

	serviceAccountToken, err := util.GetServiceAccountToken(r.Client, kubernetesAuthSpec.ServiceAccountRef.Namespace, kubernetesAuthSpec.ServiceAccountRef.Name)
	if err != nil {
		return AuthenticationDetails{}, fmt.Errorf("unable to get service account token [err=%s]", err)
	}

	_, err = infisicalClient.Auth().KubernetesRawServiceAccountTokenLogin(kubernetesAuthSpec.IdentityID, serviceAccountToken)
	if err != nil {
		return AuthenticationDetails{}, fmt.Errorf("unable to login with Kubernetes native auth [err=%s]", err)
	}

	return AuthenticationDetails{authStrategy: AuthStrategy.KUBERNETES_MACHINE_IDENTITY, machineIdentityScope: kubernetesAuthSpec.SecretsScope, isMachineIdentityAuth: true}, nil

}

func (r *InfisicalSecretReconciler) handleAwsIamAuth(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret, infisicalClient infisicalSdk.InfisicalClientInterface) (AuthenticationDetails, error) {
	awsIamAuthSpec := infisicalSecret.Spec.Authentication.AwsIamAuth

	if awsIamAuthSpec.IdentityID == "" {
		return AuthenticationDetails{}, ErrAuthNotApplicable
	}

	_, err := infisicalClient.Auth().AwsIamAuthLogin(awsIamAuthSpec.IdentityID)
	if err != nil {
		return AuthenticationDetails{}, fmt.Errorf("unable to login with AWS IAM auth [err=%s]", err)
	}

	return AuthenticationDetails{authStrategy: AuthStrategy.AWS_IAM_MACHINE_IDENTITY, machineIdentityScope: awsIamAuthSpec.SecretsScope, isMachineIdentityAuth: true}, nil

}

func (r *InfisicalSecretReconciler) handleAzureAuth(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret, infisicalClient infisicalSdk.InfisicalClientInterface) (AuthenticationDetails, error) {
	azureAuthSpec := infisicalSecret.Spec.Authentication.AzureAuth

	if azureAuthSpec.IdentityID == "" {
		return AuthenticationDetails{}, ErrAuthNotApplicable
	}

	_, err := infisicalClient.Auth().AzureAuthLogin(azureAuthSpec.IdentityID, azureAuthSpec.Resource) // If resource is empty(""), it will default to "https://management.azure.com/" in the SDK.
	if err != nil {
		return AuthenticationDetails{}, fmt.Errorf("unable to login with Azure auth [err=%s]", err)
	}

	return AuthenticationDetails{authStrategy: AuthStrategy.AZURE_MACHINE_IDENTITY, machineIdentityScope: azureAuthSpec.SecretsScope, isMachineIdentityAuth: true}, nil

}

func (r *InfisicalSecretReconciler) handleGcpIdTokenAuth(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret, infisicalClient infisicalSdk.InfisicalClientInterface) (AuthenticationDetails, error) {
	gcpIdTokenSpec := infisicalSecret.Spec.Authentication.GcpIdTokenAuth

	if gcpIdTokenSpec.IdentityID == "" {
		return AuthenticationDetails{}, ErrAuthNotApplicable
	}

	_, err := infisicalClient.Auth().GcpIdTokenAuthLogin(gcpIdTokenSpec.IdentityID)
	if err != nil {
		return AuthenticationDetails{}, fmt.Errorf("unable to login with GCP Id Token auth [err=%s]", err)
	}

	return AuthenticationDetails{authStrategy: AuthStrategy.GCP_ID_TOKEN_MACHINE_IDENTITY, machineIdentityScope: gcpIdTokenSpec.SecretsScope, isMachineIdentityAuth: true}, nil

}

func (r *InfisicalSecretReconciler) handleGcpIamAuth(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret, infisicalClient infisicalSdk.InfisicalClientInterface) (AuthenticationDetails, error) {
	gcpIamSpec := infisicalSecret.Spec.Authentication.GcpIamAuth

	if gcpIamSpec.IdentityID == "" && gcpIamSpec.ServiceAccountKeyFilePath == "" {
		return AuthenticationDetails{}, ErrAuthNotApplicable
	}

	_, err := infisicalClient.Auth().GcpIamAuthLogin(gcpIamSpec.IdentityID, gcpIamSpec.ServiceAccountKeyFilePath)
	if err != nil {
		return AuthenticationDetails{}, fmt.Errorf("unable to login with GCP IAM auth [err=%s]", err)
	}

	return AuthenticationDetails{authStrategy: AuthStrategy.GCP_IAM_MACHINE_IDENTITY, machineIdentityScope: gcpIamSpec.SecretsScope, isMachineIdentityAuth: true}, nil
}
