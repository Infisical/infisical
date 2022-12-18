package controllers

import (
	"context"
	"time"

	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/log"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	secretsv1alpha1 "github.com/Infisical/infisical/k8-operator/api/v1alpha1"
)

// InfisicalSecretReconciler reconciles a InfisicalSecret object
type InfisicalSecretReconciler struct {
	client.Client
	Scheme *runtime.Scheme
}

//+kubebuilder:rbac:groups=secrets.infisical.com,resources=infisicalsecrets,verbs=get;list;watch;create;update;patch;delete
//+kubebuilder:rbac:groups=secrets.infisical.com,resources=infisicalsecrets/status,verbs=get;update;patch
//+kubebuilder:rbac:groups=secrets.infisical.com,resources=infisicalsecrets/finalizers,verbs=update
//+kubebuilder:rbac:groups="",resources=secrets,verbs=get;list;watch;create;update;delete
//+kubebuilder:rbac:groups=apps,resources=deployments,verbs=list;watch;get;update

// Reconcile is part of the main kubernetes reconciliation loop which aims to
// move the current state of the cluster closer to the desired state.
// For more details, check Reconcile and its Result here:
// - https://pkg.go.dev/sigs.k8s.io/controller-runtime@v0.13.1/pkg/reconcile
func (r *InfisicalSecretReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	log := log.FromContext(ctx)

	var infisicalSecretCR v1alpha1.InfisicalSecret
	err := r.Get(ctx, req.NamespacedName, &infisicalSecretCR)

	if err != nil {
		if errors.IsNotFound(err) {
			log.Info("Infisical Secret not found")
			return ctrl.Result{}, nil
		} else {
			log.Error(err, "Unable to fetch Infisical Secret from cluster. Will retry")
			return ctrl.Result{
				RequeueAfter: time.Minute,
			}, nil
		}
	}

	// Check if the resource is already marked for deletion
	if infisicalSecretCR.GetDeletionTimestamp() != nil {
		return ctrl.Result{}, nil
	}

	err = r.ReconcileInfisicalSecret(ctx, infisicalSecretCR)
	r.SetReadyToSyncSecretsConditions(ctx, &infisicalSecretCR, err)
	if err != nil {
		log.Error(err, "Unable to reconcile Infisical Secret and will try again")
		return ctrl.Result{
			RequeueAfter: time.Minute,
		}, nil
	}

	// Sync again after the specified time
	return ctrl.Result{
		RequeueAfter: time.Minute,
	}, nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *InfisicalSecretReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&secretsv1alpha1.InfisicalSecret{}). // TODO we should also be watching secrets with the name specifed
		Complete(r)
}
