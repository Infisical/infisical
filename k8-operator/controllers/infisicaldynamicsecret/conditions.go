package controllers

import (
	"context"
	"fmt"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/go-logr/logr"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func (r *InfisicalDynamicSecretReconciler) SetReconcileAutoRedeploymentStatus(ctx context.Context, logger logr.Logger, infisicalDynamicSecret *v1alpha1.InfisicalDynamicSecret, numDeployments int, errorToConditionOn error) {
	if infisicalDynamicSecret.Status.Conditions == nil {
		infisicalDynamicSecret.Status.Conditions = []metav1.Condition{}
	}

	if errorToConditionOn == nil {
		meta.SetStatusCondition(&infisicalDynamicSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/AutoRedeployReady",
			Status:  metav1.ConditionTrue,
			Reason:  "OK",
			Message: fmt.Sprintf("Infisical has found %v deployments which are ready to be auto redeployed when dynamic secret lease changes", numDeployments),
		})
	} else {
		meta.SetStatusCondition(&infisicalDynamicSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/AutoRedeployReady",
			Status:  metav1.ConditionFalse,
			Reason:  "Error",
			Message: fmt.Sprintf("Failed reconcile deployments because: %v", errorToConditionOn),
		})
	}

	err := r.Client.Status().Update(ctx, infisicalDynamicSecret)
	if err != nil {
		logger.Error(err, "Could not set condition for AutoRedeployReady")
	}
}

func (r *InfisicalDynamicSecretReconciler) SetAuthenticatedStatus(ctx context.Context, logger logr.Logger, infisicalDynamicSecret *v1alpha1.InfisicalDynamicSecret, errorToConditionOn error) {
	if infisicalDynamicSecret.Status.Conditions == nil {
		infisicalDynamicSecret.Status.Conditions = []metav1.Condition{}
	}

	if errorToConditionOn == nil {
		meta.SetStatusCondition(&infisicalDynamicSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/Authenticated",
			Status:  metav1.ConditionTrue,
			Reason:  "OK",
			Message: "Infisical has successfully authenticated with the Infisical API",
		})
	} else {
		meta.SetStatusCondition(&infisicalDynamicSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/Authenticated",
			Status:  metav1.ConditionFalse,
			Reason:  "Error",
			Message: fmt.Sprintf("Failed to authenticate with Infisical API because: %v", errorToConditionOn),
		})
	}

	err := r.Client.Status().Update(ctx, infisicalDynamicSecret)
	if err != nil {
		logger.Error(err, "Could not set condition for Authenticated")
	}
}

func (r *InfisicalDynamicSecretReconciler) SetLeaseRenewalStatus(ctx context.Context, logger logr.Logger, infisicalDynamicSecret *v1alpha1.InfisicalDynamicSecret, errorToConditionOn error) {
	if infisicalDynamicSecret.Status.Conditions == nil {
		infisicalDynamicSecret.Status.Conditions = []metav1.Condition{}
	}

	if errorToConditionOn == nil {
		meta.SetStatusCondition(&infisicalDynamicSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/LeaseRenewal",
			Status:  metav1.ConditionTrue,
			Reason:  "OK",
			Message: "Infisical has successfully renewed the lease",
		})
	} else {
		meta.SetStatusCondition(&infisicalDynamicSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/LeaseRenewal",
			Status:  metav1.ConditionFalse,
			Reason:  "Error",
			Message: fmt.Sprintf("Failed to renew the lease because: %v", errorToConditionOn),
		})
	}

	err := r.Client.Status().Update(ctx, infisicalDynamicSecret)
	if err != nil {
		logger.Error(err, "Could not set condition for LeaseRenewal")
	}
}

func (r *InfisicalDynamicSecretReconciler) SetCreatedLeaseStatus(ctx context.Context, logger logr.Logger, infisicalDynamicSecret *v1alpha1.InfisicalDynamicSecret, errorToConditionOn error) {
	if infisicalDynamicSecret.Status.Conditions == nil {
		infisicalDynamicSecret.Status.Conditions = []metav1.Condition{}
	}

	if errorToConditionOn == nil {
		meta.SetStatusCondition(&infisicalDynamicSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/LeaseCreated",
			Status:  metav1.ConditionTrue,
			Reason:  "OK",
			Message: "Infisical has successfully created the lease",
		})
	} else {
		meta.SetStatusCondition(&infisicalDynamicSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/LeaseCreated",
			Status:  metav1.ConditionFalse,
			Reason:  "Error",
			Message: fmt.Sprintf("Failed to create the lease because: %v", errorToConditionOn),
		})
	}

	err := r.Client.Status().Update(ctx, infisicalDynamicSecret)
	if err != nil {
		logger.Error(err, "Could not set condition for LeaseCreated")
	}
}

func (r *InfisicalDynamicSecretReconciler) SetReconcileStatus(ctx context.Context, logger logr.Logger, infisicalDynamicSecret *v1alpha1.InfisicalDynamicSecret, errorToConditionOn error) {
	if infisicalDynamicSecret.Status.Conditions == nil {
		infisicalDynamicSecret.Status.Conditions = []metav1.Condition{}
	}

	if errorToConditionOn == nil {
		meta.SetStatusCondition(&infisicalDynamicSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/Reconcile",
			Status:  metav1.ConditionTrue,
			Reason:  "OK",
			Message: "Infisical has successfully reconciled the InfisicalDynamicSecret",
		})
	} else {
		meta.SetStatusCondition(&infisicalDynamicSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/Reconcile",
			Status:  metav1.ConditionFalse,
			Reason:  "Error",
			Message: fmt.Sprintf("Failed to reconcile the InfisicalDynamicSecret because: %v", errorToConditionOn),
		})
	}

	err := r.Client.Status().Update(ctx, infisicalDynamicSecret)
	if err != nil {
		logger.Error(err, "Could not set condition for Reconcile")
	}
}
