package controllerhelpers

import (
	"context"
	"fmt"

	"github.com/Infisical/infisical/k8-operator/packages/constants"
	corev1 "k8s.io/api/core/v1"
	k8Errors "k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

func GetInfisicalConfigMap(ctx context.Context, client client.Client) (configMap map[string]string, errToReturn error) {
	// default key values
	defaultConfigMapData := make(map[string]string)
	defaultConfigMapData["hostAPI"] = constants.INFISICAL_DOMAIN

	kubeConfigMap := &corev1.ConfigMap{}
	err := client.Get(ctx, types.NamespacedName{
		Namespace: constants.OPERATOR_SETTINGS_CONFIGMAP_NAMESPACE,
		Name:      constants.OPERATOR_SETTINGS_CONFIGMAP_NAME,
	}, kubeConfigMap)

	if err != nil {
		if k8Errors.IsNotFound(err) {
			kubeConfigMap = nil
		} else {
			return nil, fmt.Errorf("GetConfigMapByNamespacedName: unable to fetch config map in [namespacedName=%s] [err=%s]", constants.OPERATOR_SETTINGS_CONFIGMAP_NAMESPACE, err)
		}
	}

	if kubeConfigMap == nil {
		return defaultConfigMapData, nil
	} else {
		for key, value := range defaultConfigMapData {
			_, exists := kubeConfigMap.Data[key]
			if !exists {
				kubeConfigMap.Data[key] = value
			}
		}

		return kubeConfigMap.Data, nil
	}
}
