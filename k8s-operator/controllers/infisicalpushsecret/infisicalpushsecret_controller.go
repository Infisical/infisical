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
	controllerhelpers "github.com/Infisical/infisical/k8-operator/packages/controllerhelpers"
	"github.com/Infisical/infisical/k8-operator/packages/util"
	"github.com/go-logr/logr"
)

// InfisicalSecretReconciler reconciles a InfisicalSecret object
type InfisicalPushSecretReconciler struct {
	client.Client
	IsNamespaceScoped bool
	BaseLogger        logr.Logger
	Scheme            *runtime.Scheme
}

var infisicalPushSecretResourceVariablesMap map[string]util.ResourceVariables = make(map[string]util.ResourceVariables)

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
//+kubebuilder:rbac:groups="",resources=pods,verbs=get;list
//+kubebuilder:rbac:groups="authentication.k8s.io",resources=tokenreviews,verbs=create
//+kubebuilder:rbac:groups="",resources=serviceaccounts/token,verbs=create
//+kubebuilder:rbac:groups=secrets.infisical.com,resources=clustergenerators,verbs=get;list;watch;create;update;patch;delete
// Reconcile is part of the main kubernetes reconciliation loop which aims to
// move the current state of the cluster closer to the desired state.
// For more details, check Reconcile and its Result here:
// - https://pkg.go.dev/sigs.k8s.io/controller-runtime@v0.13.1/pkg/reconcile

