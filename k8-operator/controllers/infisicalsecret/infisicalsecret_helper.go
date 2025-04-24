package controllers

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"strings"
	tpl "text/template"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/api"
	"github.com/Infisical/infisical/k8-operator/packages/constants"
	"github.com/Infisical/infisical/k8-operator/packages/crypto"
	"github.com/Infisical/infisical/k8-operator/packages/model"
	"github.com/Infisical/infisical/k8-operator/packages/template"
	"github.com/Infisical/infisical/k8-operator/packages/util"
	"github.com/go-logr/logr"

	"k8s.io/apimachinery/pkg/types"

	infisicalSdk "github.com/infisical/go-sdk"
	corev1 "k8s.io/api/core/v1"
	k8Errors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	ctrl "sigs.k8s.io/controller-runtime"
	"sigs.k8s.io/controller-runtime/pkg/client"
)

func (r *InfisicalSecretReconciler) handleAuthentication(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret, infisicalClient infisicalSdk.InfisicalClientInterface) (util.AuthenticationDetails, error) {

	// ? Legacy support, service token auth
	infisicalToken, err := r.getInfisicalTokenFromKubeSecret(ctx, infisicalSecret)
	if err != nil {
		return util.AuthenticationDetails{}, fmt.Errorf("ReconcileInfisicalSecret: unable to get service token from kube secret [err=%s]", err)
	}
	if infisicalToken != "" {
		infisicalClient.Auth().SetAccessToken(infisicalToken)
		return util.AuthenticationDetails{AuthStrategy: util.AuthStrategy.SERVICE_TOKEN}, nil
	}

	// ? Legacy support, service account auth
	serviceAccountCreds, err := r.getInfisicalServiceAccountCredentialsFromKubeSecret(ctx, infisicalSecret)
	if err != nil {
		return util.AuthenticationDetails{}, fmt.Errorf("ReconcileInfisicalSecret: unable to get service account creds from kube secret [err=%s]", err)
	}

	if serviceAccountCreds.AccessKey != "" || serviceAccountCreds.PrivateKey != "" || serviceAccountCreds.PublicKey != "" {
		infisicalClient.Auth().SetAccessToken(serviceAccountCreds.AccessKey)
		return util.AuthenticationDetails{AuthStrategy: util.AuthStrategy.SERVICE_ACCOUNT}, nil
	}

	authStrategies := map[util.AuthStrategyType]func(ctx context.Context, reconcilerClient client.Client, secretCrd util.SecretAuthInput, infisicalClient infisicalSdk.InfisicalClientInterface) (util.AuthenticationDetails, error){
		util.AuthStrategy.UNIVERSAL_MACHINE_IDENTITY:    util.HandleUniversalAuth,
		util.AuthStrategy.KUBERNETES_MACHINE_IDENTITY:   util.HandleKubernetesAuth,
		util.AuthStrategy.AWS_IAM_MACHINE_IDENTITY:      util.HandleAwsIamAuth,
		util.AuthStrategy.AZURE_MACHINE_IDENTITY:        util.HandleAzureAuth,
		util.AuthStrategy.GCP_ID_TOKEN_MACHINE_IDENTITY: util.HandleGcpIdTokenAuth,
		util.AuthStrategy.GCP_IAM_MACHINE_IDENTITY:      util.HandleGcpIamAuth,
	}

	for authStrategy, authHandler := range authStrategies {
		authDetails, err := authHandler(ctx, r.Client, util.SecretAuthInput{
			Secret: infisicalSecret,
			Type:   util.SecretCrd.INFISICAL_SECRET,
		}, infisicalClient)

		if err == nil {
			return authDetails, nil
		}

		if !errors.Is(err, util.ErrAuthNotApplicable) {
			return util.AuthenticationDetails{}, fmt.Errorf("authentication failed for strategy [%s] [err=%w]", authStrategy, err)
		}
	}

	return util.AuthenticationDetails{}, fmt.Errorf("no authentication method provided")

}

