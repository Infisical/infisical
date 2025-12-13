package infisicalsecret

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/http"
	"strings"
	tpl "text/template"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/internal/api"
	"github.com/Infisical/infisical/k8-operator/internal/constants"
	"github.com/Infisical/infisical/k8-operator/internal/crypto"
	"github.com/Infisical/infisical/k8-operator/internal/model"
	"github.com/Infisical/infisical/k8-operator/internal/template"
	"github.com/Infisical/infisical/k8-operator/internal/util"
	"github.com/Infisical/infisical/k8-operator/internal/util/sse"
	"github.com/go-logr/logr"
	"github.com/go-resty/resty/v2"

	"k8s.io/apimachinery/pkg/runtime"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"
	"sigs.k8s.io/controller-runtime/pkg/event"

	infisicalSdk "github.com/infisical/go-sdk"
	corev1 "k8s.io/api/core/v1"
	k8Errors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	ctrl "sigs.k8s.io/controller-runtime"
)

const FINALIZER_NAME = "secrets.finalizers.infisical.com"

type InfisicalSecretReconciler struct {
	client.Client
	Scheme            *runtime.Scheme
	IsNamespaceScoped bool
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

	if k8Errors.IsNotFound(err) || (secretNamespace == "" && secretName == "") {
		return "", nil
	}

	if err != nil {
		if util.IsNamespaceScopedError(err, r.IsNamespaceScoped) {
			return "", fmt.Errorf("unable to fetch Kubernetes CA certificate secret. Your Operator installation is namespace scoped, and cannot read secrets outside of the namespace it is installed in. Please ensure the CA certificate secret is in the same namespace as the operator. [err=%v]", err)
		}
		return "", fmt.Errorf("failed to read Infisical token secret from secret named [%s] in namespace [%s]: with error [%w]", infisicalSecret.Spec.TokenSecretReference.SecretName, infisicalSecret.Spec.TokenSecretReference.SecretNamespace, err)
	}

	infisicalServiceToken := tokenSecret.Data[constants.INFISICAL_TOKEN_SECRET_KEY_NAME]

	return strings.Replace(string(infisicalServiceToken), " ", "", -1), nil
}