func (r *InfisicalPushSecretReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {

	logger := r.GetLogger(req)

	var infisicalPushSecretCRD secretsv1alpha1.InfisicalPushSecret
	requeueTime := time.Minute // seconds

	err := r.Get(ctx, req.NamespacedName, &infisicalPushSecretCRD)
	if err != nil {
		if errors.IsNotFound(err) {
			logger.Info("Infisical Push Secret CRD not found")
			r.DeleteManagedSecrets(ctx, logger, infisicalPushSecretCRD)

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
	if !controllerutil.ContainsFinalizer(&infisicalPushSecretCRD, constants.INFISICAL_PUSH_SECRET_FINALIZER_NAME) {
		controllerutil.AddFinalizer(&infisicalPushSecretCRD, constants.INFISICAL_PUSH_SECRET_FINALIZER_NAME)
		if err := r.Update(ctx, &infisicalPushSecretCRD); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Check if it's being deleted
	if !infisicalPushSecretCRD.DeletionTimestamp.IsZero() {
		logger.Info("Handling deletion of InfisicalPushSecret")
		if controllerutil.ContainsFinalizer(&infisicalPushSecretCRD, constants.INFISICAL_PUSH_SECRET_FINALIZER_NAME) {
			// We remove finalizers before running deletion logic to be completely safe from stuck resources
			infisicalPushSecretCRD.ObjectMeta.Finalizers = []string{}
			if err := r.Update(ctx, &infisicalPushSecretCRD); err != nil {
				logger.Error(err, fmt.Sprintf("Error removing finalizers from InfisicalPushSecret %s", infisicalPushSecretCRD.Name))
				return ctrl.Result{}, err
			}

			if err := r.DeleteManagedSecrets(ctx, logger, infisicalPushSecretCRD); err != nil {
				return ctrl.Result{}, err // Even if this fails, we still want to delete the CRD
			}

		}
		return ctrl.Result{}, nil
	}

	if infisicalPushSecretCRD.Spec.Push.Secret == nil && infisicalPushSecretCRD.Spec.Push.Generators == nil {
		logger.Info("No secret or generators found, skipping reconciliation. Please define ")
		return ctrl.Result{}, nil
	}

	duration, err := util.ConvertIntervalToDuration(infisicalPushSecretCRD.Spec.ResyncInterval)

	if err != nil {
		// if resyncInterval is nil, we don't want to reconcile automatically
		if infisicalPushSecretCRD.Spec.ResyncInterval != nil {
			logger.Error(err, fmt.Sprintf("unable to convert resync interval to duration. Will requeue after [requeueTime=%v]", requeueTime))
			return ctrl.Result{
				RequeueAfter: requeueTime,
			}, nil
		} else {
			logger.Error(err, "unable to convert resync interval to duration")
			return ctrl.Result{}, err
		}
	}

	requeueTime = duration

	if requeueTime != 0 {
		logger.Info(fmt.Sprintf("Manual re-sync interval set. Interval: %v", requeueTime))
	}

	// Check if the resource is already marked for deletion
	if infisicalPushSecretCRD.GetDeletionTimestamp() != nil {
		return ctrl.Result{
			Requeue: false,
		}, nil
	}

	// Get modified/default config
	infisicalConfig, err := controllerhelpers.GetInfisicalConfigMap(ctx, r.Client)
	if err != nil {
		if requeueTime != 0 {
			logger.Error(err, fmt.Sprintf("unable to fetch infisical-config. Will requeue after [requeueTime=%v]", requeueTime))
			return ctrl.Result{
				RequeueAfter: requeueTime,
			}, nil
		} else {
			logger.Error(err, "unable to fetch infisical-config")
			return ctrl.Result{}, err
		}
	}

	if infisicalPushSecretCRD.Spec.HostAPI == "" {
		api.API_HOST_URL = infisicalConfig["hostAPI"]
	} else {
		api.API_HOST_URL = util.AppendAPIEndpoint(infisicalPushSecretCRD.Spec.HostAPI)
	}

	if infisicalPushSecretCRD.Spec.TLS.CaRef.SecretName != "" {
		api.API_CA_CERTIFICATE, err = r.getInfisicalCaCertificateFromKubeSecret(ctx, infisicalPushSecretCRD)
		if err != nil {
			if requeueTime != 0 {
				logger.Error(err, fmt.Sprintf("unable to fetch CA certificate. Will requeue after [requeueTime=%v]", requeueTime))
				return ctrl.Result{
					RequeueAfter: requeueTime,
				}, nil
			} else {
				logger.Error(err, "unable to fetch CA certificate")
				return ctrl.Result{}, err
			}
		}

		logger.Info("Using custom CA certificate...")
	} else {
		api.API_CA_CERTIFICATE = ""
	}

	err = r.ReconcileInfisicalPushSecret(ctx, logger, infisicalPushSecretCRD)
	r.SetReconcileStatusCondition(ctx, &infisicalPushSecretCRD, err)

	if err != nil {
		if requeueTime != 0 {
			logger.Error(err, fmt.Sprintf("unable to reconcile Infisical Push Secret. Will requeue after [requeueTime=%v]", requeueTime))
			return ctrl.Result{
				RequeueAfter: requeueTime,
			}, nil
		} else {
			logger.Error(err, "unable to reconcile Infisical Push Secret")
			return ctrl.Result{}, err
		}
	}

	// Sync again after the specified time
	if requeueTime != 0 {
		logger.Info(fmt.Sprintf("Operator will requeue after [%v]", requeueTime))
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	} else {
		logger.Info("Operator will reconcile on next spec change")
		return ctrl.Result{}, nil
	}
}

func (r *InfisicalPushSecretReconciler) SetupWithManager(mgr ctrl.Manager) error {

	// Custom predicate that allows both spec changes and deletions
	specChangeOrDelete := predicate.Funcs{
		UpdateFunc: func(e event.UpdateEvent) bool {
			// Only reconcile if spec/generation changed

			isSpecOrGenerationChange := e.ObjectOld.GetGeneration() != e.ObjectNew.GetGeneration()

			if isSpecOrGenerationChange {
				if infisicalPushSecretResourceVariablesMap != nil {
					if rv, ok := infisicalPushSecretResourceVariablesMap[string(e.ObjectNew.GetUID())]; ok {
						rv.CancelCtx()
						delete(infisicalPushSecretResourceVariablesMap, string(e.ObjectNew.GetUID()))
					}
				}
			}

			return isSpecOrGenerationChange
		},
		DeleteFunc: func(e event.DeleteEvent) bool {
			// Always reconcile on deletion

			if infisicalPushSecretResourceVariablesMap != nil {
				if rv, ok := infisicalPushSecretResourceVariablesMap[string(e.Object.GetUID())]; ok {
					rv.CancelCtx()
					delete(infisicalPushSecretResourceVariablesMap, string(e.Object.GetUID()))
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

	controllerManager := ctrl.NewControllerManagedBy(mgr).
		For(&secretsv1alpha1.InfisicalPushSecret{}, builder.WithPredicates(
			specChangeOrDelete,
		)).
		Watches(
			&source.Kind{Type: &corev1.Secret{}},
			handler.EnqueueRequestsFromMapFunc(r.findPushSecretsForSecret),
		)

	if !r.IsNamespaceScoped {
		r.BaseLogger.Info("Watching ClusterGenerators for non-namespace scoped operator")
		controllerManager.Watches(
			&source.Kind{Type: &secretsv1alpha1.ClusterGenerator{}},
			handler.EnqueueRequestsFromMapFunc(r.findPushSecretsForClusterGenerator),
		)
	} else {
		r.BaseLogger.Info("Not watching ClusterGenerators for namespace scoped operator")
	}

	return controllerManager.Complete(r)
}

func (r *InfisicalPushSecretReconciler) findPushSecretsForClusterGenerator(o client.Object) []reconcile.Request {
	ctx := context.Background()
	pushSecrets := &secretsv1alpha1.InfisicalPushSecretList{}
	if err := r.List(ctx, pushSecrets); err != nil {
		return []reconcile.Request{}
	}

	clusterGenerator, ok := o.(*secretsv1alpha1.ClusterGenerator)
	if !ok {
		return []reconcile.Request{}
	}

	requests := []reconcile.Request{}

	for _, pushSecret := range pushSecrets.Items {
		if pushSecret.Spec.Push.Generators != nil {
			for _, generator := range pushSecret.Spec.Push.Generators {
				if generator.GeneratorRef.Name == clusterGenerator.GetName() {
					requests = append(requests, reconcile.Request{
						NamespacedName: types.NamespacedName{
							Name:      pushSecret.GetName(),
							Namespace: pushSecret.GetNamespace(),
						},
					})
					break
				}
			}
		}
	}
	return requests
}

func (r *InfisicalPushSecretReconciler) findPushSecretsForSecret(o client.Object) []reconcile.Request {
	ctx := context.Background()
	pushSecrets := &secretsv1alpha1.InfisicalPushSecretList{}
	if err := r.List(ctx, pushSecrets); err != nil {
		return []reconcile.Request{}
	}

	requests := []reconcile.Request{}
	for _, pushSecret := range pushSecrets.Items {
		if pushSecret.Spec.Push.Secret != nil &&
			pushSecret.Spec.Push.Secret.SecretName == o.GetName() &&
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
}
