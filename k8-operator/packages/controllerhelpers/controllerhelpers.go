package controllerhelpers

import (
	"context"
	"fmt"
	"sync"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/constants"
	"github.com/go-logr/logr"
	v1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	k8Errors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	controllerClient "sigs.k8s.io/controller-runtime/pkg/client"
)

const DEPLOYMENT_SECRET_NAME_ANNOTATION_PREFIX = "secrets.infisical.com/managed-secret"
const AUTO_RELOAD_DEPLOYMENT_ANNOTATION = "secrets.infisical.com/auto-reload" // needs to be set to true for a deployment to start auto redeploying

func ReconcileDeploymentsWithManagedSecrets(ctx context.Context, client controllerClient.Client, logger logr.Logger, managedSecret v1alpha1.ManagedKubeSecretConfig) (int, error) {
	listOfDeployments := &v1.DeploymentList{}

	err := client.List(ctx, listOfDeployments, &controllerClient.ListOptions{Namespace: managedSecret.SecretNamespace})
	if err != nil {
		return 0, fmt.Errorf("unable to get deployments in the [namespace=%v] [err=%v]", managedSecret.SecretNamespace, err)
	}

	managedKubeSecretNameAndNamespace := types.NamespacedName{
		Namespace: managedSecret.SecretNamespace,
		Name:      managedSecret.SecretName,
	}

	managedKubeSecret := &corev1.Secret{}
	err = client.Get(ctx, managedKubeSecretNameAndNamespace, managedKubeSecret)
	if err != nil {
		return 0, fmt.Errorf("unable to fetch Kubernetes secret to update deployment: %v", err)
	}

	var wg sync.WaitGroup
	// Iterate over the deployments and check if they use the managed secret
	for _, deployment := range listOfDeployments.Items {
		deployment := deployment
		if deployment.Annotations[AUTO_RELOAD_DEPLOYMENT_ANNOTATION] == "true" && IsDeploymentUsingManagedSecret(deployment, managedSecret) {
			// Start a goroutine to reconcile the deployment
			wg.Add(1)
			go func(deployment v1.Deployment, managedSecret corev1.Secret) {
				defer wg.Done()
				if err := ReconcileDeployment(ctx, client, logger, deployment, managedSecret); err != nil {
					logger.Error(err, fmt.Sprintf("unable to reconcile deployment with [name=%v]. Will try next requeue", deployment.ObjectMeta.Name))
				}
			}(deployment, *managedKubeSecret)
		}
	}

	wg.Wait()

	return 0, nil
}

// Check if the deployment uses managed secrets
func IsDeploymentUsingManagedSecret(deployment v1.Deployment, managedSecret v1alpha1.ManagedKubeSecretConfig) bool {
	managedSecretName := managedSecret.SecretName
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
func ReconcileDeployment(ctx context.Context, client controllerClient.Client, logger logr.Logger, deployment v1.Deployment, secret corev1.Secret) error {
	annotationKey := fmt.Sprintf("%s.%s", DEPLOYMENT_SECRET_NAME_ANNOTATION_PREFIX, secret.Name)
	annotationValue := secret.Annotations[constants.SECRET_VERSION_ANNOTATION]

	if deployment.Annotations[annotationKey] == annotationValue &&
		deployment.Spec.Template.Annotations[annotationKey] == annotationValue {
		logger.Info(fmt.Sprintf("The [deploymentName=%v] is already using the most up to date managed secrets. No action required.", deployment.ObjectMeta.Name))
		return nil
	}

	logger.Info(fmt.Sprintf("Deployment is using outdated managed secret. Starting re-deployment [deploymentName=%v]", deployment.ObjectMeta.Name))

	if deployment.Spec.Template.Annotations == nil {
		deployment.Spec.Template.Annotations = make(map[string]string)
	}

	deployment.Annotations[annotationKey] = annotationValue
	deployment.Spec.Template.Annotations[annotationKey] = annotationValue

	if err := client.Update(ctx, &deployment); err != nil {
		return fmt.Errorf("failed to update deployment annotation: %v", err)
	}
	return nil
}

func GetInfisicalConfigMap(ctx context.Context, client client.Client) (configMap map[string]string, errToReturn error) {
	// default key values
	defaultConfigMapData := make(map[string]string)
	defaultConfigMapData["hostAPI"] = constants.INFISICAL_DOMAIN

	kubeConfigMap := &corev1.ConfigMap{}
	err := client.Get(ctx, types.NamespacedName{
		Namespace: constants.OPERATOR_SETTINGS_CONFIGMAP_NAMESPACE,
		Name:      constants.OPERATOR_SETTINGS_CONFIGMAP_NAME,
	}, kubeConfigMap)

	if err != nil {
		if k8Errors.IsNotFound(err) {
			kubeConfigMap = nil
		} else {
			return nil, fmt.Errorf("GetConfigMapByNamespacedName: unable to fetch config map in [namespacedName=%s] [err=%s]", constants.OPERATOR_SETTINGS_CONFIGMAP_NAMESPACE, err)
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
