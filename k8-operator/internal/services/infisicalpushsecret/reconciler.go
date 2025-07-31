package infisicalpushsecret

import (
	"bytes"
	"context"
	"fmt"
	"strings"
	tpl "text/template"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/internal/api"
	"github.com/Infisical/infisical/k8-operator/internal/constants"
	"github.com/Infisical/infisical/k8-operator/internal/model"
	"github.com/Infisical/infisical/k8-operator/internal/template"
	"github.com/Infisical/infisical/k8-operator/internal/util"
	"github.com/go-logr/logr"
	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	generatorUtil "github.com/Infisical/infisical/k8-operator/internal/generator"
	infisicalSdk "github.com/infisical/go-sdk"
	"k8s.io/apimachinery/pkg/runtime"
)

type InfisicalPushSecretReconciler struct {
	client.Client
	Scheme            *runtime.Scheme
	IsNamespaceScoped bool
}

func (r *InfisicalPushSecretReconciler) getResourceVariables(infisicalPushSecret v1alpha1.InfisicalPushSecret, resourceVariablesMap map[string]util.ResourceVariables) util.ResourceVariables {

	var resourceVariables util.ResourceVariables

	if _, ok := resourceVariablesMap[string(infisicalPushSecret.UID)]; !ok {

		ctx, cancel := context.WithCancel(context.Background())

		client := infisicalSdk.NewInfisicalClient(ctx, infisicalSdk.Config{
			SiteUrl:       api.API_HOST_URL,
			CaCertificate: api.API_CA_CERTIFICATE,
			UserAgent:     api.USER_AGENT_NAME,
		})

		resourceVariablesMap[string(infisicalPushSecret.UID)] = util.ResourceVariables{
			InfisicalClient: client,
			CancelCtx:       cancel,
			AuthDetails:     util.AuthenticationDetails{},
		}

		resourceVariables = resourceVariablesMap[string(infisicalPushSecret.UID)]

	} else {
		resourceVariables = resourceVariablesMap[string(infisicalPushSecret.UID)]
	}

	return resourceVariables

}

func (r *InfisicalPushSecretReconciler) updateResourceVariables(infisicalPushSecret v1alpha1.InfisicalPushSecret, resourceVariables util.ResourceVariables, resourceVariablesMap map[string]util.ResourceVariables) {
	resourceVariablesMap[string(infisicalPushSecret.UID)] = resourceVariables
}

func (r *InfisicalPushSecretReconciler) processGenerators(ctx context.Context, infisicalPushSecret v1alpha1.InfisicalPushSecret) (map[string]string, error) {

	processedSecrets := make(map[string]string)

	if len(infisicalPushSecret.Spec.Push.Generators) == 0 {
		return processedSecrets, nil
	}

	for _, generator := range infisicalPushSecret.Spec.Push.Generators {
		generatorRef := generator.GeneratorRef

		clusterGenerator := &v1alpha1.ClusterGenerator{}
		err := r.Client.Get(ctx, types.NamespacedName{Name: generatorRef.Name}, clusterGenerator)
		if err != nil {
			return nil, fmt.Errorf("unable to get ClusterGenerator resource [err=%s]", err)
		}
		if generatorRef.Kind == v1alpha1.GeneratorKindPassword {
			// get the custom ClusterGenerator resource from the cluster

			if clusterGenerator.Spec.Generator.PasswordSpec == nil {
				return nil, fmt.Errorf("password spec is not defined in the ClusterGenerator resource")
			}

			password, err := generatorUtil.GeneratorPassword(*clusterGenerator.Spec.Generator.PasswordSpec)
			if err != nil {
				return nil, fmt.Errorf("unable to generate password [err=%s]", err)
			}

			processedSecrets[generator.DestinationSecretName] = password
		}

		if generatorRef.Kind == v1alpha1.GeneratorKindUUID {

			uuid, err := generatorUtil.GeneratorUUID()
			if err != nil {
				return nil, fmt.Errorf("unable to generate UUID [err=%s]", err)
			}

			processedSecrets[generator.DestinationSecretName] = uuid
		}
	}

	return processedSecrets, nil

}

