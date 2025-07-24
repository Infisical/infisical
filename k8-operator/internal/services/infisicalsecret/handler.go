package infisicalsecret

import (
	"context"
	"fmt"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/internal/api"
	"github.com/Infisical/infisical/k8-operator/internal/util"
	"github.com/go-logr/logr"
	k8Errors "k8s.io/apimachinery/pkg/api/errors"
)

type InfisicalSecretHandler struct {
	client.Client
	Scheme *runtime.Scheme
}

func NewInfisicalSecretHandler(client client.Client, scheme *runtime.Scheme) *InfisicalSecretHandler {
	return &InfisicalSecretHandler{
		Client: client,
		Scheme: scheme,
	}
}

func (h *InfisicalSecretHandler) SetupAPIConfig(infisicalSecret v1alpha1.InfisicalSecret, infisicalConfig map[string]string) error {
	if infisicalSecret.Spec.HostAPI == "" {
		api.API_HOST_URL = infisicalConfig["hostAPI"]
	} else {
		api.API_HOST_URL = util.AppendAPIEndpoint(infisicalSecret.Spec.HostAPI)
	}
	return nil
}

func (h *InfisicalSecretHandler) getInfisicalCaCertificateFromKubeSecret(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret) (caCertificate string, err error) {

	caCertificateFromKubeSecret, err := util.GetKubeSecretByNamespacedName(ctx, h.Client, types.NamespacedName{
		Namespace: infisicalSecret.Spec.TLS.CaRef.SecretNamespace,
		Name:      infisicalSecret.Spec.TLS.CaRef.SecretName,
	})

	if k8Errors.IsNotFound(err) {
		return "", fmt.Errorf("kubernetes secret containing custom CA certificate cannot be found. [err=%s]", err)
	}

	if err != nil {
		return "", fmt.Errorf("something went wrong when fetching your CA certificate [err=%s]", err)
	}

	caCertificateFromSecret := string(caCertificateFromKubeSecret.Data[infisicalSecret.Spec.TLS.CaRef.SecretKey])

	return caCertificateFromSecret, nil
}

func (h *InfisicalSecretHandler) HandleCACertificate(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret) error {
	if infisicalSecret.Spec.TLS.CaRef.SecretName != "" {
		caCert, err := h.getInfisicalCaCertificateFromKubeSecret(ctx, infisicalSecret)
		if err != nil {
			return err
		}
		api.API_CA_CERTIFICATE = caCert
	} else {
		api.API_CA_CERTIFICATE = ""
	}
	return nil
}

func (h *InfisicalSecretHandler) ReconcileInfisicalSecret(ctx context.Context, logger logr.Logger, infisicalSecret *v1alpha1.InfisicalSecret, managedKubeSecretReferences []v1alpha1.ManagedKubeSecretConfig, managedKubeConfigMapReferences []v1alpha1.ManagedKubeConfigMapConfig, resourceVariablesMap map[string]util.ResourceVariables) (int, error) {
	reconciler := &InfisicalSecretReconciler{
		Client: h.Client,
		Scheme: h.Scheme,
	}
	return reconciler.ReconcileInfisicalSecret(ctx, logger, infisicalSecret, managedKubeSecretReferences, managedKubeConfigMapReferences, resourceVariablesMap)
}

func (h *InfisicalSecretHandler) SetReadyToSyncSecretsConditions(ctx context.Context, logger logr.Logger, infisicalSecret *v1alpha1.InfisicalSecret, secretsCount int, errorToConditionOn error) {
	reconciler := &InfisicalSecretReconciler{
		Client: h.Client,
		Scheme: h.Scheme,
	}
	reconciler.SetReadyToSyncSecretsConditions(ctx, logger, infisicalSecret, secretsCount, errorToConditionOn)
}

func (h *InfisicalSecretHandler) SetInfisicalAutoRedeploymentReady(ctx context.Context, logger logr.Logger, infisicalSecret *v1alpha1.InfisicalSecret, numDeployments int, errorToConditionOn error) {
	reconciler := &InfisicalSecretReconciler{
		Client: h.Client,
		Scheme: h.Scheme,
	}
	reconciler.SetInfisicalAutoRedeploymentReady(ctx, logger, infisicalSecret, numDeployments, errorToConditionOn)
}
