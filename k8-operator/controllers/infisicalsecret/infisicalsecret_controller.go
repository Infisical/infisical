package controllers

import (
	"context"
	"fmt"
	"time"

	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/builder"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/event"
	"sigs.k8s.io/controller-runtime/pkg/predicate"

	defaultErrors "errors"

	secretsv1alpha1 "github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/api"
	controllerhelpers "github.com/Infisical/infisical/k8-operator/packages/controllerhelpers"
	"github.com/Infisical/infisical/k8-operator/packages/util"
	"github.com/go-logr/logr"
)

// InfisicalSecretReconciler reconciles a InfisicalSecret object
type InfisicalSecretReconciler struct {
	client.Client
	BaseLogger logr.Logger
	Scheme     *runtime.Scheme
}

const FINALIZER_NAME = "secrets.finalizers.infisical.com"

var infisicalSecretResourceVariablesMap map[string]util.ResourceVariables = make(map[string]util.ResourceVariables)

func (r *InfisicalSecretReconciler) GetLogger(req ctrl.Request) logr.Logger {
	return r.BaseLogger.WithValues("infisicalsecret", req.NamespacedName)
}

//+kubebuilder:rbac:groups=secrets.infisical.com,resources=infisicalsecrets,verbs=get;list;watch;create;update;patch;delete
//+kubebuilder:rbac:groups=secrets.infisical.com,resources=infisicalsecrets/status,verbs=get;update;patch
//+kubebuilder:rbac:groups=secrets.infisical.com,resources=infisicalsecrets/finalizers,verbs=update
//+kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch;create;update;delete
//+kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch;create;update;delete
//+kubebuilder:rbac:groups=apps,resources=deployments;daemonsets;statefulsets,verbs=list;watch;get;update
//+kubebuilder:rbac:groups="",resources=serviceaccounts,verbs=get;list;watch

// Reconcile is part of the main kubernetes reconciliation loop which aims to
// move the current state of the cluster closer to the desired state.
// For more details, check Reconcile and its Result here:
// - https://pkg.go.dev/sigs.k8s.io/controller-runtime@v0.13.1/pkg/reconcile