func (r *InfisicalSecretReconciler) getInfisicalTokenFromKubeSecret(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret) (string, error) {
	// default to new secret ref structure
	secretName := infisicalSecret.Spec.Authentication.ServiceToken.ServiceTokenSecretReference.SecretName
	secretNamespace := infisicalSecret.Spec.Authentication.ServiceToken.ServiceTokenSecretReference.SecretNamespace
	// fall back to previous secret ref
	if secretName == "" {
		secretName = infisicalSecret.Spec.TokenSecretReference.SecretName
	}

	if secretNamespace == "" {
		secretNamespace = infisicalSecret.Spec.TokenSecretReference.SecretNamespace
	}

	tokenSecret, err := util.GetKubeSecretByNamespacedName(ctx, r.Client, types.NamespacedName{
		Namespace: secretNamespace,
		Name:      secretName,
	})

	if k8Errors.IsNotFound(err) {
		return "", nil
	}

	if err != nil {
		return "", fmt.Errorf("failed to read Infisical token secret from secret named [%s] in namespace [%s]: with error [%w]", infisicalSecret.Spec.TokenSecretReference.SecretName, infisicalSecret.Spec.TokenSecretReference.SecretNamespace, err)
	}

	infisicalServiceToken := tokenSecret.Data[constants.INFISICAL_TOKEN_SECRET_KEY_NAME]

	return strings.Replace(string(infisicalServiceToken), " ", "", -1), nil
}

func (r *InfisicalSecretReconciler) getInfisicalCaCertificateFromKubeSecret(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret) (caCertificate string, err error) {

	caCertificateFromKubeSecret, err := util.GetKubeSecretByNamespacedName(ctx, r.Client, types.NamespacedName{
		Namespace: infisicalSecret.Spec.TLS.CaRef.SecretNamespace,
		Name:      infisicalSecret.Spec.TLS.CaRef.SecretName,
	})

	if k8Errors.IsNotFound(err) {
		return "", fmt.Errorf("kubernetes secret containing custom CA certificate cannot be found. [err=%s]", err)
	}

	if err != nil {
		return "", fmt.Errorf("something went wrong when fetching your CA certificate [err=%s]", err)
	}

	caCertificateFromSecret := string(caCertificateFromKubeSecret.Data[infisicalSecret.Spec.TLS.CaRef.SecretKey])

	return caCertificateFromSecret, nil
}

// Fetches service account credentials from a Kubernetes secret specified in the infisicalSecret object, extracts the access key, public key, and private key from the secret, and returns them as a ServiceAccountCredentials object.
// If any keys are missing or an error occurs, returns an empty object or an error object, respectively.
func (r *InfisicalSecretReconciler) getInfisicalServiceAccountCredentialsFromKubeSecret(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret) (serviceAccountDetails model.ServiceAccountDetails, err error) {
	serviceAccountCredsFromKubeSecret, err := util.GetKubeSecretByNamespacedName(ctx, r.Client, types.NamespacedName{
		Namespace: infisicalSecret.Spec.Authentication.ServiceAccount.ServiceAccountSecretReference.SecretNamespace,
		Name:      infisicalSecret.Spec.Authentication.ServiceAccount.ServiceAccountSecretReference.SecretName,
	})

	if k8Errors.IsNotFound(err) {
		return model.ServiceAccountDetails{}, nil
	}

	if err != nil {
		return model.ServiceAccountDetails{}, fmt.Errorf("something went wrong when fetching your service account credentials [err=%s]", err)
	}

	accessKeyFromSecret := serviceAccountCredsFromKubeSecret.Data[constants.SERVICE_ACCOUNT_ACCESS_KEY]
	publicKeyFromSecret := serviceAccountCredsFromKubeSecret.Data[constants.SERVICE_ACCOUNT_PUBLIC_KEY]
	privateKeyFromSecret := serviceAccountCredsFromKubeSecret.Data[constants.SERVICE_ACCOUNT_PRIVATE_KEY]

	if accessKeyFromSecret == nil || publicKeyFromSecret == nil || privateKeyFromSecret == nil {
		return model.ServiceAccountDetails{}, nil
	}

	return model.ServiceAccountDetails{AccessKey: string(accessKeyFromSecret), PrivateKey: string(privateKeyFromSecret), PublicKey: string(publicKeyFromSecret)}, nil
}

