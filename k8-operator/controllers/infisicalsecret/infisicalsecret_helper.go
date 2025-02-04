package controllers

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"text/template"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/api"
	"github.com/Infisical/infisical/k8-operator/packages/constants"
	"github.com/Infisical/infisical/k8-operator/packages/model"
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

var infisicalSecretTemplateFunctions = template.FuncMap{
	"decodeBase64ToBytes": func(encodedString string) string {
		decoded, err := base64.StdEncoding.DecodeString(encodedString)
		if err != nil {
			panic(fmt.Sprintf("Error: %v", err))
		}
		return string(decoded)
	},
}

func (r *InfisicalSecretReconciler) createInfisicalManagedKubeSecret(ctx context.Context, logger logr.Logger, infisicalSecret v1alpha1.InfisicalSecret, managedSecretReference v1alpha1.ManagedKubeSecretConfig, secretsFromAPI []model.SingleEnvironmentVariable, ETag string) error {
	plainProcessedSecrets := make(map[string][]byte)
	secretType := managedSecretReference.SecretType
	managedTemplateData := managedSecretReference.Template

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
			tmpl, err := template.New("secret-templates").Funcs(infisicalSecretTemplateFunctions).Parse(userTemplate)
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

	annotations[constants.SECRET_VERSION_ANNOTATION] = ETag
	// create a new secret as specified by the managed secret spec of CRD
	newKubeSecretInstance := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:        managedSecretReference.SecretName,
			Namespace:   managedSecretReference.SecretNamespace,
			Annotations: annotations,
			Labels:      labels,
		},
		Type: corev1.SecretType(secretType),
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

	logger.Info(fmt.Sprintf("Successfully created a managed Kubernetes secret with your Infisical secrets. Type: %s", secretType))
	return nil
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
			tmpl, err := template.New("secret-templates").Funcs(infisicalSecretTemplateFunctions).Parse(userTemplate)
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

func (r *InfisicalSecretReconciler) ReconcileInfisicalSecret(ctx context.Context, logger logr.Logger, infisicalSecret v1alpha1.InfisicalSecret, managedKubeSecretReferences []v1alpha1.ManagedKubeSecretConfig) (int, error) {

	resourceVariables := r.getResourceVariables(infisicalSecret)
	infisicalClient := resourceVariables.InfisicalClient
	cancelCtx := resourceVariables.CancelCtx
	authDetails := resourceVariables.AuthDetails
	var err error

	if authDetails.AuthStrategy == "" {
		logger.Info("No authentication strategy found. Attempting to authenticate")
		authDetails, err = r.handleAuthentication(ctx, infisicalSecret, infisicalClient)
		r.SetInfisicalTokenLoadCondition(ctx, logger, &infisicalSecret, authDetails.AuthStrategy, err)

		if err != nil {
			return 0, fmt.Errorf("unable to authenticate [err=%s]", err)
		}

		r.updateResourceVariables(infisicalSecret, util.ResourceVariables{
			InfisicalClient: infisicalClient,
			CancelCtx:       cancelCtx,
			AuthDetails:     authDetails,
		})
	}

	secretsCount := 0

	for _, managedSecretReference := range managedKubeSecretReferences {
		// Look for managed secret by name and namespace
		managedKubeSecret, err := util.GetKubeSecretByNamespacedName(ctx, r.Client, types.NamespacedName{
			Name:      managedSecretReference.SecretName,
			Namespace: managedSecretReference.SecretNamespace,
		})

		if err != nil && !k8Errors.IsNotFound(err) {
			return 0, fmt.Errorf("something went wrong when fetching the managed Kubernetes secret [%w]", err)
		}

		// Get exiting Etag if exists
		secretVersionBasedOnETag := ""
		if managedKubeSecret != nil {
			secretVersionBasedOnETag = managedKubeSecret.Annotations[constants.SECRET_VERSION_ANNOTATION]
		}

		var plainTextSecretsFromApi []model.SingleEnvironmentVariable
		var updateDetails model.RequestUpdateUpdateDetails

		if authDetails.AuthStrategy == util.AuthStrategy.SERVICE_ACCOUNT { // Service Account // ! Legacy auth method
			serviceAccountCreds, err := r.getInfisicalServiceAccountCredentialsFromKubeSecret(ctx, infisicalSecret)
			if err != nil {
				return 0, fmt.Errorf("ReconcileInfisicalSecret: unable to get service account creds from kube secret [err=%s]", err)
			}

			plainTextSecretsFromApi, updateDetails, err = util.GetPlainTextSecretsViaServiceAccount(infisicalClient, serviceAccountCreds, infisicalSecret.Spec.Authentication.ServiceAccount.ProjectId, infisicalSecret.Spec.Authentication.ServiceAccount.EnvironmentName, secretVersionBasedOnETag)
			if err != nil {
				return 0, fmt.Errorf("\nfailed to get secrets because [err=%v]", err)
			}

			logger.Info("ReconcileInfisicalSecret: Fetched secrets via service account")

		} else if authDetails.AuthStrategy == util.AuthStrategy.SERVICE_TOKEN { // Service Tokens // ! Legacy / Deprecated auth method
			infisicalToken, err := r.getInfisicalTokenFromKubeSecret(ctx, infisicalSecret)
			if err != nil {
				return 0, fmt.Errorf("ReconcileInfisicalSecret: unable to get service token from kube secret [err=%s]", err)
			}

			envSlug := infisicalSecret.Spec.Authentication.ServiceToken.SecretsScope.EnvSlug
			secretsPath := infisicalSecret.Spec.Authentication.ServiceToken.SecretsScope.SecretsPath
			recursive := infisicalSecret.Spec.Authentication.ServiceToken.SecretsScope.Recursive

			plainTextSecretsFromApi, updateDetails, err = util.GetPlainTextSecretsViaServiceToken(infisicalClient, infisicalToken, secretVersionBasedOnETag, envSlug, secretsPath, recursive)
			if err != nil {
				return 0, fmt.Errorf("\nfailed to get secrets because [err=%v]", err)
			}

			logger.Info("ReconcileInfisicalSecret: Fetched secrets via [type=SERVICE_TOKEN]")

		} else if authDetails.IsMachineIdentityAuth { // * Machine Identity authentication, the SDK will be authenticated at this point
			plainTextSecretsFromApi, updateDetails, err = util.GetPlainTextSecretsViaMachineIdentity(infisicalClient, secretVersionBasedOnETag, authDetails.MachineIdentityScope)

			if err != nil {
				return 0, fmt.Errorf("\nfailed to get secrets because [err=%v]", err)
			}

			logger.Info(fmt.Sprintf("ReconcileInfisicalSecret: Fetched secrets via machine identity [type=%v]", authDetails.AuthStrategy))

		} else {
			return 0, errors.New("no authentication method provided. Please configure a authentication method then try again")
		}

		secretsCount = len(plainTextSecretsFromApi)

		if managedKubeSecret == nil {
			if err := r.createInfisicalManagedKubeSecret(ctx, logger, infisicalSecret, managedSecretReference, plainTextSecretsFromApi, updateDetails.ETag); err != nil {
				return 0, fmt.Errorf("failed to create managed secret [err=%s]", err)
			}
		} else {
			if err := r.updateInfisicalManagedKubeSecret(ctx, logger, managedSecretReference, *managedKubeSecret, plainTextSecretsFromApi, updateDetails.ETag); err != nil {
				return 0, fmt.Errorf("failed to update managed secret [err=%s]", err)
			}
		}
	}

	return secretsCount, nil
}
