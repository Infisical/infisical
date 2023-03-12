package controllers

import (
	"context"
	"fmt"
	"strings"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/api"
	"github.com/Infisical/infisical/k8-operator/packages/util"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
)

const INFISICAL_TOKEN_SECRET_KEY_NAME = "infisicalToken"
const SECRET_VERSION_ANNOTATION = "secrets.infisical.com/version" // used to set the version of secrets via Etag
const OPERATOR_SETTINGS_CONFIGMAP_NAME = "infisical-config"
const OPERATOR_SETTINGS_CONFIGMAP_NAMESPACE = "infisical-operator-system"
const INFISICAL_DOMAIN = "https://app.infisical.com/api"

func (r *InfisicalSecretReconciler) GetInfisicalConfigMap(ctx context.Context) (configMap map[string]string, errToReturn error) {
	// default key values
	defaultConfigMapData := make(map[string]string)
	defaultConfigMapData["hostAPI"] = INFISICAL_DOMAIN

	kubeConfigMap := &corev1.ConfigMap{}
	err := r.Client.Get(ctx, types.NamespacedName{
		Namespace: OPERATOR_SETTINGS_CONFIGMAP_NAMESPACE,
		Name:      OPERATOR_SETTINGS_CONFIGMAP_NAME,
	}, kubeConfigMap)

	if err != nil {
		if errors.IsNotFound(err) {
			kubeConfigMap = nil
		} else {
			return nil, fmt.Errorf("GetConfigMapByNamespacedName: unable to fetch config map in [namespacedName=%s] [err=%s]", OPERATOR_SETTINGS_CONFIGMAP_NAMESPACE, err)
		}
	}

	if kubeConfigMap == nil {
		return defaultConfigMapData, nil
	} else {
		for key, value := range defaultConfigMapData {
			_, exists := kubeConfigMap.Data[key]
			if !exists {
				kubeConfigMap.Data[key] = value
			}
		}

		return kubeConfigMap.Data, nil
	}
}

func (r *InfisicalSecretReconciler) GetKubeSecretByNamespacedName(ctx context.Context, namespacedName types.NamespacedName) (*corev1.Secret, error) {
	kubeSecret := &corev1.Secret{}
	err := r.Client.Get(ctx, namespacedName, kubeSecret)
	if err != nil {
		kubeSecret = nil
	}

	return kubeSecret, err
}

func (r *InfisicalSecretReconciler) GetInfisicalTokenFromKubeSecret(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret) (string, error) {
	tokenSecret, err := r.GetKubeSecretByNamespacedName(ctx, types.NamespacedName{
		Namespace: infisicalSecret.Spec.TokenSecretReference.SecretNamespace,
		Name:      infisicalSecret.Spec.TokenSecretReference.SecretName,
	})

	if err != nil {
		return "", fmt.Errorf("failed to read Infisical token secret from secret named [%s] in namespace [%s]: with error [%w]", infisicalSecret.Spec.TokenSecretReference.SecretName, infisicalSecret.Spec.TokenSecretReference.SecretNamespace, err)
	}

	infisicalServiceToken := tokenSecret.Data[INFISICAL_TOKEN_SECRET_KEY_NAME]
	if infisicalServiceToken == nil {
		return "", fmt.Errorf("the Infisical token is not set in the Kubernetes secret. Please add the key [%s] with the corresponding token value", INFISICAL_TOKEN_SECRET_KEY_NAME)
	}

	return strings.Replace(string(infisicalServiceToken), " ", "", -1), nil
}