func convertBinaryToStringMap(binaryMap map[string][]byte) map[string]string {
	stringMap := make(map[string]string)
	for k, v := range binaryMap {
		stringMap[k] = string(v)
	}
	return stringMap
}

func (r *InfisicalSecretReconciler) createInfisicalManagedKubeResource(ctx context.Context, logger logr.Logger, infisicalSecret v1alpha1.InfisicalSecret, managedSecretReferenceInterface interface{}, secretsFromAPI []model.SingleEnvironmentVariable, ETag string, resourceType constants.ManagedKubeResourceType) error {
	plainProcessedSecrets := make(map[string][]byte)

	var managedTemplateData *v1alpha1.SecretTemplate

	if resourceType == constants.MANAGED_KUBE_RESOURCE_TYPE_SECRET {
		managedTemplateData = managedSecretReferenceInterface.(v1alpha1.ManagedKubeSecretConfig).Template
	} else if resourceType == constants.MANAGED_KUBE_RESOURCE_TYPE_CONFIG_MAP {
		managedTemplateData = managedSecretReferenceInterface.(v1alpha1.ManagedKubeConfigMapConfig).Template
	}

	if managedTemplateData == nil || managedTemplateData.IncludeAllSecrets {
		for _, secret := range secretsFromAPI {
			plainProcessedSecrets[secret.Key] = []byte(secret.Value) // plain process
		}
	}

	if managedTemplateData != nil {
		secretKeyValue := make(map[string]model.SecretTemplateOptions)
		for _, secret := range secretsFromAPI {
			secretKeyValue[secret.Key] = model.SecretTemplateOptions{
				Value:      secret.Value,
				SecretPath: secret.SecretPath,
			}
		}

		for templateKey, userTemplate := range managedTemplateData.Data {
			tmpl, err := tpl.New("secret-templates").Funcs(template.GetTemplateFunctions()).Parse(userTemplate)
			if err != nil {
				return fmt.Errorf("unable to compile template: %s [err=%v]", templateKey, err)
			}

			buf := bytes.NewBuffer(nil)
			err = tmpl.Execute(buf, secretKeyValue)
			if err != nil {
				return fmt.Errorf("unable to execute template: %s [err=%v]", templateKey, err)
			}
			plainProcessedSecrets[templateKey] = buf.Bytes()
		}
	}

	// copy labels and annotations from InfisicalSecret CRD
	labels := map[string]string{}
	for k, v := range infisicalSecret.Labels {
		labels[k] = v
	}

	annotations := map[string]string{}
	systemPrefixes := []string{"kubectl.kubernetes.io/", "kubernetes.io/", "k8s.io/", "helm.sh/"}
	for k, v := range infisicalSecret.Annotations {
		isSystem := false
		for _, prefix := range systemPrefixes {
			if strings.HasPrefix(k, prefix) {
				isSystem = true
				break
			}
		}
		if !isSystem {
			annotations[k] = v
		}
	}

	if resourceType == constants.MANAGED_KUBE_RESOURCE_TYPE_SECRET {

		managedSecretReference := managedSecretReferenceInterface.(v1alpha1.ManagedKubeSecretConfig)

		annotations[constants.SECRET_VERSION_ANNOTATION] = ETag
		// create a new secret as specified by the managed secret spec of CRD
		newKubeSecretInstance := &corev1.Secret{
			ObjectMeta: metav1.ObjectMeta{
				Name:        managedSecretReference.SecretName,
				Namespace:   managedSecretReference.SecretNamespace,
				Annotations: annotations,
				Labels:      labels,
			},
			Type: corev1.SecretType(managedSecretReference.SecretType),
			Data: plainProcessedSecrets,
		}

		if managedSecretReference.CreationPolicy == "Owner" {
			// Set InfisicalSecret instance as the owner and controller of the managed secret
			err := ctrl.SetControllerReference(&infisicalSecret, newKubeSecretInstance, r.Scheme)
			if err != nil {
				return err
			}
		}

		err := r.Client.Create(ctx, newKubeSecretInstance)
		if err != nil {
			return fmt.Errorf("unable to create the managed Kubernetes secret : %w", err)
		}
		logger.Info(fmt.Sprintf("Successfully created a managed Kubernetes secret with your Infisical secrets. Type: %s", managedSecretReference.SecretType))
		return nil
	} else if resourceType == constants.MANAGED_KUBE_RESOURCE_TYPE_CONFIG_MAP {

		managedSecretReference := managedSecretReferenceInterface.(v1alpha1.ManagedKubeConfigMapConfig)

		// create a new config map as specified by the managed secret spec of CRD
		newKubeConfigMapInstance := &corev1.ConfigMap{
			ObjectMeta: metav1.ObjectMeta{
				Name:        managedSecretReference.ConfigMapName,
				Namespace:   managedSecretReference.ConfigMapNamespace,
				Annotations: annotations,
				Labels:      labels,
			},
			Data: convertBinaryToStringMap(plainProcessedSecrets),
		}

		if managedSecretReference.CreationPolicy == "Owner" {
			// Set InfisicalSecret instance as the owner and controller of the managed config map
			err := ctrl.SetControllerReference(&infisicalSecret, newKubeConfigMapInstance, r.Scheme)
			if err != nil {
				return err
			}
		}

		err := r.Client.Create(ctx, newKubeConfigMapInstance)
		if err != nil {
			return fmt.Errorf("unable to create the managed Kubernetes config map : %w", err)
		}
		logger.Info(fmt.Sprintf("Successfully created a managed Kubernetes config map with your Infisical secrets. Type: %s", managedSecretReference.ConfigMapName))
		return nil

	}
	return fmt.Errorf("invalid resource type")

}

