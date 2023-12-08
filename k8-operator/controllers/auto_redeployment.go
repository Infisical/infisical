package controllers

import (
	"context"
	"fmt"
	"sync"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	v1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

const DEPLOYMENT_SECRET_NAME_ANNOTATION_PREFIX = "secrets.infisical.com/managed-secret"
const AUTO_RELOAD_DEPLOYMENT_ANNOTATION = "secrets.infisical.com/auto-reload" // needs to be set to true for a deployment to start auto redeploying

func (r *InfisicalSecretReconciler) ReconcileDeploymentsWithManagedSecrets(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret) (int, error) {
	listOfDeployments := &v1.DeploymentList{}
	err := r.Client.List(ctx, listOfDeployments, &client.ListOptions{Namespace: infisicalSecret.Spec.ManagedSecretReference.SecretNamespace})
	if err != nil {
		return 0, fmt.Errorf("unable to get deployments in the [namespace=%v] [err=%v]", infisicalSecret.Spec.ManagedSecretReference.SecretNamespace, err)
	}

	managedKubeSecretNameAndNamespace := types.NamespacedName{
		Namespace: infisicalSecret.Spec.ManagedSecretReference.SecretNamespace,
		Name:      infisicalSecret.Spec.ManagedSecretReference.SecretName,
	}

	managedKubeSecret := &corev1.Secret{}
	err = r.Client.Get(ctx, managedKubeSecretNameAndNamespace, managedKubeSecret)
	if err != nil {
		return 0, fmt.Errorf("unable to fetch Kubernetes secret to update deployment: %v", err)
	}

	var wg sync.WaitGroup
	// Iterate over the deployments and check if they use the managed secret
	for _, deployment := range listOfDeployments.Items {
		deployment := deployment
		if deployment.Annotations[AUTO_RELOAD_DEPLOYMENT_ANNOTATION] == "true" && r.IsDeploymentUsingManagedSecret(deployment, infisicalSecret) {
			// Start a goroutine to reconcile the deployment
			wg.Add(1)
			go func(d v1.Deployment, s corev1.Secret) {
				defer wg.Done()
				if err := r.ReconcileDeployment(ctx, d, s); err != nil {
					fmt.Printf("unable to reconcile deployment with [name=%v]. Will try next requeue", deployment.ObjectMeta.Name)
				}
			}(deployment, *managedKubeSecret)
		}
	}

	wg.Wait()

	return 0, nil
}

// Check if the deployment uses managed secrets
func (r *InfisicalSecretReconciler) IsDeploymentUsingManagedSecret(deployment v1.Deployment, infisicalSecret v1alpha1.InfisicalSecret) bool {
	managedSecretName := infisicalSecret.Spec.ManagedSecretReference.SecretName
	for _, container := range deployment.Spec.Template.Spec.Containers {
		for _, envFrom := range container.EnvFrom {
			if envFrom.SecretRef != nil && envFrom.SecretRef.LocalObjectReference.Name == managedSecretName {
				return true
			}
		}
		for _, env := range container.Env {
			if env.ValueFrom != nil && env.ValueFrom.SecretKeyRef != nil && env.ValueFrom.SecretKeyRef.LocalObjectReference.Name == managedSecretName {
				return true
			}
		}
	}
	for _, volume := range deployment.Spec.Template.Spec.Volumes {
		if volume.Secret != nil && volume.Secret.SecretName == managedSecretName {
			return true
		}
	}

	return false
}

// This function ensures that a deployment is in sync with a Kubernetes secret by comparing their versions.
// If the version of the secret is different from the version annotation on the deployment, the annotation is updated to trigger a restart of the deployment.
func (r *InfisicalSecretReconciler) ReconcileDeployment(ctx context.Context, deployment v1.Deployment, secret corev1.Secret) error {
	annotationKey := fmt.Sprintf("%s.%s", DEPLOYMENT_SECRET_NAME_ANNOTATION_PREFIX, secret.Name)
	annotationValue := secret.Annotations[SECRET_VERSION_ANNOTATION]

	if deployment.Annotations[annotationKey] == annotationValue &&
		deployment.Spec.Template.Annotations[annotationKey] == annotationValue {
		fmt.Printf("The [deploymentName=%v] is already using the most up to date managed secrets. No action required.\n", deployment.ObjectMeta.Name)
		return nil
	}

	fmt.Printf("deployment is using outdated managed secret. Starting re-deployment [deploymentName=%v]\n", deployment.ObjectMeta.Name)

	if deployment.Spec.Template.Annotations == nil {
		deployment.Spec.Template.Annotations = make(map[string]string)
	}

	deployment.Annotations[annotationKey] = annotationValue
	deployment.Spec.Template.Annotations[annotationKey] = annotationValue

	if err := r.Client.Update(ctx, &deployment); err != nil {
		return fmt.Errorf("failed to update deployment annotation: %v", err)
	}
	return nil
}
