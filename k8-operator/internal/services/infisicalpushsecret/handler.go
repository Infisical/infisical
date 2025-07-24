package infisicalpushsecret

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

type InfisicalPushSecretHandler struct {
	client.Client
	Scheme            *runtime.Scheme
	IsNamespaceScoped bool
}

func NewInfisicalPushSecretHandler(client client.Client, scheme *runtime.Scheme, isNamespaceScoped bool) *InfisicalPushSecretHandler {
	return &InfisicalPushSecretHandler{
		Client:            client,
		Scheme:            scheme,
		IsNamespaceScoped: isNamespaceScoped,
	}
}

func (h *InfisicalPushSecretHandler) SetupAPIConfig(infisicalPushSecret v1alpha1.InfisicalPushSecret, infisicalConfig map[string]string) error {
	if infisicalPushSecret.Spec.HostAPI == "" {
		api.API_HOST_URL = infisicalConfig["hostAPI"]
	} else {
		api.API_HOST_URL = util.AppendAPIEndpoint(infisicalPushSecret.Spec.HostAPI)
	}
	return nil
}

func (h *InfisicalPushSecretHandler) getInfisicalCaCertificateFromKubeSecret(ctx context.Context, infisicalPushSecret v1alpha1.InfisicalPushSecret) (caCertificate string, err error) {

	caCertificateFromKubeSecret, err := util.GetKubeSecretByNamespacedName(ctx, h.Client, types.NamespacedName{
		Namespace: infisicalPushSecret.Spec.TLS.CaRef.SecretNamespace,
		Name:      infisicalPushSecret.Spec.TLS.CaRef.SecretName,
	})

	if k8Errors.IsNotFound(err) {
		return "", fmt.Errorf("kubernetes secret containing custom CA certificate cannot be found. [err=%s]", err)
	}

	if err != nil {
		return "", fmt.Errorf("something went wrong when fetching your CA certificate [err=%s]", err)
	}

	caCertificateFromSecret := string(caCertificateFromKubeSecret.Data[infisicalPushSecret.Spec.TLS.CaRef.SecretKey])

	return caCertificateFromSecret, nil
}

func (h *InfisicalPushSecretHandler) HandleCACertificate(ctx context.Context, infisicalPushSecret v1alpha1.InfisicalPushSecret) error {
	if infisicalPushSecret.Spec.TLS.CaRef.SecretName != "" {
		caCert, err := h.getInfisicalCaCertificateFromKubeSecret(ctx, infisicalPushSecret)
		if err != nil {
			return err
		}
		api.API_CA_CERTIFICATE = caCert
	} else {
		api.API_CA_CERTIFICATE = ""
	}
	return nil
}

func (h *InfisicalPushSecretHandler) ReconcileInfisicalPushSecret(ctx context.Context, logger logr.Logger, infisicalPushSecret *v1alpha1.InfisicalPushSecret, resourceVariablesMap map[string]util.ResourceVariables) error {
	reconciler := &InfisicalPushSecretReconciler{
		Client:            h.Client,
		Scheme:            h.Scheme,
		IsNamespaceScoped: h.IsNamespaceScoped,
	}
	return reconciler.ReconcileInfisicalPushSecret(ctx, logger, infisicalPushSecret, resourceVariablesMap)
}

func (h *InfisicalPushSecretHandler) DeleteManagedSecrets(ctx context.Context, logger logr.Logger, infisicalPushSecret *v1alpha1.InfisicalPushSecret, resourceVariablesMap map[string]util.ResourceVariables) error {
	reconciler := &InfisicalPushSecretReconciler{
		Client:            h.Client,
		Scheme:            h.Scheme,
		IsNamespaceScoped: h.IsNamespaceScoped,
	}
	return reconciler.DeleteManagedSecrets(ctx, logger, infisicalPushSecret, resourceVariablesMap)
}

func (h *InfisicalPushSecretHandler) SetReconcileStatusCondition(ctx context.Context, infisicalPushSecret *v1alpha1.InfisicalPushSecret, err error) {
	reconciler := &InfisicalPushSecretReconciler{
		Client:            h.Client,
		Scheme:            h.Scheme,
		IsNamespaceScoped: h.IsNamespaceScoped,
	}
	reconciler.SetReconcileStatusCondition(ctx, infisicalPushSecret, err)
}