func (r *InfisicalSecretReconciler) updateInfisicalManagedKubeSecret(ctx context.Context, logger logr.Logger, managedSecretReference v1alpha1.ManagedKubeSecretConfig, managedKubeSecret corev1.Secret, secretsFromAPI []model.SingleEnvironmentVariable, ETag string) error {
	managedTemplateData := managedSecretReference.Template

	plainProcessedSecrets := make(map[string][]byte)
	if managedTemplateData == nil || managedTemplateData.IncludeAllSecrets {
		for _, secret := range secretsFromAPI {
			plainProcessedSecrets[secret.Key] = []byte(secret.Value)
		}
	}

	if managedTemplateData != nil {
		secretKeyValue := make(map[string]model.SecretTemplateOptions)
		for _, secret := range secretsFromAPI {
			secretKeyValue[secret.Key] = model.SecretTemplateOptions{
				Value:      secret.Value,
				SecretPath: secret.SecretPath,
			}
		}

		for templateKey, userTemplate := range managedTemplateData.Data {
			tmpl, err := tpl.New("secret-templates").Funcs(template.GetTemplateFunctions()).Parse(userTemplate)
			if err != nil {
				return fmt.Errorf("unable to compile template: %s [err=%v]", templateKey, err)
			}

			buf := bytes.NewBuffer(nil)
			err = tmpl.Execute(buf, secretKeyValue)
			if err != nil {
				return fmt.Errorf("unable to execute template: %s [err=%v]", templateKey, err)
			}
			plainProcessedSecrets[templateKey] = buf.Bytes()
		}
	}

	// Initialize the Annotations map if it's nil
	if managedKubeSecret.ObjectMeta.Annotations == nil {
		managedKubeSecret.ObjectMeta.Annotations = make(map[string]string)
	}

	managedKubeSecret.Data = plainProcessedSecrets
	managedKubeSecret.ObjectMeta.Annotations[constants.SECRET_VERSION_ANNOTATION] = ETag

	err := r.Client.Update(ctx, &managedKubeSecret)
	if err != nil {
		return fmt.Errorf("unable to update Kubernetes secret because [%w]", err)
	}

	logger.Info("successfully updated managed Kubernetes secret")
	return nil
}

