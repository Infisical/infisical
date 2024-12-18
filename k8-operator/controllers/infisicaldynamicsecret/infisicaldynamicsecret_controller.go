package controllers

import (
	"context"
	"fmt"
	"math/rand"
	"time"

	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/builder"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/event"
	"sigs.k8s.io/controller-runtime/pkg/predicate"

	secretsv1alpha1 "github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/api"
	"github.com/Infisical/infisical/k8-operator/packages/constants"
	controllerhelpers "github.com/Infisical/infisical/k8-operator/packages/controllerhelpers"
	"github.com/Infisical/infisical/k8-operator/packages/util"
	"github.com/go-logr/logr"
)

// InfisicalDynamicSecretReconciler reconciles a InfisicalDynamicSecret object
type InfisicalDynamicSecretReconciler struct {
	client.Client
	Scheme *runtime.Scheme

	BaseLogger logr.Logger
	Random     *rand.Rand
}

var infisicalDynamicSecretsResourceVariablesMap map[string]util.ResourceVariables = make(map[string]util.ResourceVariables)

func (r *InfisicalDynamicSecretReconciler) GetLogger(req ctrl.Request) logr.Logger {
	return r.BaseLogger.WithValues("infisicaldynamicsecret", req.NamespacedName)
}

// +kubebuilder:rbac:groups=secrets.infisical.com,resources=infisicaldynamicsecrets,verbs=get;list;watch;create;update;patch;delete
// +kubebuilder:rbac:groups=secrets.infisical.com,resources=infisicaldynamicsecrets/status,verbs=get;update;patch
// +kubebuilder:rbac:groups=secrets.infisical.com,resources=infisicaldynamicsecrets/finalizers,verbs=update
// +kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch;create;update;delete
// +kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch;create;update;delete
// +kubebuilder:rbac:groups=apps,resources=deployments,verbs=list;watch;get;update
// +kubebuilder:rbac:groups="",resources=serviceaccounts,verbs=get;list;watch

func (r *InfisicalDynamicSecretReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {

	logger := r.GetLogger(req)

	var infisicalDynamicSecretCRD secretsv1alpha1.InfisicalDynamicSecret
	requeueTime := time.Second * 5

	err := r.Get(ctx, req.NamespacedName, &infisicalDynamicSecretCRD)
	if err != nil {
		if errors.IsNotFound(err) {
			logger.Info("Infisical Dynamic Secret CRD not found")
			return ctrl.Result{
				Requeue: false,
			}, nil
		} else {
			logger.Error(err, "Unable to fetch Infisical Dynamic Secret CRD from cluster")
			return ctrl.Result{
				RequeueAfter: requeueTime,
			}, nil
		}
	}

	// Add finalizer if it doesn't exist
	if !controllerutil.ContainsFinalizer(&infisicalDynamicSecretCRD, constants.INFISICAL_DYNAMIC_SECRET_FINALIZER_NAME) {
		controllerutil.AddFinalizer(&infisicalDynamicSecretCRD, constants.INFISICAL_DYNAMIC_SECRET_FINALIZER_NAME)
		if err := r.Update(ctx, &infisicalDynamicSecretCRD); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Check if it's being deleted
	if !infisicalDynamicSecretCRD.DeletionTimestamp.IsZero() {
		logger.Info("Handling deletion of InfisicalDynamicSecret")
		if controllerutil.ContainsFinalizer(&infisicalDynamicSecretCRD, constants.INFISICAL_DYNAMIC_SECRET_FINALIZER_NAME) {
			// We remove finalizers before running deletion logic to be completely safe from stuck resources
			infisicalDynamicSecretCRD.ObjectMeta.Finalizers = []string{}
			if err := r.Update(ctx, &infisicalDynamicSecretCRD); err != nil {
				logger.Error(err, fmt.Sprintf("Error removing finalizers from InfisicalDynamicSecret %s", infisicalDynamicSecretCRD.Name))
				return ctrl.Result{}, err
			}

			err := r.HandleLeaseRevocation(ctx, logger, &infisicalDynamicSecretCRD)

			if infisicalDynamicSecretsResourceVariablesMap != nil {
				if rv, ok := infisicalDynamicSecretsResourceVariablesMap[string(infisicalDynamicSecretCRD.GetUID())]; ok {
					rv.CancelCtx()
					delete(infisicalDynamicSecretsResourceVariablesMap, string(infisicalDynamicSecretCRD.GetUID()))
				}
			}

			if err != nil {
				return ctrl.Result{}, err // Even if this fails, we still want to delete the CRD
			}

		}
		return ctrl.Result{}, nil
	}

	// Get modified/default config
	infisicalConfig, err := controllerhelpers.GetInfisicalConfigMap(ctx, r.Client)
	if err != nil {
		logger.Error(err, fmt.Sprintf("unable to fetch infisical-config. Will requeue after [requeueTime=%v]", requeueTime))
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	}

	if infisicalDynamicSecretCRD.Spec.HostAPI == "" {
		api.API_HOST_URL = infisicalConfig["hostAPI"]
	} else {
		api.API_HOST_URL = util.AppendAPIEndpoint(infisicalDynamicSecretCRD.Spec.HostAPI)
	}

	if infisicalDynamicSecretCRD.Spec.TLS.CaRef.SecretName != "" {
		api.API_CA_CERTIFICATE, err = r.getInfisicalCaCertificateFromKubeSecret(ctx, infisicalDynamicSecretCRD)
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

	nextReconcile, err := r.ReconcileInfisicalDynamicSecret(ctx, logger, &infisicalDynamicSecretCRD)
	r.SetReconcileConditionStatus(ctx, logger, &infisicalDynamicSecretCRD, err)

	if err == nil && nextReconcile.Seconds() >= 5 {
		requeueTime = nextReconcile
	}

	if err != nil {
		logger.Error(err, fmt.Sprintf("unable to reconcile Infisical Push Secret. Will requeue after [requeueTime=%v]", requeueTime))
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	}

	numDeployments, err := controllerhelpers.ReconcileDeploymentsWithManagedSecrets(ctx, r.Client, logger, infisicalDynamicSecretCRD.Spec.ManagedSecretReference)
	r.SetReconcileAutoRedeploymentConditionStatus(ctx, logger, &infisicalDynamicSecretCRD, numDeployments, err)

	if err != nil {
		logger.Error(err, fmt.Sprintf("unable to reconcile auto redeployment. Will requeue after [requeueTime=%v]", requeueTime))
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	}

	// Sync again after the specified time
	logger.Info(fmt.Sprintf("Next reconciliation in [requeueTime=%v]", requeueTime))
	return ctrl.Result{
		RequeueAfter: requeueTime,
	}, nil
}

func (r *InfisicalDynamicSecretReconciler) SetupWithManager(mgr ctrl.Manager) error {

	// Custom predicate that allows both spec changes and deletions
	specChangeOrDelete := predicate.Funcs{
		UpdateFunc: func(e event.UpdateEvent) bool {
			// Only reconcile if spec/generation changed

			isSpecOrGenerationChange := e.ObjectOld.GetGeneration() != e.ObjectNew.GetGeneration()

			if isSpecOrGenerationChange {
				if infisicalDynamicSecretsResourceVariablesMap != nil {
					if rv, ok := infisicalDynamicSecretsResourceVariablesMap[string(e.ObjectNew.GetUID())]; ok {
						rv.CancelCtx()
						delete(infisicalDynamicSecretsResourceVariablesMap, string(e.ObjectNew.GetUID()))
					}
				}
			}

			return isSpecOrGenerationChange
		},
		DeleteFunc: func(e event.DeleteEvent) bool {
			// Always reconcile on deletion

			if infisicalDynamicSecretsResourceVariablesMap != nil {
				if rv, ok := infisicalDynamicSecretsResourceVariablesMap[string(e.Object.GetUID())]; ok {
					rv.CancelCtx()
					delete(infisicalDynamicSecretsResourceVariablesMap, string(e.Object.GetUID()))
				}
			}

			return true
		},
		CreateFunc: func(e event.CreateEvent) bool {
			// Reconcile on creation
			return true
		},
		GenericFunc: func(e event.GenericEvent) bool {
			// Ignore generic events
			return false
		},
	}

	return ctrl.NewControllerManagedBy(mgr).
		For(&secretsv1alpha1.InfisicalDynamicSecret{}, builder.WithPredicates(
			specChangeOrDelete,
		)).
		Complete(r)
}
