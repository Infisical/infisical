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
	infisicalSdk "github.com/infisical/go-sdk"
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
//+kubebuilder:rbac:groups="",resources=serviceaccounts,verbs=get;list;watch

// Reconcile is part of the main kubernetes reconciliation loop which aims to
// move the current state of the cluster closer to the desired state.
// For more details, check Reconcile and its Result here:
// - https://pkg.go.dev/sigs.k8s.io/controller-runtime@v0.13.1/pkg/reconcile

type ResourceVariables struct {
	infisicalClient infisicalSdk.InfisicalClientInterface
	authDetails     AuthenticationDetails
}

const FINALIZER_NAME = "secrets.finalizers.infisical.com"

// Maps the infisicalSecretCR.UID to a infisicalSdk.InfisicalClientInterface and AuthenticationDetails.
var resourceVariablesMap = make(map[string]ResourceVariables)

func (r *InfisicalSecretReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
	var infisicalSecretCR secretsv1alpha1.InfisicalSecret
	requeueTime := time.Minute // seconds

	err := r.Get(ctx, req.NamespacedName, &infisicalSecretCR)
	if err != nil {
		if errors.IsNotFound(err) {
			return ctrl.Result{
				Requeue: false,
			}, nil
		} else {
			fmt.Printf("\nUnable to fetch Infisical Secret CRD from cluster because [err=%v]", err)
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
			fmt.Printf("Error removing finalizers from Infisical Secret %s: %v\n", infisicalSecretCR.Name, err)
			return ctrl.Result{}, err
		}
		// Our finalizers have been removed, so the reconciler can do nothing.
		return ctrl.Result{}, nil
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

func (r *InfisicalSecretReconciler) SetupWithManager(mgr ctrl.Manager) error {
	return ctrl.NewControllerManagedBy(mgr).
		For(&secretsv1alpha1.InfisicalSecret{}, builder.WithPredicates(predicate.Funcs{
			UpdateFunc: func(e event.UpdateEvent) bool {
				delete(resourceVariablesMap, string(e.ObjectNew.GetUID()))
				return true
			},
			DeleteFunc: func(e event.DeleteEvent) bool {
				delete(resourceVariablesMap, string(e.Object.GetUID()))
				return true
			},
		})).
		Complete(r)
}