func (r *InfisicalSecretReconciler) updateInfisicalManagedConfigMap(ctx context.Context, logger logr.Logger, managedConfigMapReference v1alpha1.ManagedKubeConfigMapConfig, managedConfigMap corev1.ConfigMap, secretsFromAPI []model.SingleEnvironmentVariable, ETag string) error {
	managedTemplateData := managedConfigMapReference.Template

	plainProcessedSecrets := make(map[string][]byte)
	if managedTemplateData == nil || managedTemplateData.IncludeAllSecrets {
		for _, secret := range secretsFromAPI {
			plainProcessedSecrets[secret.Key] = []byte(secret.Value)
		}
	}

	if managedTemplateData != nil {
		secretKeyValue := make(map[string]model.SecretTemplateOptions)
		for _, secret := range secretsFromAPI {
			secretKeyValue[secret.Key] = model.SecretTemplateOptions{
				Value:      secret.Value,
				SecretPath: secret.SecretPath,
			}
		}

		for templateKey, userTemplate := range managedTemplateData.Data {
			tmpl, err := tpl.New("secret-templates").Funcs(template.GetTemplateFunctions()).Parse(userTemplate)
			if err != nil {
				return fmt.Errorf("unable to compile template: %s [err=%v]", templateKey, err)
			}

			buf := bytes.NewBuffer(nil)
			err = tmpl.Execute(buf, secretKeyValue)
			if err != nil {
				return fmt.Errorf("unable to execute template: %s [err=%v]", templateKey, err)
			}
			plainProcessedSecrets[templateKey] = buf.Bytes()
		}
	}

	// Initialize the Annotations map if it's nil
	if managedConfigMap.ObjectMeta.Annotations == nil {
		managedConfigMap.ObjectMeta.Annotations = make(map[string]string)
	}

	managedConfigMap.Data = convertBinaryToStringMap(plainProcessedSecrets)
	managedConfigMap.ObjectMeta.Annotations[constants.SECRET_VERSION_ANNOTATION] = ETag

	err := r.Client.Update(ctx, &managedConfigMap)
	if err != nil {
		return fmt.Errorf("unable to update Kubernetes config map because [%w]", err)
	}

	logger.Info("successfully updated managed Kubernetes config map")
	return nil
}