func (r *InfisicalSecretReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {

	logger := r.GetLogger(req)

	var infisicalSecretCRD secretsv1alpha1.InfisicalSecret
	requeueTime := time.Minute // seconds

	err := r.Get(ctx, req.NamespacedName, &infisicalSecretCRD)
	if err != nil {
		if errors.IsNotFound(err) {
			return ctrl.Result{
				Requeue: false,
			}, nil
		} else {
			logger.Error(err, "unable to fetch Infisical Secret CRD from cluster")
			return ctrl.Result{
				RequeueAfter: requeueTime,
			}, nil
		}
	}

	// It's important we don't directly modify the CRD object, so we create a copy of it and move existing data into it.
	managedKubeSecretReferences := infisicalSecretCRD.Spec.ManagedKubeSecretReferences
	managedKubeConfigMapReferences := infisicalSecretCRD.Spec.ManagedKubeConfigMapReferences

	if infisicalSecretCRD.Spec.ManagedSecretReference.SecretName != "" && managedKubeSecretReferences != nil && len(managedKubeSecretReferences) > 0 {
		errMessage := "InfisicalSecret CRD cannot have both managedSecretReference and managedKubeSecretReferences"
		logger.Error(defaultErrors.New(errMessage), errMessage)
		return ctrl.Result{}, defaultErrors.New(errMessage)
	}

	if infisicalSecretCRD.Spec.ManagedSecretReference.SecretName != "" {
		logger.Info("\n\n\nThe field `managedSecretReference` will be deprecated in the near future, please use `managedKubeSecretReferences` instead.\n\nRefer to the documentation for more information: https://infisical.com/docs/integrations/platforms/kubernetes/infisical-secret-crd\n\n\n")

		if managedKubeSecretReferences == nil {
			managedKubeSecretReferences = []secretsv1alpha1.ManagedKubeSecretConfig{}
		}
		managedKubeSecretReferences = append(managedKubeSecretReferences, infisicalSecretCRD.Spec.ManagedSecretReference)
	}

	if len(managedKubeSecretReferences) == 0 && len(managedKubeConfigMapReferences) == 0 {
		errMessage := "InfisicalSecret CRD must have at least one managed secret reference set in the `managedKubeSecretReferences` or `managedKubeConfigMapReferences` field"
		logger.Error(defaultErrors.New(errMessage), errMessage)
		return ctrl.Result{}, defaultErrors.New(errMessage)
	}

	// Remove finalizers if they exist. This is to support previous InfisicalSecret CRD's that have finalizers on them.
	// In order to delete secrets with finalizers, we first remove the finalizers so we can use the simplified and improved deletion process
	if !infisicalSecretCRD.ObjectMeta.DeletionTimestamp.IsZero() && len(infisicalSecretCRD.ObjectMeta.Finalizers) > 0 {
		infisicalSecretCRD.ObjectMeta.Finalizers = []string{}
		if err := r.Update(ctx, &infisicalSecretCRD); err != nil {
			logger.Error(err, fmt.Sprintf("Error removing finalizers from Infisical Secret %s", infisicalSecretCRD.Name))
			return ctrl.Result{}, err
		}
		// Our finalizers have been removed, so the reconciler can do nothing.
		return ctrl.Result{}, nil
	}

	if infisicalSecretCRD.Spec.ResyncInterval != 0 {
		requeueTime = time.Second * time.Duration(infisicalSecretCRD.Spec.ResyncInterval)
		logger.Info(fmt.Sprintf("Manual re-sync interval set. Interval: %v", requeueTime))

	} else {
		logger.Info(fmt.Sprintf("Re-sync interval set. Interval: %v", requeueTime))
	}

	// Check if the resource is already marked for deletion
	if infisicalSecretCRD.GetDeletionTimestamp() != nil {
		return ctrl.Result{
			Requeue: false,
		}, nil
	}

	// Get modified/default config
	infisicalConfig, err := controllerhelpers.GetInfisicalConfigMap(ctx, r.Client)
	if err != nil {
		logger.Error(err, fmt.Sprintf("unable to fetch infisical-config. Will requeue after [requeueTime=%v]", requeueTime))
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	}

	if infisicalSecretCRD.Spec.HostAPI == "" {
		api.API_HOST_URL = infisicalConfig["hostAPI"]
	} else {
		api.API_HOST_URL = util.AppendAPIEndpoint(infisicalSecretCRD.Spec.HostAPI)
	}

	if infisicalSecretCRD.Spec.TLS.CaRef.SecretName != "" {
		api.API_CA_CERTIFICATE, err = r.getInfisicalCaCertificateFromKubeSecret(ctx, infisicalSecretCRD)
		if err != nil {
			logger.Error(err, fmt.Sprintf("unable to fetch CA certificate. Will requeue after [requeueTime=%v]", requeueTime))
			return ctrl.Result{
				RequeueAfter: requeueTime,
			}, nil
		}

		logger.Info("Using custom CA certificate...")
	} else {
		api.API_CA_CERTIFICATE = ""
	}

	secretsCount, err := r.ReconcileInfisicalSecret(ctx, logger, &infisicalSecretCRD, managedKubeSecretReferences, managedKubeConfigMapReferences)
	r.SetReadyToSyncSecretsConditions(ctx, logger, &infisicalSecretCRD, secretsCount, err)

	if err != nil {
		logger.Error(err, fmt.Sprintf("unable to reconcile InfisicalSecret. Will requeue after [requeueTime=%v]", requeueTime))
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	}

	numDeployments, err := controllerhelpers.ReconcileDeploymentsWithMultipleManagedSecrets(ctx, r.Client, logger, managedKubeSecretReferences)
	r.SetInfisicalAutoRedeploymentReady(ctx, logger, &infisicalSecretCRD, numDeployments, err)

	if err != nil {
		logger.Error(err, fmt.Sprintf("unable to reconcile auto redeployment. Will requeue after [requeueTime=%v]", requeueTime))
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	}

	// Sync again after the specified time
	logger.Info(fmt.Sprintf("Successfully synced %d secrets. Operator will requeue after [%v]", secretsCount, requeueTime))
	return ctrl.Result{
		RequeueAfter: requeueTime,
	}, nil
}

func (r *InfisicalSecretReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&secretsv1alpha1.InfisicalSecret{}, builder.WithPredicates(predicate.Funcs{
			UpdateFunc: func(e event.UpdateEvent) bool {
				if e.ObjectOld.GetGeneration() == e.ObjectNew.GetGeneration() {
					return false // Skip reconciliation for status-only changes
				}

				if infisicalSecretResourceVariablesMap != nil {
					if rv, ok := infisicalSecretResourceVariablesMap[string(e.ObjectNew.GetUID())]; ok {
						rv.CancelCtx()
						delete(infisicalSecretResourceVariablesMap, string(e.ObjectNew.GetUID()))
					}
				}
				return true
			},
			DeleteFunc: func(e event.DeleteEvent) bool {
				if infisicalSecretResourceVariablesMap != nil {
					if rv, ok := infisicalSecretResourceVariablesMap[string(e.Object.GetUID())]; ok {
						rv.CancelCtx()
						delete(infisicalSecretResourceVariablesMap, string(e.Object.GetUID()))
					}
				}
				return true
			},
		})).
		Complete(r)
}
