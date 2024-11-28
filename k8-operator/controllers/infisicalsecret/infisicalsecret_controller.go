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

	secretsv1alpha1 "github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/api"
	controllerhelpers "github.com/Infisical/infisical/k8-operator/packages/controllerutil"
	"github.com/Infisical/infisical/k8-operator/packages/util"
	"github.com/go-logr/logr"
)

// InfisicalSecretReconciler reconciles a InfisicalSecret object
type InfisicalSecretReconciler struct {
	client.Client
	BaseLogger logr.Logger
	Scheme     *runtime.Scheme
}

var resourceVariablesMap map[string]util.ResourceVariables = make(map[string]util.ResourceVariables)

//+kubebuilder:rbac:groups=secrets.infisical.com,resources=infisicalsecrets,verbs=get;list;watch;create;update;patch;delete
//+kubebuilder:rbac:groups=secrets.infisical.com,resources=infisicalsecrets/status,verbs=get;update;patch
//+kubebuilder:rbac:groups=secrets.infisical.com,resources=infisicalsecrets/finalizers,verbs=update
//+kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch;create;update;delete
//+kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch;create;update;delete
//+kubebuilder:rbac:groups=apps,resources=deployments,verbs=list;watch;get;update
//+kubebuilder:rbac:groups="",resources=serviceaccounts,verbs=get;list;watch

// Reconcile is part of the main kubernetes reconciliation loop which aims to
// move the current state of the cluster closer to the desired state.
// For more details, check Reconcile and its Result here:
// - https://pkg.go.dev/sigs.k8s.io/controller-runtime@v0.13.1/pkg/reconcile

const FINALIZER_NAME = "secrets.finalizers.infisical.com"

// Maps the infisicalSecretCR.UID to a infisicalSdk.InfisicalClientInterface and AuthenticationDetails.
// var resourceVariablesMap = make(map[string]ResourceVariables)

func (r *InfisicalSecretReconciler) GetLogger(req ctrl.Request) logr.Logger {
	return r.BaseLogger.WithValues("infisicalsecret", req.NamespacedName)
}

func (r *InfisicalSecretReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {

	logger := r.GetLogger(req)

	var infisicalSecretCR secretsv1alpha1.InfisicalSecret
	requeueTime := time.Minute // seconds

	if resourceVariablesMap == nil {
		resourceVariablesMap = make(map[string]util.ResourceVariables)
	}

	err := r.Get(ctx, req.NamespacedName, &infisicalSecretCR)
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

	// Remove finalizers if they exist. This is to support previous InfisicalSecret CRD's that have finalizers on them.
	// In order to delete secrets with finalizers, we first remove the finalizers so we can use the simplified and improved deletion process
	if !infisicalSecretCR.ObjectMeta.DeletionTimestamp.IsZero() && len(infisicalSecretCR.ObjectMeta.Finalizers) > 0 {
		infisicalSecretCR.ObjectMeta.Finalizers = []string{}
		if err := r.Update(ctx, &infisicalSecretCR); err != nil {
			logger.Error(err, fmt.Sprintf("Error removing finalizers from Infisical Secret %s", infisicalSecretCR.Name))
			return ctrl.Result{}, err
		}
		// Our finalizers have been removed, so the reconciler can do nothing.
		return ctrl.Result{}, nil
	}

	if infisicalSecretCR.Spec.ResyncInterval != 0 {
		requeueTime = time.Second * time.Duration(infisicalSecretCR.Spec.ResyncInterval)
		logger.Info(fmt.Sprintf("Manual re-sync interval set. Interval: %v", requeueTime))

	} else {
		logger.Info(fmt.Sprintf("Re-sync interval set. Interval: %v", requeueTime))
	}

	// Check if the resource is already marked for deletion
	if infisicalSecretCR.GetDeletionTimestamp() != nil {
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

	if infisicalSecretCR.Spec.HostAPI == "" {
		api.API_HOST_URL = infisicalConfig["hostAPI"]
	} else {
		api.API_HOST_URL = infisicalSecretCR.Spec.HostAPI
	}

	if infisicalSecretCR.Spec.TLS.CaRef.SecretName != "" {
		api.API_CA_CERTIFICATE, err = r.getInfisicalCaCertificateFromKubeSecret(ctx, infisicalSecretCR)
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

	err = r.ReconcileInfisicalSecret(ctx, logger, infisicalSecretCR)
	r.SetReadyToSyncSecretsConditions(ctx, &infisicalSecretCR, err)

	if err != nil {

		logger.Error(err, fmt.Sprintf("unable to reconcile InfisicalSecret. Will requeue after [requeueTime=%v]", requeueTime))
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	}

	numDeployments, err := r.ReconcileDeploymentsWithManagedSecrets(ctx, logger, infisicalSecretCR)
	r.SetInfisicalAutoRedeploymentReady(ctx, logger, &infisicalSecretCR, numDeployments, err)
	if err != nil {
		logger.Error(err, fmt.Sprintf("unable to reconcile auto redeployment. Will requeue after [requeueTime=%v]", requeueTime))
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	}

	// Sync again after the specified time
	logger.Info(fmt.Sprintf("Operator will requeue after [%v]", requeueTime))
	return ctrl.Result{
		RequeueAfter: requeueTime,
	}, nil
}

func (r *InfisicalSecretReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&secretsv1alpha1.InfisicalSecret{}, builder.WithPredicates(predicate.Funcs{
			UpdateFunc: func(e event.UpdateEvent) bool {
				if resourceVariablesMap != nil {
					if rv, ok := resourceVariablesMap[string(e.ObjectNew.GetUID())]; ok {
						rv.CancelCtx()
						delete(resourceVariablesMap, string(e.ObjectNew.GetUID()))
					}
				}
				return true
			},
			DeleteFunc: func(e event.DeleteEvent) bool {
				if resourceVariablesMap != nil {
					if rv, ok := resourceVariablesMap[string(e.Object.GetUID())]; ok {
						rv.CancelCtx()
						delete(resourceVariablesMap, string(e.Object.GetUID()))
					}
				}
				return true
			},
		})).
		Complete(r)
}