func (r *InfisicalSecretReconciler) fetchSecretsFromAPI(ctx context.Context, logger logr.Logger, authDetails util.AuthenticationDetails, infisicalClient infisicalSdk.InfisicalClientInterface, infisicalSecret v1alpha1.InfisicalSecret) ([]model.SingleEnvironmentVariable, error) {

	if authDetails.AuthStrategy == util.AuthStrategy.SERVICE_ACCOUNT { // Service Account // ! Legacy auth method
		serviceAccountCreds, err := r.getInfisicalServiceAccountCredentialsFromKubeSecret(ctx, infisicalSecret)
		if err != nil {
			return nil, fmt.Errorf("ReconcileInfisicalSecret: unable to get service account creds from kube secret [err=%s]", err)
		}

		plainTextSecretsFromApi, err := util.GetPlainTextSecretsViaServiceAccount(infisicalClient, serviceAccountCreds, infisicalSecret.Spec.Authentication.ServiceAccount.ProjectId, infisicalSecret.Spec.Authentication.ServiceAccount.EnvironmentName)
		if err != nil {
			return nil, fmt.Errorf("\nfailed to get secrets because [err=%v]", err)
		}

		logger.Info("ReconcileInfisicalSecret: Fetched secrets via service account")

		return plainTextSecretsFromApi, nil

	} else if authDetails.AuthStrategy == util.AuthStrategy.SERVICE_TOKEN { // Service Tokens // ! Legacy / Deprecated auth method
		infisicalToken, err := r.getInfisicalTokenFromKubeSecret(ctx, infisicalSecret)
		if err != nil {
			return nil, fmt.Errorf("ReconcileInfisicalSecret: unable to get service token from kube secret [err=%s]", err)
		}

		envSlug := infisicalSecret.Spec.Authentication.ServiceToken.SecretsScope.EnvSlug
		secretsPath := infisicalSecret.Spec.Authentication.ServiceToken.SecretsScope.SecretsPath
		recursive := infisicalSecret.Spec.Authentication.ServiceToken.SecretsScope.Recursive

		plainTextSecretsFromApi, err := util.GetPlainTextSecretsViaServiceToken(infisicalClient, infisicalToken, envSlug, secretsPath, recursive)
		if err != nil {
			return nil, fmt.Errorf("\nfailed to get secrets because [err=%v]", err)
		}

		logger.Info("ReconcileInfisicalSecret: Fetched secrets via [type=SERVICE_TOKEN]")

		return plainTextSecretsFromApi, nil

	} else if authDetails.IsMachineIdentityAuth { // * Machine Identity authentication, the SDK will be authenticated at this point
		plainTextSecretsFromApi, err := util.GetPlainTextSecretsViaMachineIdentity(infisicalClient, authDetails.MachineIdentityScope)

		if err != nil {
			return nil, fmt.Errorf("\nfailed to get secrets because [err=%v]", err)
		}

		logger.Info(fmt.Sprintf("ReconcileInfisicalSecret: Fetched secrets via machine identity [type=%v]", authDetails.AuthStrategy))

		return plainTextSecretsFromApi, nil

	} else {
		return nil, errors.New("no authentication method provided. Please configure a authentication method then try again")
	}
}

func (r *InfisicalSecretReconciler) getResourceVariables(infisicalSecret v1alpha1.InfisicalSecret) util.ResourceVariables {

	var resourceVariables util.ResourceVariables

	if _, ok := infisicalSecretResourceVariablesMap[string(infisicalSecret.UID)]; !ok {

		ctx, cancel := context.WithCancel(context.Background())

		client := infisicalSdk.NewInfisicalClient(ctx, infisicalSdk.Config{
			SiteUrl:       api.API_HOST_URL,
			CaCertificate: api.API_CA_CERTIFICATE,
			UserAgent:     api.USER_AGENT_NAME,
		})

		infisicalSecretResourceVariablesMap[string(infisicalSecret.UID)] = util.ResourceVariables{
			InfisicalClient: client,
			CancelCtx:       cancel,
			AuthDetails:     util.AuthenticationDetails{},
		}

		resourceVariables = infisicalSecretResourceVariablesMap[string(infisicalSecret.UID)]

	} else {
		resourceVariables = infisicalSecretResourceVariablesMap[string(infisicalSecret.UID)]
	}

	return resourceVariables

}

func (r *InfisicalSecretReconciler) updateResourceVariables(infisicalSecret v1alpha1.InfisicalSecret, resourceVariables util.ResourceVariables) {
	infisicalSecretResourceVariablesMap[string(infisicalSecret.UID)] = resourceVariables
}

