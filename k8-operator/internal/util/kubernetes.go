package util

import (
	"context"
	"fmt"
	"strings"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/internal/constants"
	"github.com/Infisical/infisical/k8-operator/internal/model"
	corev1 "k8s.io/api/core/v1"
	k8Errors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
	"k8s.io/client-go/tools/clientcmd"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

const INFISICAL_MACHINE_IDENTITY_CLIENT_ID = "clientId"
const INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET = "clientSecret"

const INFISICAL_MACHINE_IDENTITY_LDAP_USERNAME = "username"
const INFISICAL_MACHINE_IDENTITY_LDAP_PASSWORD = "password"

func GetKubeSecretByNamespacedName(ctx context.Context, reconcilerClient client.Client, namespacedName types.NamespacedName) (*corev1.Secret, error) {
	kubeSecret := &corev1.Secret{}
	err := reconcilerClient.Get(ctx, namespacedName, kubeSecret)
	if err != nil {
		kubeSecret = nil
	}

	return kubeSecret, err
}

func GetKubeConfigMapByNamespacedName(ctx context.Context, reconcilerClient client.Client, namespacedName types.NamespacedName) (*corev1.ConfigMap, error) {
	kubeConfigMap := &corev1.ConfigMap{}
	err := reconcilerClient.Get(ctx, namespacedName, kubeConfigMap)
	if err != nil {
		kubeConfigMap = nil
	}

	return kubeConfigMap, err
}

func GetInfisicalUniversalAuthFromKubeSecret(ctx context.Context, reconcilerClient client.Client, universalAuthRef v1alpha1.KubeSecretReference, isNamespaceScoped bool) (machineIdentityDetails model.UniversalAuthIdentityDetails, err error) {

	universalAuthCredsFromKubeSecret, err := GetKubeSecretByNamespacedName(ctx, reconcilerClient, types.NamespacedName{
		Namespace: universalAuthRef.SecretNamespace,
		Name:      universalAuthRef.SecretName,
	})

	if k8Errors.IsNotFound(err) {
		return model.UniversalAuthIdentityDetails{}, nil
	}

	if err != nil {
		if IsNamespaceScopedError(err, isNamespaceScoped) {
			return model.UniversalAuthIdentityDetails{}, fmt.Errorf("unable to fetch Kubernetes secret. Your Operator installation is namespace scoped, and cannot read secrets outside of the namespace it is installed in. Please ensure the secret is in the same namespace as the operator. [err=%v]", err)
		}
		return model.UniversalAuthIdentityDetails{}, fmt.Errorf("something went wrong when fetching your machine identity credentials [err=%s]", err)
	}

	clientIdFromSecret := universalAuthCredsFromKubeSecret.Data[INFISICAL_MACHINE_IDENTITY_CLIENT_ID]
	clientSecretFromSecret := universalAuthCredsFromKubeSecret.Data[INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET]

	return model.UniversalAuthIdentityDetails{ClientId: string(clientIdFromSecret), ClientSecret: string(clientSecretFromSecret)}, nil

}

func GetInfisicalLdapAuthFromKubeSecret(ctx context.Context, reconcilerClient client.Client, ldapAuthRef v1alpha1.KubeSecretReference, isNamespaceScoped bool) (machineIdentityDetails model.LdapIdentityDetails, err error) {

	ldapAuthCredsFromKubeSecret, err := GetKubeSecretByNamespacedName(ctx, reconcilerClient, types.NamespacedName{
		Namespace: ldapAuthRef.SecretNamespace,
		Name:      ldapAuthRef.SecretName,
	})

	if k8Errors.IsNotFound(err) {
		return model.LdapIdentityDetails{}, nil
	}

	if err != nil {
		if IsNamespaceScopedError(err, isNamespaceScoped) {
			return model.LdapIdentityDetails{}, fmt.Errorf("unable to fetch Kubernetes secret. Your Operator is namespace scoped, and cannot read secrets outside of its namespace. Please ensure the secret is in the same namespace as the operator. [err=%v]", err)
		}
		return model.LdapIdentityDetails{}, fmt.Errorf("something went wrong when fetching your machine identity credentials [err=%s]", err)
	}

	usernameFromSecret := ldapAuthCredsFromKubeSecret.Data[INFISICAL_MACHINE_IDENTITY_LDAP_USERNAME]
	passwordFromSecret := ldapAuthCredsFromKubeSecret.Data[INFISICAL_MACHINE_IDENTITY_LDAP_PASSWORD]

	return model.LdapIdentityDetails{Username: string(usernameFromSecret), Password: string(passwordFromSecret)}, nil

}

func getKubeClusterConfig() (*rest.Config, error) {
	config, err := rest.InClusterConfig()
	if err != nil {

		loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
		configOverrides := &clientcmd.ConfigOverrides{}
		kubeConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, configOverrides)
		return kubeConfig.ClientConfig()
	}

	return config, nil
}

