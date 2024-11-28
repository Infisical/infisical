package controllers

import (
	"context"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"k8s.io/apimachinery/pkg/api/meta"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func (r *InfisicalPushSecretReconciler) SetSuccessfullyReconciledConditions(ctx context.Context, infisicalPushSecret *v1alpha1.InfisicalPushSecret, err error) error {

	if infisicalPushSecret.Status.Conditions == nil {
		infisicalPushSecret.Status.Conditions = []metav1.Condition{}
	}

	if err != nil {
		meta.SetStatusCondition(&infisicalPushSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/SuccessfullyReconciled",
			Status:  metav1.ConditionTrue,
			Reason:  "Error",
			Message: "Reconcile failed, secrets were not pushed to Infisical. Check operator logs for more info",
		})
	} else {
		meta.SetStatusCondition(&infisicalPushSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/SuccessfullyReconciled",
			Status:  metav1.ConditionFalse,
			Reason:  "OK",
			Message: "Reconcile succeeded, secrets were pushed to Infisical",
		})
	}

	return r.Client.Status().Update(ctx, infisicalPushSecret)

}

func (r *InfisicalPushSecretReconciler) SetFailedToReplaceSecretsConditions(ctx context.Context, infisicalPushSecret *v1alpha1.InfisicalPushSecret, failMessage string) error {
	if infisicalPushSecret.Status.Conditions == nil {
		infisicalPushSecret.Status.Conditions = []metav1.Condition{}
	}

	if failMessage != "" {
		meta.SetStatusCondition(&infisicalPushSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/FailedToReplaceSecrets",
			Status:  metav1.ConditionTrue,
			Reason:  "Error",
			Message: failMessage,
		})
	} else {
		meta.SetStatusCondition(&infisicalPushSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/FailedToReplaceSecrets",
			Status:  metav1.ConditionFalse,
			Reason:  "OK",
			Message: "No errors, no secrets failed to be replaced",
		})
	}

	return r.Client.Status().Update(ctx, infisicalPushSecret)
}

func (r *InfisicalPushSecretReconciler) SetFailedToCreateSecretsConditions(ctx context.Context, infisicalPushSecret *v1alpha1.InfisicalPushSecret, failMessage string) error {
	if infisicalPushSecret.Status.Conditions == nil {
		infisicalPushSecret.Status.Conditions = []metav1.Condition{}
	}

	if failMessage != "" {
		meta.SetStatusCondition(&infisicalPushSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/FailedToCreateSecrets",
			Status:  metav1.ConditionTrue,
			Reason:  "Error",
			Message: failMessage,
		})
	} else {
		meta.SetStatusCondition(&infisicalPushSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/FailedToCreateSecrets",
			Status:  metav1.ConditionFalse,
			Reason:  "OK",
			Message: "No errors, no secrets failed to be created",
		})
	}

	return r.Client.Status().Update(ctx, infisicalPushSecret)
}

func (r *InfisicalPushSecretReconciler) SetFailedToUpdateSecretsConditions(ctx context.Context, infisicalPushSecret *v1alpha1.InfisicalPushSecret, failMessage string) error {
	if infisicalPushSecret.Status.Conditions == nil {
		infisicalPushSecret.Status.Conditions = []metav1.Condition{}
	}

	if failMessage != "" {
		meta.SetStatusCondition(&infisicalPushSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/FailedToUpdateSecrets",
			Status:  metav1.ConditionTrue,
			Reason:  "Error",
			Message: failMessage,
		})
	} else {
		meta.SetStatusCondition(&infisicalPushSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/FailedToUpdateSecrets",
			Status:  metav1.ConditionFalse,
			Reason:  "OK",
			Message: "No errors, no secrets failed to be updated",
		})
	}

	return r.Client.Status().Update(ctx, infisicalPushSecret)
}

func (r *InfisicalPushSecretReconciler) SetFailedToDeleteSecretsConditions(ctx context.Context, infisicalPushSecret *v1alpha1.InfisicalPushSecret, failMessage string) error {
	if infisicalPushSecret.Status.Conditions == nil {
		infisicalPushSecret.Status.Conditions = []metav1.Condition{}
	}

	if failMessage != "" {
		meta.SetStatusCondition(&infisicalPushSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/FailedToDeleteSecrets",
			Status:  metav1.ConditionTrue,
			Reason:  "Error",
			Message: failMessage,
		})
	} else {
		meta.SetStatusCondition(&infisicalPushSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/FailedToDeleteSecrets",
			Status:  metav1.ConditionFalse,
			Reason:  "OK",
			Message: "No errors, no secrets failed to be deleted",
		})
	}

	return r.Client.Status().Update(ctx, infisicalPushSecret)
}

func (r *InfisicalPushSecretReconciler) SetAuthenticatedConditions(ctx context.Context, infisicalPushSecret *v1alpha1.InfisicalPushSecret, errorToConditionOn error) error {
	if infisicalPushSecret.Status.Conditions == nil {
		infisicalPushSecret.Status.Conditions = []metav1.Condition{}
	}

	if errorToConditionOn != nil {
		meta.SetStatusCondition(&infisicalPushSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/Authenticated",
			Status:  metav1.ConditionFalse,
			Reason:  "Error",
			Message: "Failed to authenticate with Infisical API. This can be caused by invalid service token or an invalid API host that is set. Check operator logs for more info",
		})
	} else {
		meta.SetStatusCondition(&infisicalPushSecret.Status.Conditions, metav1.Condition{
			Type:    "secrets.infisical.com/Authenticated",
			Status:  metav1.ConditionTrue,
			Reason:  "OK",
			Message: "Successfully authenticated with Infisical API",
		})
	}

	return r.Client.Status().Update(ctx, infisicalPushSecret)
}