func (r *InfisicalPushSecretReconciler) processTemplatedSecrets(infisicalPushSecret v1alpha1.InfisicalPushSecret, kubePushSecret *corev1.Secret, destination v1alpha1.InfisicalPushSecretDestination) (map[string]string, error) {

	processedSecrets := make(map[string]string)

	sourceSecrets := make(map[string]model.SecretTemplateOptions)
	for key, value := range kubePushSecret.Data {

		sourceSecrets[key] = model.SecretTemplateOptions{
			Value:      string(value),
			SecretPath: destination.SecretsPath,
		}
	}

	if infisicalPushSecret.Spec.Push.Secret.Template == nil || (infisicalPushSecret.Spec.Push.Secret.Template != nil && infisicalPushSecret.Spec.Push.Secret.Template.IncludeAllSecrets) {
		for key, value := range kubePushSecret.Data {
			processedSecrets[key] = string(value)
		}
	}

	if infisicalPushSecret.Spec.Push.Secret.Template != nil &&
		len(infisicalPushSecret.Spec.Push.Secret.Template.Data) > 0 {

		for templateKey, userTemplate := range infisicalPushSecret.Spec.Push.Secret.Template.Data {

			tmpl, err := tpl.New("push-secret-templates").Funcs(template.GetTemplateFunctions()).Parse(userTemplate)
			if err != nil {
				return nil, fmt.Errorf("unable to compile template: %s [err=%v]", templateKey, err)
			}

			buf := bytes.NewBuffer(nil)
			err = tmpl.Execute(buf, sourceSecrets)
			if err != nil {
				return nil, fmt.Errorf("unable to execute template: %s [err=%v]", templateKey, err)
			}

			processedSecrets[templateKey] = buf.String()
		}
	}

	return processedSecrets, nil
}