func (r *InfisicalSecretReconciler) CreateInfisicalManagedKubeSecret(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret, secretsFromAPI []util.SingleEnvironmentVariable, encryptedSecretsResponse api.GetEncryptedSecretsV2Response) error {
	plainProcessedSecrets := make(map[string][]byte)
	for _, secret := range secretsFromAPI {
		plainProcessedSecrets[secret.Key] = []byte(secret.Value) // plain process
	}

	// create a new secret as specified by the managed secret spec of CRD
	newKubeSecretInstance := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      infisicalSecret.Spec.ManagedSecretReference.SecretName,
			Namespace: infisicalSecret.Spec.ManagedSecretReference.SecretNamespace,
			Annotations: map[string]string{
				SECRET_VERSION_ANNOTATION: encryptedSecretsResponse.ETag,
			},
		},
		Type: "Opaque",
		Data: plainProcessedSecrets,
	}

	err := r.Client.Create(ctx, newKubeSecretInstance)
	if err != nil {
		return fmt.Errorf("unable to create the managed Kubernetes secret : %w", err)
	}

	fmt.Println("Successfully created a managed Kubernetes secret with your Infisical secrets")
	return nil
}

func (r *InfisicalSecretReconciler) UpdateInfisicalManagedKubeSecret(ctx context.Context, managedKubeSecret corev1.Secret, secretsFromAPI []util.SingleEnvironmentVariable, encryptedSecretsResponse api.GetEncryptedSecretsV2Response) error {
	plainProcessedSecrets := make(map[string][]byte)
	for _, secret := range secretsFromAPI {
		plainProcessedSecrets[secret.Key] = []byte(secret.Value)
	}

	managedKubeSecret.Data = plainProcessedSecrets
	managedKubeSecret.ObjectMeta.Annotations = map[string]string{
		SECRET_VERSION_ANNOTATION: encryptedSecretsResponse.ETag,
	}

	err := r.Client.Update(ctx, &managedKubeSecret)
	if err != nil {
		return fmt.Errorf("unable to update Kubernetes secret because [%w]", err)
	}

	fmt.Println("successfully updated managed Kubernetes secret")
	return nil
}

func (r *InfisicalSecretReconciler) ReconcileInfisicalSecret(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret) error {
	infisicalToken, err := r.GetInfisicalTokenFromKubeSecret(ctx, infisicalSecret)
	r.SetInfisicalTokenLoadCondition(ctx, &infisicalSecret, err)
	if err != nil {
		return fmt.Errorf("unable to load Infisical Token from the specified Kubernetes secret with error [%w]", err)
	}

	// Look for managed secret by name and namespace
	managedKubeSecret, err := r.GetKubeSecretByNamespacedName(ctx, types.NamespacedName{
		Name:      infisicalSecret.Spec.ManagedSecretReference.SecretName,
		Namespace: infisicalSecret.Spec.ManagedSecretReference.SecretNamespace,
	})

	if err != nil && !errors.IsNotFound(err) {
		return fmt.Errorf("something went wrong when fetching the managed Kubernetes secret [%w]", err)
	}

	secretVersionBasedOnETag := ""

	if managedKubeSecret != nil {
		secretVersionBasedOnETag = managedKubeSecret.Annotations[SECRET_VERSION_ANNOTATION]
	}

	plainTextSecretsFromApi, fullEncryptedSecretsResponse, err := util.GetPlainTextSecretsViaServiceToken(infisicalToken, secretVersionBasedOnETag)
	if err != nil {
		return fmt.Errorf("failed to get secrets because [err=%v]\n", err)
	}

	if !fullEncryptedSecretsResponse.Modified {
		fmt.Println("No secrets modified so reconcile not needed", "Etag:", fullEncryptedSecretsResponse.ETag, "Modified:", fullEncryptedSecretsResponse.Modified)
		return nil
	}

	fmt.Println("secret is modified so it needs to be created or updated")

	if managedKubeSecret == nil {
		return r.CreateInfisicalManagedKubeSecret(ctx, infisicalSecret, plainTextSecretsFromApi, fullEncryptedSecretsResponse)
	} else {
		return r.UpdateInfisicalManagedKubeSecret(ctx, *managedKubeSecret, plainTextSecretsFromApi, fullEncryptedSecretsResponse)
	}

}
