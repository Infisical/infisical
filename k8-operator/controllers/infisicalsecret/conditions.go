package controllers

import (
	"context"
	"fmt"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/util"
	"github.com/go-logr/logr"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func (r *InfisicalSecretReconciler) SetReadyToSyncSecretsConditions(ctx context.Context, logger logr.Logger, infisicalSecret *v1alpha1.InfisicalSecret, secretsCount int, errorToConditionOn error) {
	if infisicalSecret.Status.Conditions == nil {
		infisicalSecret.Status.Conditions = []metav1.Condition{}
	}

	if errorToConditionOn != nil {
		meta.SetStatusCondition(&infisicalSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/ReadyToSyncSecrets",
			Status:  metav1.ConditionFalse,
			Reason:  "Error",
			Message: fmt.Sprintf("Failed to sync secrets. This can be caused by invalid access token or an invalid API host that is set. Error: %v", errorToConditionOn),
		})

		meta.SetStatusCondition(&infisicalSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/AutoRedeployReady",
			Status:  metav1.ConditionFalse,
			Reason:  "Stopped",
			Message: fmt.Sprintf("Auto redeployment has been stopped because the operator failed to sync secrets. Error: %v", errorToConditionOn),
		})
	} else {
		meta.SetStatusCondition(&infisicalSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/ReadyToSyncSecrets",
			Status:  metav1.ConditionTrue,
			Reason:  "OK",
			Message: fmt.Sprintf("Infisical controller has started syncing your secrets. Last reconcile synced %d secrets", secretsCount),
		})
	}

	err := r.Client.Status().Update(ctx, infisicalSecret)
	if err != nil {
		logger.Error(err, "Could not set condition for ReadyToSyncSecrets")
	}
}

func (r *InfisicalSecretReconciler) SetInfisicalTokenLoadCondition(ctx context.Context, logger logr.Logger, infisicalSecret *v1alpha1.InfisicalSecret, authStrategy util.AuthStrategyType, errorToConditionOn error) {
	if infisicalSecret.Status.Conditions == nil {
		infisicalSecret.Status.Conditions = []metav1.Condition{}
	}

	if errorToConditionOn == nil {
		meta.SetStatusCondition(&infisicalSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/LoadedInfisicalToken",
			Status:  metav1.ConditionTrue,
			Reason:  "OK",
			Message: fmt.Sprintf("Infisical controller has loaded the Infisical token in provided Kubernetes secret, using %v authentication strategy", authStrategy),
		})
	} else {
		meta.SetStatusCondition(&infisicalSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/LoadedInfisicalToken",
			Status:  metav1.ConditionFalse,
			Reason:  "Error",
			Message: fmt.Sprintf("Failed to load Infisical Token from the provided Kubernetes secret because: %v", errorToConditionOn),
		})
	}

	err := r.Client.Status().Update(ctx, infisicalSecret)
	if err != nil {
		logger.Error(err, "Could not set condition for LoadedInfisicalToken")
	}
}

func (r *InfisicalSecretReconciler) SetInfisicalAutoRedeploymentReady(ctx context.Context, logger logr.Logger, infisicalSecret *v1alpha1.InfisicalSecret, numDeployments int, errorToConditionOn error) {
	if infisicalSecret.Status.Conditions == nil {
		infisicalSecret.Status.Conditions = []metav1.Condition{}
	}

	if errorToConditionOn == nil {
		meta.SetStatusCondition(&infisicalSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/AutoRedeployReady",
			Status:  metav1.ConditionTrue,
			Reason:  "OK",
			Message: fmt.Sprintf("Infisical has found %v deployments which are ready to be auto redeployed when secrets change", numDeployments),
		})
	} else {
		meta.SetStatusCondition(&infisicalSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/AutoRedeployReady",
			Status:  metav1.ConditionFalse,
			Reason:  "Error",
			Message: fmt.Sprintf("Failed reconcile deployments because: %v", errorToConditionOn),
		})
	}

	err := r.Client.Status().Update(ctx, infisicalSecret)
	if err != nil {
		logger.Error(err, "Could not set condition for AutoRedeployReady")
	}
}
