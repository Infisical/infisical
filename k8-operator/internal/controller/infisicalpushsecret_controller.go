/*
Copyright 2025.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

package controller

import (
	"context"
	"fmt"
	"time"

	infisicalpushsecret "github.com/Infisical/infisical/k8-operator/internal/services/infisicalpushsecret"
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

	secretsv1alpha1 "github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/internal/constants"
	"github.com/Infisical/infisical/k8-operator/internal/controllerhelpers"
	"github.com/Infisical/infisical/k8-operator/internal/util"
	"github.com/go-logr/logr"
)

// InfisicalPushSecretReconciler reconciles a InfisicalPushSecretSecret object
type InfisicalPushSecretReconciler struct {
	client.Client
	BaseLogger        logr.Logger
	Scheme            *runtime.Scheme
	IsNamespaceScoped bool
	Namespace         string
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

func (r *InfisicalPushSecretReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {

	logger := r.GetLogger(req)

	var infisicalPushSecretCRD secretsv1alpha1.InfisicalPushSecret
	requeueTime := time.Minute // seconds

	err := r.Get(ctx, req.NamespacedName, &infisicalPushSecretCRD)
	if err != nil {
		if errors.IsNotFound(err) {
			logger.Info("Infisical Push Secret CRD not found")
			// Initialize the business logic handler
			handler := infisicalpushsecret.NewInfisicalPushSecretHandler(r.Client, r.Scheme, r.IsNamespaceScoped)
			handler.DeleteManagedSecrets(ctx, logger, &infisicalPushSecretCRD, infisicalPushSecretResourceVariablesMap)

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

			// Initialize the business logic handler
			handler := infisicalpushsecret.NewInfisicalPushSecretHandler(r.Client, r.Scheme, r.IsNamespaceScoped)

			if err := handler.DeleteManagedSecrets(ctx, logger, &infisicalPushSecretCRD, infisicalPushSecretResourceVariablesMap); err != nil {
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
	infisicalConfig, err := controllerhelpers.GetInfisicalConfigMap(ctx, r.Client, r.IsNamespaceScoped)
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

	// Initialize the business logic handler
	handler := infisicalpushsecret.NewInfisicalPushSecretHandler(r.Client, r.Scheme, r.IsNamespaceScoped)

	// Setup API configuration through business logic
	err = handler.SetupAPIConfig(infisicalPushSecretCRD, infisicalConfig)
	if err != nil {
		if requeueTime != 0 {
			logger.Error(err, fmt.Sprintf("unable to setup API configuration. Will requeue after [requeueTime=%v]", requeueTime))
			return ctrl.Result{
				RequeueAfter: requeueTime,
			}, nil
		} else {
			logger.Error(err, "unable to setup API configuration")
			return ctrl.Result{}, err
		}
	}

	// Handle CA certificate through business logic
	err = handler.HandleCACertificate(ctx, infisicalPushSecretCRD)
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

	err = handler.ReconcileInfisicalPushSecret(ctx, logger, &infisicalPushSecretCRD, infisicalPushSecretResourceVariablesMap)
	handler.SetReconcileStatusCondition(ctx, &infisicalPushSecretCRD, err)

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
			&corev1.Secret{},
			handler.EnqueueRequestsFromMapFunc(r.findPushSecretsForSecret),
		)

	if !r.IsNamespaceScoped {
		r.BaseLogger.Info("Watching ClusterGenerators for non-namespace scoped operator")
		controllerManager.Watches(
			&secretsv1alpha1.ClusterGenerator{},
			handler.EnqueueRequestsFromMapFunc(r.findPushSecretsForClusterGenerator),
		)
	} else {
		r.BaseLogger.Info("Not watching ClusterGenerators for namespace scoped operator")
	}

	return controllerManager.Complete(r)
}

func (r *InfisicalPushSecretReconciler) findPushSecretsForClusterGenerator(ctx context.Context, o client.Object) []reconcile.Request {
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

func (r *InfisicalPushSecretReconciler) findPushSecretsForSecret(ctx context.Context, o client.Object) []reconcile.Request {
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
