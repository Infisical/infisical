package controllers

import (
	"context"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/builder"
	"sigs.k8s.io/controller-runtime/pkg/client"
	controllerUtil "sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/event"
	"sigs.k8s.io/controller-runtime/pkg/handler"
	"sigs.k8s.io/controller-runtime/pkg/predicate"
	"sigs.k8s.io/controller-runtime/pkg/source"

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

// Maps the infisicalSecretCR.UID to a infisicalSdk.InfisicalClientInterface and AuthenticationDetails.
var resourceVariablesMap = make(map[string]ResourceVariables)

const FINALIZER_NAME = "secrets.finalizers.infisical.com"

func (r *InfisicalSecretReconciler) addFinalizer(ctx context.Context, infisicalSecret *secretsv1alpha1.InfisicalSecret) error {
	if !controllerUtil.ContainsFinalizer(infisicalSecret, FINALIZER_NAME) {
		controllerUtil.AddFinalizer(infisicalSecret, FINALIZER_NAME)
		if err := r.Update(ctx, infisicalSecret); err != nil {
			return err
		}
	}
	return nil
}

func (r *InfisicalSecretReconciler) handleFinalizer(ctx context.Context, infisicalSecret *secretsv1alpha1.InfisicalSecret) error {
	if controllerUtil.ContainsFinalizer(infisicalSecret, FINALIZER_NAME) {
		// Cleanup deployment variables
		delete(resourceVariablesMap, string(infisicalSecret.UID))

		// Remove the finalizer and update the resource
		controllerUtil.RemoveFinalizer(infisicalSecret, FINALIZER_NAME)
		if err := r.Update(ctx, infisicalSecret); err != nil {
			return err
		}
	}
	return nil
}

func (r *InfisicalSecretReconciler) handleManagedSecretDeletion(secret client.Object) []ctrl.Request {
	var requests []ctrl.Request
	infisicalSecrets := &secretsv1alpha1.InfisicalSecretList{}
	err := r.List(context.Background(), infisicalSecrets)
	if err != nil {
		fmt.Printf("unable to list Infisical Secrets from cluster because [err=%v]", err)
		return requests
	}

	for _, infisicalSecret := range infisicalSecrets.Items {
		if secret.GetName() == infisicalSecret.Spec.ManagedSecretReference.SecretName &&
			secret.GetNamespace() == infisicalSecret.Spec.ManagedSecretReference.SecretNamespace {
			requests = append(requests, ctrl.Request{
				NamespacedName: client.ObjectKey{
					Namespace: infisicalSecret.Namespace,
					Name:      infisicalSecret.Name,
				},
			})
			fmt.Printf("\nManaged secret deleted in resource %s: [name=%v] [namespace=%v]\n", infisicalSecret.Name, secret.GetName(), secret.GetNamespace())
		}
	}

	return requests
}

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

	if infisicalSecretCR.Spec.ResyncInterval != 0 {
		requeueTime = time.Second * time.Duration(infisicalSecretCR.Spec.ResyncInterval)
		fmt.Printf("\nManual re-sync interval set. Interval: %v\n", requeueTime)
	} else {
		fmt.Printf("\nRe-sync interval set. Interval: %v\n", requeueTime)
	}

	// Add the finalizer if it does not exist, and only add it if the resource is not marked for deletion
	if infisicalSecretCR.GetDeletionTimestamp() == nil || infisicalSecretCR.GetDeletionTimestamp().IsZero() {
		if err := r.addFinalizer(ctx, &infisicalSecretCR); err != nil {
			return ctrl.Result{}, err
		}
	}

	// Check if the resource is already marked for deletion
	if infisicalSecretCR.GetDeletionTimestamp() != nil {
		// Handle the finalizer logic
		if err := r.handleFinalizer(ctx, &infisicalSecretCR); err != nil {
			return ctrl.Result{}, err
		}

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
		For(&secretsv1alpha1.InfisicalSecret{}).
		Watches(
			&source.Kind{Type: &corev1.Secret{}},
			handler.EnqueueRequestsFromMapFunc(r.handleManagedSecretDeletion),
			builder.WithPredicates(predicate.Funcs{
				// Always return true to ensure we process all delete events
				DeleteFunc: func(e event.DeleteEvent) bool {
					return true
				},
			}),
		).
		Complete(r)
}
