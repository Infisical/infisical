package util

import (
	"context"
	"fmt"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/model"
	corev1 "k8s.io/api/core/v1"
	k8Errors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

const INFISICAL_MACHINE_IDENTITY_CLIENT_ID = "clientId"
const INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET = "clientSecret"

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

func GetInfisicalUniversalAuthFromKubeSecret(ctx context.Context, reconcilerClient client.Client, universalAuthRef v1alpha1.KubeSecretReference) (machineIdentityDetails model.MachineIdentityDetails, err error) {

	universalAuthCredsFromKubeSecret, err := GetKubeSecretByNamespacedName(ctx, reconcilerClient, types.NamespacedName{
		Namespace: universalAuthRef.SecretNamespace,
		Name:      universalAuthRef.SecretName,
		// Namespace: infisicalSecret.Spec.Authentication.UniversalAuth.CredentialsRef.SecretNamespace,
		// Name:      infisicalSecret.Spec.Authentication.UniversalAuth.CredentialsRef.SecretName,
	})

	if k8Errors.IsNotFound(err) {
		return model.MachineIdentityDetails{}, nil
	}

	if err != nil {
		return model.MachineIdentityDetails{}, fmt.Errorf("something went wrong when fetching your machine identity credentials [err=%s]", err)
	}

	clientIdFromSecret := universalAuthCredsFromKubeSecret.Data[INFISICAL_MACHINE_IDENTITY_CLIENT_ID]
	clientSecretFromSecret := universalAuthCredsFromKubeSecret.Data[INFISICAL_MACHINE_IDENTITY_CLIENT_SECRET]

	return model.MachineIdentityDetails{ClientId: string(clientIdFromSecret), ClientSecret: string(clientSecretFromSecret)}, nil

}