func (r *InfisicalSecretReconciler) ReconcileInfisicalSecret(ctx context.Context, logger logr.Logger, infisicalSecret *v1alpha1.InfisicalSecret, managedKubeSecretReferences []v1alpha1.ManagedKubeSecretConfig, managedKubeConfigMapReferences []v1alpha1.ManagedKubeConfigMapConfig) (int, error) {

	if infisicalSecret == nil {
		return 0, fmt.Errorf("infisicalSecret is nil")
	}

	resourceVariables := r.getResourceVariables(*infisicalSecret)
	infisicalClient := resourceVariables.InfisicalClient
	cancelCtx := resourceVariables.CancelCtx
	authDetails := resourceVariables.AuthDetails
	var err error

	if authDetails.AuthStrategy == "" {
		logger.Info("No authentication strategy found. Attempting to authenticate")
		authDetails, err = r.handleAuthentication(ctx, *infisicalSecret, infisicalClient)
		r.SetInfisicalTokenLoadCondition(ctx, logger, infisicalSecret, authDetails.AuthStrategy, err)

		if err != nil {
			return 0, fmt.Errorf("unable to authenticate [err=%s]", err)
		}

		r.updateResourceVariables(*infisicalSecret, util.ResourceVariables{
			InfisicalClient: infisicalClient,
			CancelCtx:       cancelCtx,
			AuthDetails:     authDetails,
		})
	}

	plainTextSecretsFromApi, err := r.fetchSecretsFromAPI(ctx, logger, authDetails, infisicalClient, *infisicalSecret)

	if err != nil {
		return 0, fmt.Errorf("failed to fetch secrets from API for managed secrets [err=%s]", err)
	}
	secretsCount := len(plainTextSecretsFromApi)

	if len(managedKubeSecretReferences) > 0 {
		for _, managedSecretReference := range managedKubeSecretReferences {
			// Look for managed secret by name and namespace
			managedKubeSecret, err := util.GetKubeSecretByNamespacedName(ctx, r.Client, types.NamespacedName{
				Name:      managedSecretReference.SecretName,
				Namespace: managedSecretReference.SecretNamespace,
			})

			if err != nil && !k8Errors.IsNotFound(err) {
				return 0, fmt.Errorf("something went wrong when fetching the managed Kubernetes secret [%w]", err)
			}

			newEtag := crypto.ComputeEtag([]byte(fmt.Sprintf("%v", plainTextSecretsFromApi)))
			if managedKubeSecret == nil {
				if err := r.createInfisicalManagedKubeResource(ctx, logger, *infisicalSecret, managedSecretReference, plainTextSecretsFromApi, newEtag, constants.MANAGED_KUBE_RESOURCE_TYPE_SECRET); err != nil {
					return 0, fmt.Errorf("failed to create managed secret [err=%s]", err)
				}
			} else {
				if err := r.updateInfisicalManagedKubeSecret(ctx, logger, managedSecretReference, *managedKubeSecret, plainTextSecretsFromApi, newEtag); err != nil {
					return 0, fmt.Errorf("failed to update managed secret [err=%s]", err)
				}
			}
		}
	}

	if len(managedKubeConfigMapReferences) > 0 {
		for _, managedConfigMapReference := range managedKubeConfigMapReferences {
			managedKubeConfigMap, err := util.GetKubeConfigMapByNamespacedName(ctx, r.Client, types.NamespacedName{
				Name:      managedConfigMapReference.ConfigMapName,
				Namespace: managedConfigMapReference.ConfigMapNamespace,
			})

			if err != nil && !k8Errors.IsNotFound(err) {
				return 0, fmt.Errorf("something went wrong when fetching the managed Kubernetes config map [%w]", err)
			}

			newEtag := crypto.ComputeEtag([]byte(fmt.Sprintf("%v", plainTextSecretsFromApi)))
			if managedKubeConfigMap == nil {
				if err := r.createInfisicalManagedKubeResource(ctx, logger, *infisicalSecret, managedConfigMapReference, plainTextSecretsFromApi, newEtag, constants.MANAGED_KUBE_RESOURCE_TYPE_CONFIG_MAP); err != nil {
					return 0, fmt.Errorf("failed to create managed config map [err=%s]", err)
				}
			} else {
				if err := r.updateInfisicalManagedConfigMap(ctx, logger, managedConfigMapReference, *managedKubeConfigMap, plainTextSecretsFromApi, newEtag); err != nil {
					return 0, fmt.Errorf("failed to update managed config map [err=%s]", err)
				}
			}

		}
	}

	return secretsCount, nil
}
