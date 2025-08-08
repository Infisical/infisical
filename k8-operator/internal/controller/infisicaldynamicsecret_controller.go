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
	"math/rand"
	"time"

	infisicaldynamicsecret "github.com/Infisical/infisical/k8-operator/internal/services/infisicaldynamicsecret"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/runtime"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/builder"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/controller/controllerutil"
	"sigs.k8s.io/controller-runtime/pkg/event"
	"sigs.k8s.io/controller-runtime/pkg/predicate"

	secretsv1alpha1 "github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/internal/constants"
	"github.com/Infisical/infisical/k8-operator/internal/controllerhelpers"
	"github.com/Infisical/infisical/k8-operator/internal/util"
	"github.com/go-logr/logr"
)

// InfisicalDynamicSecretReconciler reconciles a InfisicalDynamicSecret object
type InfisicalDynamicSecretReconciler struct {
	client.Client
	BaseLogger        logr.Logger
	Scheme            *runtime.Scheme
	Random            *rand.Rand
	Namespace         string
	IsNamespaceScoped bool
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
//+kubebuilder:rbac:groups="",resources=pods,verbs=get;list
//+kubebuilder:rbac:groups="authentication.k8s.io",resources=tokenreviews,verbs=create
//+kubebuilder:rbac:groups="",resources=serviceaccounts/token,verbs=create

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

			// Initialize the business logic handler
			handler := infisicaldynamicsecret.NewInfisicalDynamicSecretHandler(r.Client, r.Scheme, r.IsNamespaceScoped)

			err := handler.HandleLeaseRevocation(ctx, logger, &infisicalDynamicSecretCRD, infisicalDynamicSecretsResourceVariablesMap)

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
	infisicalConfig, err := controllerhelpers.GetInfisicalConfigMap(ctx, r.Client, r.IsNamespaceScoped)
	if err != nil {
		logger.Error(err, fmt.Sprintf("unable to fetch infisical-config. Will requeue after [requeueTime=%v]", requeueTime))
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	}

	// Initialize the business logic handler
	handler := infisicaldynamicsecret.NewInfisicalDynamicSecretHandler(r.Client, r.Scheme, r.IsNamespaceScoped)

	// Setup API configuration through business logic
	err = handler.SetupAPIConfig(infisicalDynamicSecretCRD, infisicalConfig)
	if err != nil {
		logger.Error(err, fmt.Sprintf("unable to setup API configuration. Will requeue after [requeueTime=%v]", requeueTime))
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	}

	// Handle CA certificate through business logic
	err = handler.HandleCACertificate(ctx, infisicalDynamicSecretCRD)
	if err != nil {
		logger.Error(err, fmt.Sprintf("unable to handle CA certificate. Will requeue after [requeueTime=%v]", requeueTime))
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	}

	nextReconcile, err := handler.ReconcileInfisicalDynamicSecret(ctx, logger, &infisicalDynamicSecretCRD, infisicalDynamicSecretsResourceVariablesMap)
	handler.SetReconcileConditionStatus(ctx, logger, &infisicalDynamicSecretCRD, err)

	if err == nil && nextReconcile.Seconds() >= 5 {
		requeueTime = nextReconcile
	}

	if err != nil {
		logger.Error(err, fmt.Sprintf("unable to reconcile Infisical Dynamic Secret. Will requeue after [requeueTime=%v]", requeueTime))
		return ctrl.Result{
			RequeueAfter: requeueTime,
		}, nil
	}

	numDeployments, err := controllerhelpers.ReconcileDeploymentsWithManagedSecrets(ctx, r.Client, logger, infisicalDynamicSecretCRD.Spec.ManagedSecretReference, r.IsNamespaceScoped)
	handler.SetReconcileAutoRedeploymentConditionStatus(ctx, logger, &infisicalDynamicSecretCRD, numDeployments, err)

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