func (r *InfisicalPushSecretReconciler) ReconcileInfisicalPushSecret(ctx context.Context, logger logr.Logger, infisicalPushSecret *v1alpha1.InfisicalPushSecret, resourceVariablesMap map[string]util.ResourceVariables) error {

	resourceVariables := r.getResourceVariables(*infisicalPushSecret, resourceVariablesMap)
	infisicalClient := resourceVariables.InfisicalClient
	cancelCtx := resourceVariables.CancelCtx
	authDetails := resourceVariables.AuthDetails
	var err error

	if authDetails.AuthStrategy == "" {
		logger.Info("No authentication strategy found. Attempting to authenticate")
		authDetails, err = util.HandleAuthentication(ctx, util.SecretAuthInput{
			Secret: *infisicalPushSecret,
			Type:   util.SecretCrd.INFISICAL_PUSH_SECRET,
		}, r.Client, infisicalClient, r.IsNamespaceScoped)
		r.SetAuthenticatedStatusCondition(ctx, infisicalPushSecret, err)

		if err != nil {
			return fmt.Errorf("unable to authenticate [err=%s]", err)
		}

		r.updateResourceVariables(*infisicalPushSecret, util.ResourceVariables{
			InfisicalClient: infisicalClient,
			CancelCtx:       cancelCtx,
			AuthDetails:     authDetails,
		}, resourceVariablesMap)
	}

	destination := infisicalPushSecret.Spec.Destination
	if err := destination.ValidateDestination(); err != nil {
		return fmt.Errorf("destination validation failed: %v", err)
	}

	projectID := destination.ProjectID
	if projectID == "" && destination.ProjectSlug != "" {
		tempSecrets, err := infisicalClient.Secrets().List(infisicalSdk.ListSecretsOptions{
			ProjectSlug:    destination.ProjectSlug,
			Environment:    destination.EnvironmentSlug,
			SecretPath:     destination.SecretsPath,
			IncludeImports: false,
		})
		if err != nil {
			return fmt.Errorf("failed to resolve project from slug '%s': %v", destination.ProjectSlug, err)
		}
		// The SDK internally resolves the project ID, so we can extract it from any secret
		if len(tempSecrets) > 0 {
			projectID = tempSecrets[0].Workspace
		} else {
			projectID = ""
		}
	}

	processedSecrets := make(map[string]string)

	if infisicalPushSecret.Spec.Push.Secret != nil {
		kubePushSecret, err := util.GetKubeSecretByNamespacedName(ctx, r.Client, types.NamespacedName{
			Namespace: infisicalPushSecret.Spec.Push.Secret.SecretNamespace,
			Name:      infisicalPushSecret.Spec.Push.Secret.SecretName,
		})

		if err != nil {
			if util.IsNamespaceScopedError(err, r.IsNamespaceScoped) {
				return fmt.Errorf("unable to fetch Kubernetes destination secret. Your Operator installation is namespace scoped, and cannot read secrets outside of the namespace it is installed in. Please ensure the destination secret is in the same namespace as the operator. [err=%v]", err)
			}

			return fmt.Errorf("unable to fetch kube secret [err=%s]", err)
		}

		processedSecrets, err = r.processTemplatedSecrets(*infisicalPushSecret, kubePushSecret, destination)
		if err != nil {
			return fmt.Errorf("unable to process templated secrets [err=%s]", err)
		}
	}

	generatorSecrets, err := r.processGenerators(ctx, *infisicalPushSecret)
	if err != nil {
		return fmt.Errorf("unable to process generators [err=%s]", err)
	}

	for key, value := range generatorSecrets {
		processedSecrets[key] = value
	}

	existingSecrets, err := infisicalClient.Secrets().List(infisicalSdk.ListSecretsOptions{
		ProjectID:      projectID,
		ProjectSlug:    destination.ProjectSlug,
		Environment:    destination.EnvironmentSlug,
		SecretPath:     destination.SecretsPath,
		IncludeImports: false,
	})

	getExistingSecretByKey := func(key string) *infisicalSdk.Secret {
		for _, secret := range existingSecrets {
			if secret.SecretKey == key {
				return &secret
			}
		}
		return nil
	}

	getExistingSecretById := func(id string) *infisicalSdk.Secret {
		for _, secret := range existingSecrets {
			if secret.ID == id {
				return &secret
			}
		}
		return nil
	}

	updateExistingSecretByKey := func(key string, newSecretValue string) {
		for i := range existingSecrets {
			if existingSecrets[i].SecretKey == key {
				existingSecrets[i].SecretValue = newSecretValue
				break
			}
		}
	}

	if err != nil {
		return fmt.Errorf("unable to list secrets [err=%s]", err)
	}

	updatePolicy := infisicalPushSecret.Spec.UpdatePolicy

	var secretsFailedToCreate []string
	var secretsFailedToUpdate []string
	var secretsFailedToDelete []string
	var secretsFailedToReplaceById []string

	// If the ManagedSecrets are nil, we know this is the first time the InfisicalPushSecret is being reconciled.
	if infisicalPushSecret.Status.ManagedSecrets == nil {

		infisicalPushSecret.Status.ManagedSecrets = make(map[string]string) // (string[id], string[key] )

		for secretKey, secretValue := range processedSecrets {
			if exists := getExistingSecretByKey(secretKey); exists != nil {

				if updatePolicy == string(constants.PUSH_SECRET_REPLACE_POLICY_ENABLED) {
					updatedSecret, err := infisicalClient.Secrets().Update(infisicalSdk.UpdateSecretOptions{
						SecretKey:      secretKey,
						ProjectID:      projectID,
						Environment:    destination.EnvironmentSlug,
						SecretPath:     destination.SecretsPath,
						NewSecretValue: secretValue,
					})

					if err != nil {
						secretsFailedToUpdate = append(secretsFailedToUpdate, secretKey)
						logger.Info(fmt.Sprintf("unable to update secret [key=%s] [err=%s]", secretKey, err))
						continue
					}

					infisicalPushSecret.Status.ManagedSecrets[updatedSecret.ID] = secretKey
				}
			} else {
				createdSecret, err := infisicalClient.Secrets().Create(infisicalSdk.CreateSecretOptions{
					SecretKey:   secretKey,
					SecretValue: secretValue,
					ProjectID:   projectID,
					Environment: destination.EnvironmentSlug,
					SecretPath:  destination.SecretsPath,
				})

				if err != nil {
					secretsFailedToCreate = append(secretsFailedToCreate, secretKey)
					logger.Info(fmt.Sprintf("unable to create secret [key=%s] [err=%s]", secretKey, err))
					continue
				}

				infisicalPushSecret.Status.ManagedSecrets[createdSecret.ID] = secretKey
			}
		}
	} else {

		// Loop over all the managed secrets, and find the corresponding existingSecret that has the same ID. If the key doesn't match, delete the secret, and re-create it with the correct key/value
		for managedSecretId, managedSecretKey := range infisicalPushSecret.Status.ManagedSecrets {

			existingSecret := getExistingSecretById(managedSecretId)

			if existingSecret != nil {

				if existingSecret.SecretKey != managedSecretKey {
					// Secret key has changed, lets delete the secret and re-create it with the correct key

					logger.Info(fmt.Sprintf("Secret with ID [id=%s] has changed key from [%s] to [%s]. Deleting and re-creating secret", managedSecretId, managedSecretKey, existingSecret.SecretKey))

					deletedSecret, err := infisicalClient.Secrets().Delete(infisicalSdk.DeleteSecretOptions{
						SecretKey:   existingSecret.SecretKey,
						ProjectID:   projectID,
						Environment: destination.EnvironmentSlug,
						SecretPath:  destination.SecretsPath,
					})

					if err != nil {
						secretsFailedToReplaceById = append(secretsFailedToReplaceById, managedSecretKey)
						logger.Info(fmt.Sprintf("unable to delete secret [key=%s] [err=%s]", managedSecretKey, err))
						continue
					}

					createdSecret, err := infisicalClient.Secrets().Create(infisicalSdk.CreateSecretOptions{
						SecretKey:   managedSecretKey,
						SecretValue: existingSecret.SecretValue,
						ProjectID:   projectID,
						Environment: destination.EnvironmentSlug,
						SecretPath:  destination.SecretsPath,
					})

					if err != nil {
						secretsFailedToReplaceById = append(secretsFailedToReplaceById, managedSecretKey)
						logger.Info(fmt.Sprintf("unable to create secret [key=%s] [err=%s]", managedSecretKey, err))
						continue
					}

					delete(infisicalPushSecret.Status.ManagedSecrets, deletedSecret.ID)
					infisicalPushSecret.Status.ManagedSecrets[createdSecret.ID] = managedSecretKey
				}

			}
		}

		// We need to check if any of the secrets have been removed in the new kube secret
		for _, managedSecretKey := range infisicalPushSecret.Status.ManagedSecrets {

			if _, ok := processedSecrets[managedSecretKey]; !ok {

				// Secret has been removed, verify that the secret is managed by the operator
				if getExistingSecretByKey(managedSecretKey) != nil {
					logger.Info(fmt.Sprintf("Secret with key [key=%s] has been removed from the kube secret. Deleting secret from Infisical", managedSecretKey))

					deletedSecret, err := infisicalClient.Secrets().Delete(infisicalSdk.DeleteSecretOptions{
						SecretKey:   managedSecretKey,
						ProjectID:   projectID,
						Environment: destination.EnvironmentSlug,
						SecretPath:  destination.SecretsPath,
					})

					if err != nil {
						secretsFailedToDelete = append(secretsFailedToDelete, managedSecretKey)
						logger.Info(fmt.Sprintf("unable to delete secret [key=%s] [err=%s]", managedSecretKey, err))
						continue
					}

					delete(infisicalPushSecret.Status.ManagedSecrets, deletedSecret.ID)
				}
			}
		}

		// We need to check if any new secrets have been added in the kube secret
		for currentSecretKey := range processedSecrets {

			if exists := getExistingSecretByKey(currentSecretKey); exists == nil {

				// Some secrets has been added, verify that the secret that has been added is not already managed by the operator
				if _, ok := infisicalPushSecret.Status.ManagedSecrets[currentSecretKey]; !ok {

					// Secret was not managed by the operator, lets add it
					logger.Info(fmt.Sprintf("Secret with key [key=%s] has been added to the kube secret. Creating secret in Infisical", currentSecretKey))

					createdSecret, err := infisicalClient.Secrets().Create(infisicalSdk.CreateSecretOptions{
						SecretKey:   currentSecretKey,
						SecretValue: processedSecrets[currentSecretKey],
						ProjectID:   projectID,
						Environment: destination.EnvironmentSlug,
						SecretPath:  destination.SecretsPath,
					})

					if err != nil {
						secretsFailedToCreate = append(secretsFailedToCreate, currentSecretKey)
						logger.Info(fmt.Sprintf("unable to create secret [key=%s] [err=%s]", currentSecretKey, err))
						continue
					}

					infisicalPushSecret.Status.ManagedSecrets[createdSecret.ID] = currentSecretKey
				}
			} else {
				if updatePolicy == string(constants.PUSH_SECRET_REPLACE_POLICY_ENABLED) {

					existingSecret := getExistingSecretByKey(currentSecretKey)

					if existingSecret != nil && existingSecret.SecretValue != processedSecrets[currentSecretKey] {
						logger.Info(fmt.Sprintf("Secret with key [key=%s] has changed value. Updating secret in Infisical", currentSecretKey))

						updatedSecret, err := infisicalClient.Secrets().Update(infisicalSdk.UpdateSecretOptions{
							SecretKey:      currentSecretKey,
							NewSecretValue: processedSecrets[currentSecretKey],
							ProjectID:      projectID,
							Environment:    destination.EnvironmentSlug,
							SecretPath:     destination.SecretsPath,
						})

						if err != nil {
							secretsFailedToUpdate = append(secretsFailedToUpdate, currentSecretKey)
							logger.Info(fmt.Sprintf("unable to update secret [key=%s] [err=%s]", currentSecretKey, err))
							continue
						}

						updateExistingSecretByKey(currentSecretKey, processedSecrets[currentSecretKey])
						infisicalPushSecret.Status.ManagedSecrets[updatedSecret.ID] = currentSecretKey
					}
				}
			}
		}

		// Check if any of the existing secrets values have changed
		for secretKey, secretValue := range processedSecrets {

			existingSecret := getExistingSecretByKey(secretKey)

			if existingSecret != nil {

				_, managedByOperator := infisicalPushSecret.Status.ManagedSecrets[existingSecret.ID]

				if secretValue != existingSecret.SecretValue {

					if managedByOperator || updatePolicy == string(constants.PUSH_SECRET_REPLACE_POLICY_ENABLED) {
						logger.Info(fmt.Sprintf("Secret with key [key=%s] has changed value. Updating secret in Infisical", secretKey))

						updatedSecret, err := infisicalClient.Secrets().Update(infisicalSdk.UpdateSecretOptions{
							SecretKey:      secretKey,
							NewSecretValue: secretValue,
							ProjectID:      projectID,
							Environment:    destination.EnvironmentSlug,
							SecretPath:     destination.SecretsPath,
						})

						if err != nil {
							secretsFailedToUpdate = append(secretsFailedToUpdate, secretKey)
							logger.Info(fmt.Sprintf("unable to update secret [key=%s] [err=%s]", secretKey, err))
							continue
						}

						infisicalPushSecret.Status.ManagedSecrets[updatedSecret.ID] = secretKey
					}
				}
			}
		}
	}

	var errorMessage string
	if len(secretsFailedToCreate) > 0 {
		errorMessage = fmt.Sprintf("Failed to create secrets: [%s]", strings.Join(secretsFailedToCreate, ", "))
	} else {
		errorMessage = ""
	}
	r.SetFailedToCreateSecretsStatusCondition(ctx, infisicalPushSecret, fmt.Sprintf("Failed to create secrets: [%s]", errorMessage))

	if len(secretsFailedToUpdate) > 0 {
		errorMessage = fmt.Sprintf("Failed to update secrets: [%s]", strings.Join(secretsFailedToUpdate, ", "))
	} else {
		errorMessage = ""
	}
	r.SetFailedToUpdateSecretsStatusCondition(ctx, infisicalPushSecret, fmt.Sprintf("Failed to update secrets: [%s]", errorMessage))

	if len(secretsFailedToDelete) > 0 {
		errorMessage = fmt.Sprintf("Failed to delete secrets: [%s]", strings.Join(secretsFailedToDelete, ", "))
	} else {
		errorMessage = ""
	}
	r.SetFailedToDeleteSecretsStatusCondition(ctx, infisicalPushSecret, errorMessage)

	if len(secretsFailedToReplaceById) > 0 {
		errorMessage = fmt.Sprintf("Failed to replace secrets: [%s]", strings.Join(secretsFailedToReplaceById, ", "))
	} else {
		errorMessage = ""
	}
	r.SetFailedToReplaceSecretsStatusCondition(ctx, infisicalPushSecret, errorMessage)

	// Update the status of the InfisicalPushSecret
	if err := r.Client.Status().Update(ctx, infisicalPushSecret); err != nil {
		return fmt.Errorf("unable to update status of InfisicalPushSecret [err=%s]", err)
	}

	return nil

}

