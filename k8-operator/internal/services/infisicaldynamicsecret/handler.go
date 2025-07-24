package infisicaldynamicsecret

import (
	"context"
	"fmt"
	"math/rand"
	"time"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/internal/api"
	"github.com/Infisical/infisical/k8-operator/internal/util"
	"github.com/go-logr/logr"
	k8Errors "k8s.io/apimachinery/pkg/api/errors"
)

type InfisicalDynamicSecretHandler struct {
	client.Client
	Scheme *runtime.Scheme
	Random *rand.Rand
}

func NewInfisicalDynamicSecretHandler(client client.Client, scheme *runtime.Scheme) *InfisicalDynamicSecretHandler {
	return &InfisicalDynamicSecretHandler{
		Client: client,
		Scheme: scheme,
		Random: rand.New(rand.NewSource(time.Now().UnixNano())),
	}
}

func (h *InfisicalDynamicSecretHandler) SetupAPIConfig(infisicalDynamicSecret v1alpha1.InfisicalDynamicSecret, infisicalConfig map[string]string) error {
	if infisicalDynamicSecret.Spec.HostAPI == "" {
		api.API_HOST_URL = infisicalConfig["hostAPI"]
	} else {
		api.API_HOST_URL = util.AppendAPIEndpoint(infisicalDynamicSecret.Spec.HostAPI)
	}
	return nil
}

func (h *InfisicalDynamicSecretHandler) getInfisicalCaCertificateFromKubeSecret(ctx context.Context, infisicalDynamicSecret v1alpha1.InfisicalDynamicSecret) (caCertificate string, err error) {

	caCertificateFromKubeSecret, err := util.GetKubeSecretByNamespacedName(ctx, h.Client, types.NamespacedName{
		Namespace: infisicalDynamicSecret.Spec.TLS.CaRef.SecretNamespace,
		Name:      infisicalDynamicSecret.Spec.TLS.CaRef.SecretName,
	})

	if k8Errors.IsNotFound(err) {
		return "", fmt.Errorf("kubernetes secret containing custom CA certificate cannot be found. [err=%s]", err)
	}

	if err != nil {
		return "", fmt.Errorf("something went wrong when fetching your CA certificate [err=%s]", err)
	}

	caCertificateFromSecret := string(caCertificateFromKubeSecret.Data[infisicalDynamicSecret.Spec.TLS.CaRef.SecretKey])

	return caCertificateFromSecret, nil
}

func (h *InfisicalDynamicSecretHandler) HandleCACertificate(ctx context.Context, infisicalDynamicSecret v1alpha1.InfisicalDynamicSecret) error {
	if infisicalDynamicSecret.Spec.TLS.CaRef.SecretName != "" {
		caCert, err := h.getInfisicalCaCertificateFromKubeSecret(ctx, infisicalDynamicSecret)
		if err != nil {
			return err
		}
		api.API_CA_CERTIFICATE = caCert
	} else {
		api.API_CA_CERTIFICATE = ""
	}
	return nil
}

func (h *InfisicalDynamicSecretHandler) ReconcileInfisicalDynamicSecret(ctx context.Context, logger logr.Logger, infisicalDynamicSecret *v1alpha1.InfisicalDynamicSecret, resourceVariablesMap map[string]util.ResourceVariables) (time.Duration, error) {
	reconciler := &InfisicalDynamicSecretReconciler{
		Client: h.Client,
		Scheme: h.Scheme,
		Random: h.Random,
	}
	return reconciler.ReconcileInfisicalDynamicSecret(ctx, logger, infisicalDynamicSecret, resourceVariablesMap)
}

func (h *InfisicalDynamicSecretHandler) HandleLeaseRevocation(ctx context.Context, logger logr.Logger, infisicalDynamicSecret *v1alpha1.InfisicalDynamicSecret, resourceVariablesMap map[string]util.ResourceVariables) error {
	reconciler := &InfisicalDynamicSecretReconciler{
		Client: h.Client,
		Scheme: h.Scheme,
		Random: h.Random,
	}
	return reconciler.HandleLeaseRevocation(ctx, logger, infisicalDynamicSecret, resourceVariablesMap)
}

func (h *InfisicalDynamicSecretHandler) SetReconcileConditionStatus(ctx context.Context, logger logr.Logger, infisicalDynamicSecret *v1alpha1.InfisicalDynamicSecret, errorToConditionOn error) {
	reconciler := &InfisicalDynamicSecretReconciler{
		Client: h.Client,
		Scheme: h.Scheme,
		Random: h.Random,
	}
	reconciler.SetReconcileConditionStatus(ctx, logger, infisicalDynamicSecret, errorToConditionOn)
}

func (h *InfisicalDynamicSecretHandler) SetReconcileAutoRedeploymentConditionStatus(ctx context.Context, logger logr.Logger, infisicalDynamicSecret *v1alpha1.InfisicalDynamicSecret, numDeployments int, errorToConditionOn error) {
	reconciler := &InfisicalDynamicSecretReconciler{
		Client: h.Client,
		Scheme: h.Scheme,
		Random: h.Random,
	}
	reconciler.SetReconcileAutoRedeploymentConditionStatus(ctx, logger, infisicalDynamicSecret, numDeployments, errorToConditionOn)
}
