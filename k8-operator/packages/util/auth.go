package util

import (
	"context"
	"fmt"

	corev1 "k8s.io/api/core/v1"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

func GetServiceAccountToken(k8sClient client.Client, namespace string, serviceAccountName string) (string, error) {
	if namespace == "" {
		namespace = "default"
	}

	sa := &corev1.ServiceAccount{}
	err := k8sClient.Get(context.TODO(), client.ObjectKey{Name: serviceAccountName, Namespace: namespace}, sa)
	if err != nil {
		return "", err
	}

	if len(sa.Secrets) == 0 {
		return "", fmt.Errorf("no secrets found for service account %s", serviceAccountName)
	}

	secretName := sa.Secrets[0].Name

	secret := &corev1.Secret{}
	err = k8sClient.Get(context.TODO(), client.ObjectKey{Name: secretName, Namespace: namespace}, secret)
	if err != nil {
		return "", err
	}

	token := secret.Data["token"]

	return string(token), nil
}