// Fetches service account credentials from a Kubernetes secret specified in the infisicalSecret object, extracts the access key, public key, and private key from the secret, and returns them as a ServiceAccountCredentials object.
// If any keys are missing or an error occurs, returns an empty object or an error object, respectively.
func (r *InfisicalSecretReconciler) getInfisicalServiceAccountCredentialsFromKubeSecret(ctx context.Context, infisicalSecret v1alpha1.InfisicalSecret) (serviceAccountDetails model.ServiceAccountDetails, err error) {

	secretNamespace := infisicalSecret.Spec.Authentication.ServiceAccount.ServiceAccountSecretReference.SecretNamespace
	secretName := infisicalSecret.Spec.Authentication.ServiceAccount.ServiceAccountSecretReference.SecretName

	serviceAccountCredsFromKubeSecret, err := util.GetKubeSecretByNamespacedName(ctx, r.Client, types.NamespacedName{
		Namespace: secretNamespace,
		Name:      secretName,
	})

	if k8Errors.IsNotFound(err) || (secretNamespace == "" && secretName == "") {
		return model.ServiceAccountDetails{}, nil
	}

	if err != nil {
		if util.IsNamespaceScopedError(err, r.IsNamespaceScoped) {
			return model.ServiceAccountDetails{}, fmt.Errorf("unable to fetch Kubernetes service account credentials secret. Your Operator installation is namespace scoped, and cannot read secrets outside of the namespace it is installed in. Please ensure the service account credentials secret is in the same namespace as the operator. [err=%v]", err)
		}
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

func parseNamespaces(namespaceStr string) []string {
	namespaces := strings.Split(namespaceStr, ",")
	result := make([]string, 0, len(namespaces))
	for _, ns := range namespaces {
		trimmed := strings.TrimSpace(ns)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
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
		
		targetNamespaces := parseNamespaces(managedSecretReference.SecretNamespace)
		
		for _, namespace := range targetNamespaces {
			newKubeSecretInstance := &corev1.Secret{
				ObjectMeta: metav1.ObjectMeta{
					Name:        managedSecretReference.SecretName,
					Namespace:   namespace,
					Annotations: annotations,
					Labels:      labels,
				},
				Type: corev1.SecretType(managedSecretReference.SecretType),
				Data: plainProcessedSecrets,
			}

			if managedSecretReference.CreationPolicy == "Owner" {
				if namespace == infisicalSecret.Namespace {
					err := ctrl.SetControllerReference(&infisicalSecret, newKubeSecretInstance, r.Scheme)
					if err != nil {
						logger.Error(err, "failed to set controller reference for secret", "namespace", namespace)
						return err
					}
				} else {
					logger.Info("Skipping owner reference for cross-namespace secret", "secretNamespace", namespace, "crdNamespace", infisicalSecret.Namespace)
				}
			}
			
			err := r.Client.Create(ctx, newKubeSecretInstance)
			if err != nil {
				return fmt.Errorf("unable to create the managed Kubernetes secret : %w", err)
			}
			logger.Info(fmt.Sprintf("Successfully created a managed Kubernetes secret with your Infisical secrets. Type: %s", managedSecretReference.SecretType))
		}
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

func (r *InfisicalSecretReconciler) getResourceVariables(infisicalSecret v1alpha1.InfisicalSecret, resourceVariablesMap map[string]util.ResourceVariables) util.ResourceVariables {

	var resourceVariables util.ResourceVariables

	if _, ok := resourceVariablesMap[string(infisicalSecret.UID)]; !ok {

		ctx, cancel := context.WithCancel(context.Background())

		client := infisicalSdk.NewInfisicalClient(ctx, infisicalSdk.Config{
			SiteUrl:       api.API_HOST_URL,
			CaCertificate: api.API_CA_CERTIFICATE,
			UserAgent:     api.USER_AGENT_NAME,
		})

		resourceVariablesMap[string(infisicalSecret.UID)] = util.ResourceVariables{
			InfisicalClient:  client,
			CancelCtx:        cancel,
			AuthDetails:      util.AuthenticationDetails{},
			ServerSentEvents: sse.NewConnectionRegistry(ctx),
		}

		resourceVariables = resourceVariablesMap[string(infisicalSecret.UID)]

	} else {
		resourceVariables = resourceVariablesMap[string(infisicalSecret.UID)]
	}

	return resourceVariables
}

func (r *InfisicalSecretReconciler) updateResourceVariables(infisicalSecret v1alpha1.InfisicalSecret, resourceVariables util.ResourceVariables, resourceVariablesMap map[string]util.ResourceVariables) {
	resourceVariablesMap[string(infisicalSecret.UID)] = resourceVariables
}

func (r *InfisicalSecretReconciler) ReconcileInfisicalSecret(ctx context.Context, logger logr.Logger, infisicalSecret *v1alpha1.InfisicalSecret, managedKubeSecretReferences []v1alpha1.ManagedKubeSecretConfig, managedKubeConfigMapReferences []v1alpha1.ManagedKubeConfigMapConfig, resourceVariablesMap map[string]util.ResourceVariables) (int, error) {

	if infisicalSecret == nil {
		return 0, fmt.Errorf("infisicalSecret is nil")
	}

	resourceVariables := r.getResourceVariables(*infisicalSecret, resourceVariablesMap)
	infisicalClient := resourceVariables.InfisicalClient
	cancelCtx := resourceVariables.CancelCtx
	authDetails := resourceVariables.AuthDetails
	var err error

	if authDetails.AuthStrategy == "" {
		logger.Info("No authentication strategy found. Attempting to authenticate")
		authDetails, err = util.HandleAuthentication(ctx, util.SecretAuthInput{
			Secret: *infisicalSecret,
			Type:   util.SecretCrd.INFISICAL_SECRET,
		}, r.Client, infisicalClient, r.IsNamespaceScoped)

		r.SetInfisicalTokenLoadCondition(ctx, logger, infisicalSecret, authDetails.AuthStrategy, err)

		if err != nil {
			return 0, fmt.Errorf("unable to authenticate [err=%s]", err)
		}

		r.updateResourceVariables(*infisicalSecret, util.ResourceVariables{
			InfisicalClient:  infisicalClient,
			CancelCtx:        cancelCtx,
			AuthDetails:      authDetails,
			ServerSentEvents: sse.NewConnectionRegistry(ctx),
		}, resourceVariablesMap)
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
				if util.IsNamespaceScopedError(err, r.IsNamespaceScoped) {
					return 0, fmt.Errorf("unable to fetch Kubernetes secret. Your Operator installation is namespace scoped, and cannot read secrets outside of the namespace it is installed in. Please ensure the secret is in the same namespace as the operator. [err=%v]", err)
				}
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
				if util.IsNamespaceScopedError(err, r.IsNamespaceScoped) {
					return 0, fmt.Errorf("unable to fetch Kubernetes config map. Your Operator installation is namespace scoped, and cannot read config maps outside of the namespace it is installed in. Please ensure the config map is in the same namespace as the operator. [err=%v]", err)
				}
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

func (r *InfisicalSecretReconciler) CloseInstantUpdatesStream(ctx context.Context, logger logr.Logger, infisicalSecret *v1alpha1.InfisicalSecret, resourceVariablesMap map[string]util.ResourceVariables) error {
	if infisicalSecret == nil {
		return fmt.Errorf("infisicalSecret is nil")
	}

	variables := r.getResourceVariables(*infisicalSecret, resourceVariablesMap)

	if !variables.AuthDetails.IsMachineIdentityAuth {
		return fmt.Errorf("only machine identity is supported for subscriptions")
	}

	conn := variables.ServerSentEvents

	if _, ok := conn.Get(); ok {
		conn.Close()
	}

	return nil
}

func (r *InfisicalSecretReconciler) OpenInstantUpdatesStream(ctx context.Context, logger logr.Logger, infisicalSecret *v1alpha1.InfisicalSecret, resourceVariablesMap map[string]util.ResourceVariables, eventCh chan<- event.TypedGenericEvent[client.Object]) error {
	if infisicalSecret == nil {
		return fmt.Errorf("infisicalSecret is nil")
	}

	variables := r.getResourceVariables(*infisicalSecret, resourceVariablesMap)

	if !variables.AuthDetails.IsMachineIdentityAuth {
		return fmt.Errorf("only machine identity is supported for subscriptions")
	}

	projectSlug := variables.AuthDetails.MachineIdentityScope.ProjectSlug
	secretsPath := variables.AuthDetails.MachineIdentityScope.SecretsPath
	envSlug := variables.AuthDetails.MachineIdentityScope.EnvSlug

	infiscalClient := variables.InfisicalClient
	sseRegistry := variables.ServerSentEvents

	token := infiscalClient.Auth().GetAccessToken()

	project, err := util.GetProjectBySlug(token, projectSlug)

	if err != nil {
		return fmt.Errorf("failed to get project [err=%s]", err)
	}

	if variables.AuthDetails.MachineIdentityScope.Recursive {
		secretsPath = fmt.Sprint(secretsPath, "**")
	}

	if err != nil {
		return fmt.Errorf("CallSubscribeProjectEvents: unable to marshal body [err=%s]", err)
	}

	events, errors, err := sseRegistry.Subscribe(func() (*http.Response, error) {
		httpClient := resty.New()

		req, err := api.CallSubscribeProjectEvents(httpClient, project.ID, secretsPath, envSlug, token)

		if err != nil {
			return nil, err
		}

		return req, nil
	})

	if err != nil {
		return fmt.Errorf("unable to connect sse [err=%s]", err)
	}

	go func() {
	outer:
		for {
			select {
			case ev := <-events:
				logger.Info("Received SSE Event", "event", ev)
				eventCh <- event.TypedGenericEvent[client.Object]{
					Object: infisicalSecret,
				}
			case err := <-errors:
				logger.Error(err, "Error occurred")
				break outer
			case <-ctx.Done():
				break outer
			}
		}
	}()

	return nil
}
