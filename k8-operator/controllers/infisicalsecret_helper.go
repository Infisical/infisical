package controllers

import (
	"context"
	"fmt"
	"strings"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	api "github.com/Infisical/infisical/k8-operator/packages/api"
	models "github.com/Infisical/infisical/k8-operator/packages/models"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
)

const INFISICAL_TOKEN_SECRET_KEY_NAME = "infisicalToken"

func (r *InfisicalSecretReconciler) GetKubeSecretByNamespacedName(ctx context.Context, namespacedName types.NamespacedName) (*corev1.Secret, error) {
	kubeSecret := &corev1.Secret{}
	err := r.Client.Get(ctx, namespacedName, kubeSecret)
	if err != nil {
		kubeSecret = nil
	}

	return kubeSecret, err
}

func (r *InfisicalSecretReconciler) GetInfisicalToken(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret) (string, error) {
	tokenSecret, err := r.GetKubeSecretByNamespacedName(ctx, types.NamespacedName{
		Namespace: infisicalSecret.Spec.TokenSecretReference.SecretNamespace,
		Name:      infisicalSecret.Spec.TokenSecretReference.SecretName,
	})

	if err != nil {
		return "", fmt.Errorf("failed to read Infisical token secret from secret named [%s] in namespace [%s]: with error [%w]", infisicalSecret.Spec.ManagedSecretReference.SecretName, infisicalSecret.Spec.ManagedSecretReference.SecretNamespace, err)
	}

	infisicalServiceToken := tokenSecret.Data[INFISICAL_TOKEN_SECRET_KEY_NAME]
	if infisicalServiceToken == nil {
		return "", fmt.Errorf("the Infisical token is not set in the Kubernetes secret. Please add the key [%s] with the corresponding token value", INFISICAL_TOKEN_SECRET_KEY_NAME)
	}

	return strings.Replace(string(infisicalServiceToken), " ", "", -1), nil
}

func (r *InfisicalSecretReconciler) CreateInfisicalManagedKubeSecret(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret, secretsFromAPI []models.SingleEnvironmentVariable) error {
	plainProcessedSecrets := make(map[string][]byte)
	for _, secret := range secretsFromAPI {
		plainProcessedSecrets[secret.Key] = []byte(secret.Value) // plain process
	}

	// create a new secret as specified by the managed secret spec of CRD
	newKubeSecretInstance := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:      infisicalSecret.Spec.ManagedSecretReference.SecretName,
			Namespace: infisicalSecret.Spec.ManagedSecretReference.SecretNamespace,
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

func (r *InfisicalSecretReconciler) UpdateInfisicalManagedKubeSecret(ctx context.Context, managedKubeSecret corev1.Secret, secretsFromAPI []models.SingleEnvironmentVariable) error {
	plainProcessedSecrets := make(map[string][]byte)
	for _, secret := range secretsFromAPI {
		plainProcessedSecrets[secret.Key] = []byte(secret.Value)
	}

	managedKubeSecret.Data = plainProcessedSecrets
	err := r.Client.Update(ctx, &managedKubeSecret)
	if err != nil {
		return fmt.Errorf("unable to update Kubernetes secret because [%w]", err)
	}

	fmt.Println("successfully updated managed Kubernetes secret")
	return nil
}

func (r *InfisicalSecretReconciler) ReconcileInfisicalSecret(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret) error {
	infisicalToken, err := r.GetInfisicalToken(ctx, infisicalSecret)
	r.SetInfisicalTokenLoadCondition(ctx, &infisicalSecret, err)
	if err != nil {
		return fmt.Errorf("unable to load Infisical Token from the specified Kubernetes secret with error [%w]", err)
	}

	managedKubeSecret, err := r.GetKubeSecretByNamespacedName(ctx, types.NamespacedName{
		Name:      infisicalSecret.Spec.ManagedSecretReference.SecretName,
		Namespace: infisicalSecret.Spec.ManagedSecretReference.SecretNamespace,
	})

	if err != nil && !errors.IsNotFound(err) {
		return fmt.Errorf("something went wrong when fetching the managed Kubernetes secret [%w]", err)
	}

	secretsFromApi, err := api.GetAllEnvironmentVariables(infisicalSecret.Spec.ProjectId, infisicalSecret.Spec.Environment, infisicalToken, infisicalSecret.Spec.HostAPI)

	if err != nil {
		return err
	}

	if managedKubeSecret == nil {
		return r.CreateInfisicalManagedKubeSecret(ctx, infisicalSecret, secretsFromApi)
	} else {
		return r.UpdateInfisicalManagedKubeSecret(ctx, *managedKubeSecret, secretsFromApi)
	}

}

// Conditions

func (r *InfisicalSecretReconciler) SetReadyToSyncSecretsConditions(ctx context.Context, infisicalSecret *v1alpha1.InfisicalSecret, errorToConditionOn error) {
	if infisicalSecret.Status.Conditions == nil {
		infisicalSecret.Status.Conditions = []metav1.Condition{}
	}

	if errorToConditionOn == nil {
		meta.SetStatusCondition(&infisicalSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/ReadyToSyncSecrets",
			Status:  metav1.ConditionTrue,
			Reason:  "OK",
			Message: "Infisical controller has started syncing your secrets",
		})
	} else {
		meta.SetStatusCondition(&infisicalSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/ReadyToSyncSecrets",
			Status:  metav1.ConditionFalse,
			Reason:  "Error",
			Message: fmt.Sprintf("Failed to update secret because: %v", errorToConditionOn),
		})
	}

	err := r.Client.Status().Update(ctx, infisicalSecret)
	if err != nil {
		fmt.Println("Could not set condition", err)
	}
}

func (r *InfisicalSecretReconciler) SetInfisicalTokenLoadCondition(ctx context.Context, infisicalSecret *v1alpha1.InfisicalSecret, errorToConditionOn error) {
	if infisicalSecret.Status.Conditions == nil {
		infisicalSecret.Status.Conditions = []metav1.Condition{}
	}

	if errorToConditionOn == nil {
		meta.SetStatusCondition(&infisicalSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/LoadedInfisicalToken",
			Status:  metav1.ConditionTrue,
			Reason:  "OK",
			Message: "Infisical controller has located the Infisical token in provided Kubernetes secret",
		})
	} else {
		meta.SetStatusCondition(&infisicalSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/LoadedInfisicalToken",
			Status:  metav1.ConditionFalse,
			Reason:  "Error",
			Message: fmt.Sprintf("Failed to load Infisical Token because: %v", errorToConditionOn),
		})
	}

	err := r.Client.Status().Update(ctx, infisicalSecret)
	if err != nil {
		fmt.Println("Could not set condition for LoadedInfisicalToken")
	}
}
