package controllers

import (
	"context"
	"fmt"
	"time"

	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"

	secretsv1alpha1 "github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/api"
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
//+kubebuilder:rbac:groups="",resources=configmaps,verbs=get;list;watch;create;update;delete
//+kubebuilder:rbac:groups=apps,resources=deployments,verbs=list;watch;get;update

// Reconcile is part of the main kubernetes reconciliation loop which aims to
// move the current state of the cluster closer to the desired state.
// For more details, check Reconcile and its Result here:
// - https://pkg.go.dev/sigs.k8s.io/controller-runtime@v0.13.1/pkg/reconcile

func (r *InfisicalSecretReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	var infisicalSecretCR secretsv1alpha1.InfisicalSecret
	requeueTime := time.Minute // seconds

	err := r.Get(ctx, req.NamespacedName, &infisicalSecretCR)
	if err != nil {
		if errors.IsNotFound(err) {
			fmt.Printf("Infisical Secret CRD not found [err=%v]", err)
			return ctrl.Result{
				Requeue: false,
			}, nil
		} else {
			fmt.Printf("Unable to fetch Infisical Secret CRD from cluster because [err=%v]", err)
			return ctrl.Result{
				RequeueAfter: requeueTime,
			}, nil
		}
	}

	if infisicalSecretCR.Spec.ResyncInterval != 0 {
		requeueTime = time.Second * time.Duration(infisicalSecretCR.Spec.ResyncInterval)
		fmt.Printf("\nManual re-sync interval set. Interval: %v\n", requeueTime)
	} else {
		fmt.Printf("\nRe-sync interval set. Interval: %v\n", requeueTime)
	}

	// Check if the resource is already marked for deletion
	if infisicalSecretCR.GetDeletionTimestamp() != nil {
		return ctrl.Result{
			Requeue: false,
		}, nil
	}

	// Get modified/default config
	infisicalConfig, err := r.GetInfisicalConfigMap(ctx)
	if err != nil {
		fmt.Printf("unable to fetch infisical-config [err=%s]. Will requeue after [requeueTime=%v]\n", err, requeueTime)
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	}

	if infisicalSecretCR.Spec.HostAPI == "" {
		api.API_HOST_URL = infisicalConfig["hostAPI"]
	} else {
		api.API_HOST_URL = infisicalSecretCR.Spec.HostAPI
	}

	err = r.ReconcileInfisicalSecret(ctx, infisicalSecretCR)
	r.SetReadyToSyncSecretsConditions(ctx, &infisicalSecretCR, err)

	if err != nil {
		fmt.Printf("unable to reconcile Infisical Secret because [err=%v]. Will requeue after [requeueTime=%v]\n", err, requeueTime)
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	}

	numDeployments, err := r.ReconcileDeploymentsWithManagedSecrets(ctx, infisicalSecretCR)
	r.SetInfisicalAutoRedeploymentReady(ctx, &infisicalSecretCR, numDeployments, err)
	if err != nil {
		fmt.Printf("unable to reconcile auto redeployment because [err=%v]", err)
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	}

	// Sync again after the specified time
	fmt.Printf("Operator will requeue after [%v] \n", requeueTime)
	return ctrl.Result{
		RequeueAfter: requeueTime,
	}, nil
}

// SetupWithManager sets up the controller with the Manager.
func (r *InfisicalSecretReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&secretsv1alpha1.InfisicalSecret{}).
		Complete(r)
}