func GetRestClientFromClient() (rest.Interface, error) {

	config, err := getKubeClusterConfig()
	if err != nil {
		return nil, err
	}

	clientset, err := kubernetes.NewForConfig(config)
	if err != nil {
		return nil, err
	}

	return clientset.CoreV1().RESTClient(), nil

}

func GetInfisicalTokenFromKubeSecret(ctx context.Context, reconcilerClient client.Client, infisicalSecret v1alpha1.InfisicalSecret) (string, error) {
	// default to new secret ref structure
	secretName := infisicalSecret.Spec.Authentication.ServiceToken.ServiceTokenSecretReference.SecretName
	secretNamespace := infisicalSecret.Spec.Authentication.ServiceToken.ServiceTokenSecretReference.SecretNamespace
	// fall back to previous secret ref
	if secretName == "" {
		secretName = infisicalSecret.Spec.TokenSecretReference.SecretName
	}

	if secretNamespace == "" {
		secretNamespace = infisicalSecret.Spec.TokenSecretReference.SecretNamespace
	}

	tokenSecret, err := GetKubeSecretByNamespacedName(ctx, reconcilerClient, types.NamespacedName{
		Namespace: secretNamespace,
		Name:      secretName,
	})

	if k8Errors.IsNotFound(err) || (secretNamespace == "" && secretName == "") {
		return "", nil
	}

	if err != nil {
		return "", fmt.Errorf("failed to read Infisical token secret from secret named [%s] in namespace [%s]: with error [%w]", infisicalSecret.Spec.TokenSecretReference.SecretName, infisicalSecret.Spec.TokenSecretReference.SecretNamespace, err)
	}

	infisicalServiceToken := tokenSecret.Data[constants.INFISICAL_TOKEN_SECRET_KEY_NAME]

	return strings.Replace(string(infisicalServiceToken), " ", "", -1), nil
}

func GetInfisicalServiceAccountCredentialsFromKubeSecret(ctx context.Context, reconcilerClient client.Client, infisicalSecret v1alpha1.InfisicalSecret) (serviceAccountDetails model.ServiceAccountDetails, err error) {

	secretNamespace := infisicalSecret.Spec.Authentication.ServiceAccount.ServiceAccountSecretReference.SecretNamespace
	secretName := infisicalSecret.Spec.Authentication.ServiceAccount.ServiceAccountSecretReference.SecretName

	serviceAccountCredsFromKubeSecret, err := GetKubeSecretByNamespacedName(ctx, reconcilerClient, types.NamespacedName{
		Namespace: secretNamespace,
		Name:      secretName,
	})

	if k8Errors.IsNotFound(err) || (secretNamespace == "" && secretName == "") {
		return model.ServiceAccountDetails{}, nil
	}

	if err != nil {
		return model.ServiceAccountDetails{}, fmt.Errorf("something went wrong when fetching your service account credentials [err=%s]", err)
	}

	accessKeyFromSecret := serviceAccountCredsFromKubeSecret.Data[constants.SERVICE_ACCOUNT_ACCESS_KEY]
	publicKeyFromSecret := serviceAccountCredsFromKubeSecret.Data[constants.SERVICE_ACCOUNT_PUBLIC_KEY]
	privateKeyFromSecret := serviceAccountCredsFromKubeSecret.Data[constants.SERVICE_ACCOUNT_PRIVATE_KEY]

	if accessKeyFromSecret == nil || publicKeyFromSecret == nil || privateKeyFromSecret == nil {
		return model.ServiceAccountDetails{}, nil
	}

	return model.ServiceAccountDetails{AccessKey: string(accessKeyFromSecret), PrivateKey: string(privateKeyFromSecret), PublicKey: string(publicKeyFromSecret)}, nil
}
