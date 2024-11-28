package controllers

import (
	"context"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/builder"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/event"
	"sigs.k8s.io/controller-runtime/pkg/handler"
	"sigs.k8s.io/controller-runtime/pkg/predicate"
	"sigs.k8s.io/controller-runtime/pkg/reconcile"
	"sigs.k8s.io/controller-runtime/pkg/source"

	secretsv1alpha1 "github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/api"
	"github.com/Infisical/infisical/k8-operator/packages/constants"
	controllerhelpers "github.com/Infisical/infisical/k8-operator/packages/controllerutil"
	"github.com/Infisical/infisical/k8-operator/packages/util"
	"github.com/go-logr/logr"
)

// InfisicalSecretReconciler reconciles a InfisicalSecret object
type InfisicalPushSecretReconciler struct {
	client.Client

	BaseLogger logr.Logger
	Scheme     *runtime.Scheme
}

var resourceVariablesMap map[string]util.ResourceVariables

func (r *InfisicalPushSecretReconciler) GetLogger(req ctrl.Request) logr.Logger {
	return r.BaseLogger.WithValues("infisicalpushsecret", req.NamespacedName)
}

//+kubebuilder:rbac:groups=secrets.infisical.com,resources=infisicalpushsecrets,verbs=get;list;watch;create;update;patch;delete
//+kubebuilder:rbac:groups=secrets.infisical.com,resources=infisicalpushsecrets/status,verbs=get;update;patch
//+kubebuilder:rbac:groups=secrets.infisical.com,resources=infisicalpushsecrets/finalizers,verbs=update
//+kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch;create;update;delete
//+kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch;create;update;delete
//+kubebuilder:rbac:groups=apps,resources=deployments,verbs=list;watch;get;update
//+kubebuilder:rbac:groups="",resources=serviceaccounts,verbs=get;list;watch

// Reconcile is part of the main kubernetes reconciliation loop which aims to
// move the current state of the cluster closer to the desired state.
// For more details, check Reconcile and its Result here:
// - https://pkg.go.dev/sigs.k8s.io/controller-runtime@v0.13.1/pkg/reconcile