func (r *InfisicalPushSecretReconciler) DeleteManagedSecrets(ctx context.Context, logger logr.Logger, infisicalPushSecret *v1alpha1.InfisicalPushSecret, resourceVariablesMap map[string]util.ResourceVariables) error {
	if infisicalPushSecret.Spec.DeletionPolicy != string(constants.PUSH_SECRET_DELETE_POLICY_ENABLED) {
		return nil
	}

	resourceVariables := r.getResourceVariables(*infisicalPushSecret, resourceVariablesMap)
	infisicalClient := resourceVariables.InfisicalClient
	cancelCtx := resourceVariables.CancelCtx
	authDetails := resourceVariables.AuthDetails
	var err error

	if authDetails.AuthStrategy == "" {
		logger.Info("No authentication strategy found. Attempting to authenticate")
		authDetails, err = util.HandleAuthentication(ctx, util.SecretAuthInput{
			Secret: *infisicalPushSecret,
			Type:   util.SecretCrd.INFISICAL_PUSH_SECRET,
		}, r.Client, infisicalClient, r.IsNamespaceScoped)
		r.SetAuthenticatedStatusCondition(ctx, infisicalPushSecret, err)

		if err != nil {
			return fmt.Errorf("unable to authenticate [err=%s]", err)
		}

		r.updateResourceVariables(*infisicalPushSecret, util.ResourceVariables{
			InfisicalClient: infisicalClient,
			CancelCtx:       cancelCtx,
			AuthDetails:     authDetails,
		}, resourceVariablesMap)
	}

	destination := infisicalPushSecret.Spec.Destination
	if err := destination.ValidateDestination(); err != nil {
		return fmt.Errorf("destination validation failed: %v", err)
	}

	// Resolve project ID if only project slug is provided
	projectID := destination.ProjectID
	if projectID == "" && destination.ProjectSlug != "" {
		// Use List operation to resolve project ID from slug
		tempSecrets, err := infisicalClient.Secrets().List(infisicalSdk.ListSecretsOptions{
			ProjectSlug:    destination.ProjectSlug,
			Environment:    destination.EnvironmentSlug,
			SecretPath:     destination.SecretsPath,
			IncludeImports: false,
		})
		if err != nil {
			return fmt.Errorf("failed to resolve project from slug '%s': %v", destination.ProjectSlug, err)
		}
		// Extract project ID from any secret
		if len(tempSecrets) > 0 {
			projectID = tempSecrets[0].Workspace
		}
	}

	existingSecrets, err := resourceVariables.InfisicalClient.Secrets().List(infisicalSdk.ListSecretsOptions{
		ProjectID:      projectID,
		ProjectSlug:    destination.ProjectSlug,
		Environment:    destination.EnvironmentSlug,
		SecretPath:     destination.SecretsPath,
		IncludeImports: false,
	})

	if err != nil {
		return fmt.Errorf("unable to list secrets [err=%s]", err)
	}

	existingSecretsMappedById := make(map[string]infisicalSdk.Secret)
	for _, secret := range existingSecrets {
		existingSecretsMappedById[secret.ID] = secret
	}

	for managedSecretId, managedSecretKey := range infisicalPushSecret.Status.ManagedSecrets {

		if _, ok := existingSecretsMappedById[managedSecretId]; ok {
			logger.Info(fmt.Sprintf("Deleting secret with key [key=%s]", managedSecretKey))

			_, err := infisicalClient.Secrets().Delete(infisicalSdk.DeleteSecretOptions{
				SecretKey:   managedSecretKey,
				ProjectID:   projectID,
				Environment: destination.EnvironmentSlug,
				SecretPath:  destination.SecretsPath,
			})

			if err != nil {
				logger.Info(fmt.Sprintf("unable to delete secret [key=%s] [err=%s]", managedSecretKey, err))
				continue
			}
		}

	}

	return nil
}
