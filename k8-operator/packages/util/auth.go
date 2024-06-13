package util

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

func GetServiceAccountToken(k8sClient client.Client, namespace string, serviceAccountName string) (string, error) {

	serviceAccount := &corev1.ServiceAccount{}
	err := k8sClient.Get(context.TODO(), client.ObjectKey{Name: serviceAccountName, Namespace: namespace}, serviceAccount)
	if err != nil {
		return "", err
	}

	if len(serviceAccount.Secrets) == 0 {
		return "", fmt.Errorf("no secrets found for service account %s", serviceAccountName)
	}

	secretName := serviceAccount.Secrets[0].Name

	secret := &corev1.Secret{}
	err = k8sClient.Get(context.TODO(), client.ObjectKey{Name: secretName, Namespace: namespace}, secret)
	if err != nil {
		return "", err
	}

	token := secret.Data["token"]

	return string(token), nil
}