func (r *InfisicalPushSecretReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {

	logger := r.GetLogger(req)

	var infisicalPushSecretCR secretsv1alpha1.InfisicalPushSecret
	requeueTime := time.Minute // seconds

	if resourceVariablesMap == nil {
		resourceVariablesMap = make(map[string]util.ResourceVariables)
	}

	err := r.Get(ctx, req.NamespacedName, &infisicalPushSecretCR)
	if err != nil {
		if errors.IsNotFound(err) {
			logger.Info("Infisical Push Secret CRD not found")
			return ctrl.Result{
				Requeue: false,
			}, nil
		} else {
			logger.Error(err, "Unable to fetch Infisical Secret CRD from cluster")
			return ctrl.Result{
				RequeueAfter: requeueTime,
			}, nil
		}
	}

	// Add finalizer if it doesn't exist
	if !controllerutil.ContainsFinalizer(&infisicalPushSecretCR, constants.INFISICAL_PUSH_SECRET_FINALIZER_NAME) {
		controllerutil.AddFinalizer(&infisicalPushSecretCR, constants.INFISICAL_PUSH_SECRET_FINALIZER_NAME)
		if err := r.Update(ctx, &infisicalPushSecretCR); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Check if it's being deleted
	if !infisicalPushSecretCR.DeletionTimestamp.IsZero() {
		logger.Info("Handling deletion of InfisicalPushSecret")
		if controllerutil.ContainsFinalizer(&infisicalPushSecretCR, constants.INFISICAL_PUSH_SECRET_FINALIZER_NAME) {
			// We remove finalizers before running deletion logic to be completely safe from stuck resources
			infisicalPushSecretCR.ObjectMeta.Finalizers = []string{}
			if err := r.Update(ctx, &infisicalPushSecretCR); err != nil {
				logger.Error(err, fmt.Sprintf("Error removing finalizers from InfisicalPushSecret %s", infisicalPushSecretCR.Name))
				return ctrl.Result{}, err
			}

			if err := r.DeleteManagedSecrets(ctx, logger, infisicalPushSecretCR); err != nil {
				return ctrl.Result{}, err // Even if this fails, we still want to delete the CRD
			}

		}
		return ctrl.Result{}, nil
	}

	if infisicalPushSecretCR.Spec.ResyncInterval != "" {

		duration, err := util.ConvertResyncIntervalToDuration(infisicalPushSecretCR.Spec.ResyncInterval)

		if err != nil {
			logger.Error(err, fmt.Sprintf("unable to convert resync interval to duration. Will requeue after [requeueTime=%v]", requeueTime))
			return ctrl.Result{
				RequeueAfter: requeueTime,
			}, nil
		}

		requeueTime = duration

		logger.Info(fmt.Sprintf("Manual re-sync interval set. Interval: %v", requeueTime))

	} else {
		logger.Info(fmt.Sprintf("Re-sync interval set. Interval: %v", requeueTime))
	}

	// Check if the resource is already marked for deletion
	if infisicalPushSecretCR.GetDeletionTimestamp() != nil {
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

	if infisicalPushSecretCR.Spec.HostAPI == "" {
		api.API_HOST_URL = infisicalConfig["hostAPI"]
	} else {
		api.API_HOST_URL = infisicalPushSecretCR.Spec.HostAPI
	}

	if infisicalPushSecretCR.Spec.TLS.CaRef.SecretName != "" {
		api.API_CA_CERTIFICATE, err = r.getInfisicalCaCertificateFromKubeSecret(ctx, infisicalPushSecretCR)
		if err != nil {
			logger.Error(err, fmt.Sprintf("unable to fetch CA certificate. Will requeue after [requeueTime=%v]", requeueTime))
			return ctrl.Result{
				RequeueAfter: requeueTime,
			}, nil
		}

		fmt.Println("Using custom CA certificate...")
	} else {
		api.API_CA_CERTIFICATE = ""
	}

	err = r.ReconcileInfisicalPushSecret(ctx, logger, infisicalPushSecretCR)
	r.SetSuccessfullyReconciledConditions(ctx, &infisicalPushSecretCR, err)

	if err != nil {
		logger.Error(err, fmt.Sprintf("unable to reconcile Infisical Push Secret. Will requeue after [requeueTime=%v]", requeueTime))
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

func (r *InfisicalPushSecretReconciler) SetupWithManager(mgr ctrl.Manager) error {

	// Custom predicate that allows both spec changes and deletions
	specChangeOrDelete := predicate.Funcs{
		UpdateFunc: func(e event.UpdateEvent) bool {
			// Only reconcile if spec/generation changed
			return e.ObjectOld.GetGeneration() != e.ObjectNew.GetGeneration()
		},
		DeleteFunc: func(e event.DeleteEvent) bool {
			// Always reconcile on deletion
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
		For(&secretsv1alpha1.InfisicalPushSecret{}, builder.WithPredicates(
			specChangeOrDelete,
		)).
		Watches(
			&source.Kind{Type: &corev1.Secret{}},
			handler.EnqueueRequestsFromMapFunc(func(o client.Object) []reconcile.Request {
				ctx := context.Background()
				pushSecrets := &secretsv1alpha1.InfisicalPushSecretList{}
				if err := r.List(ctx, pushSecrets); err != nil {
					return []reconcile.Request{}
				}

				requests := []reconcile.Request{}
				for _, pushSecret := range pushSecrets.Items {
					if pushSecret.Spec.Push.Secret.SecretName == o.GetName() &&
						pushSecret.Spec.Push.Secret.SecretNamespace == o.GetNamespace() {
						requests = append(requests, reconcile.Request{
							NamespacedName: types.NamespacedName{
								Name:      pushSecret.GetName(),
								Namespace: pushSecret.GetNamespace(),
							},
						})
					}
				}
				return requests
			}),
		).
		Complete(r)
}
