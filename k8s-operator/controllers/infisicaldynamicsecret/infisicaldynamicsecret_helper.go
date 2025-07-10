package controllers

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Infisical/infisical/k8-operator/api/v1alpha1"
	"github.com/Infisical/infisical/k8-operator/packages/api"
	"github.com/Infisical/infisical/k8-operator/packages/constants"
	"github.com/Infisical/infisical/k8-operator/packages/util"
	"github.com/go-logr/logr"
	"k8s.io/apimachinery/pkg/types"
	"sigs.k8s.io/controller-runtime/pkg/client"

	corev1 "k8s.io/api/core/v1"

	infisicalSdk "github.com/infisical/go-sdk"
	k8Errors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	ctrl "sigs.k8s.io/controller-runtime"
)

func (r *InfisicalDynamicSecretReconciler) createInfisicalManagedKubeSecret(ctx context.Context, logger logr.Logger, infisicalDynamicSecret v1alpha1.InfisicalDynamicSecret, versionAnnotationValue string) error {
	secretType := infisicalDynamicSecret.Spec.ManagedSecretReference.SecretType

	// copy labels and annotations from InfisicalSecret CRD
	labels := map[string]string{}
	for k, v := range infisicalDynamicSecret.Labels {
		labels[k] = v
	}

	annotations := map[string]string{}
	systemPrefixes := []string{"kubectl.kubernetes.io/", "kubernetes.io/", "k8s.io/", "helm.sh/"}
	for k, v := range infisicalDynamicSecret.Annotations {
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

	annotations[constants.SECRET_VERSION_ANNOTATION] = versionAnnotationValue

	// create a new secret as specified by the managed secret spec of CRD
	newKubeSecretInstance := &corev1.Secret{
		ObjectMeta: metav1.ObjectMeta{
			Name:        infisicalDynamicSecret.Spec.ManagedSecretReference.SecretName,
			Namespace:   infisicalDynamicSecret.Spec.ManagedSecretReference.SecretNamespace,
			Annotations: annotations,
			Labels:      labels,
		},
		Type: corev1.SecretType(secretType),
	}

	if infisicalDynamicSecret.Spec.ManagedSecretReference.CreationPolicy == "Owner" {
		// Set InfisicalSecret instance as the owner and controller of the managed secret
		err := ctrl.SetControllerReference(&infisicalDynamicSecret, newKubeSecretInstance, r.Scheme)
		if err != nil {
			return err
		}
	}

	err := r.Client.Create(ctx, newKubeSecretInstance)
	if err != nil {
		return fmt.Errorf("unable to create the managed Kubernetes secret : %w", err)
	}

	logger.Info(fmt.Sprintf("Successfully created a managed Kubernetes secret. [type: %s]", secretType))
	return nil
}

func (r *InfisicalDynamicSecretReconciler) handleAuthentication(ctx context.Context, infisicalSecret v1alpha1.InfisicalDynamicSecret, infisicalClient infisicalSdk.InfisicalClientInterface) (util.AuthenticationDetails, error) {
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
			Type:   util.SecretCrd.INFISICAL_DYNAMIC_SECRET,
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

func (r *InfisicalDynamicSecretReconciler) getInfisicalCaCertificateFromKubeSecret(ctx context.Context, infisicalSecret v1alpha1.InfisicalDynamicSecret) (caCertificate string, err error) {

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

func (r *InfisicalDynamicSecretReconciler) getResourceVariables(infisicalDynamicSecret v1alpha1.InfisicalDynamicSecret) util.ResourceVariables {

	var resourceVariables util.ResourceVariables

	if _, ok := infisicalDynamicSecretsResourceVariablesMap[string(infisicalDynamicSecret.UID)]; !ok {

		ctx, cancel := context.WithCancel(context.Background())

		client := infisicalSdk.NewInfisicalClient(ctx, infisicalSdk.Config{
			SiteUrl:       api.API_HOST_URL,
			CaCertificate: api.API_CA_CERTIFICATE,
			UserAgent:     api.USER_AGENT_NAME,
		})

		infisicalDynamicSecretsResourceVariablesMap[string(infisicalDynamicSecret.UID)] = util.ResourceVariables{
			InfisicalClient: client,
			CancelCtx:       cancel,
			AuthDetails:     util.AuthenticationDetails{},
		}

		resourceVariables = infisicalDynamicSecretsResourceVariablesMap[string(infisicalDynamicSecret.UID)]

	} else {
		resourceVariables = infisicalDynamicSecretsResourceVariablesMap[string(infisicalDynamicSecret.UID)]
	}

	return resourceVariables
}

func (r *InfisicalDynamicSecretReconciler) CreateDynamicSecretLease(ctx context.Context, logger logr.Logger, infisicalClient infisicalSdk.InfisicalClientInterface, infisicalDynamicSecret *v1alpha1.InfisicalDynamicSecret, destination *corev1.Secret) error {
	project, err := util.GetProjectByID(infisicalClient.Auth().GetAccessToken(), infisicalDynamicSecret.Spec.DynamicSecret.ProjectID)
	if err != nil {
		return err
	}

	request := infisicalSdk.CreateDynamicSecretLeaseOptions{
		DynamicSecretName: infisicalDynamicSecret.Spec.DynamicSecret.SecretName,
		ProjectSlug:       project.Slug,
		SecretPath:        infisicalDynamicSecret.Spec.DynamicSecret.SecretPath,
		EnvironmentSlug:   infisicalDynamicSecret.Spec.DynamicSecret.EnvironmentSlug,
	}

	if infisicalDynamicSecret.Spec.LeaseTTL != "" {
		request.TTL = infisicalDynamicSecret.Spec.LeaseTTL
	}

	leaseData, dynamicSecret, lease, err := infisicalClient.DynamicSecrets().Leases().Create(request)

	if err != nil {
		return fmt.Errorf("unable to create lease [err=%s]", err)
	}

	newLeaseStatus := &v1alpha1.InfisicalDynamicSecretLease{
		ID:                lease.Id,
		ExpiresAt:         metav1.NewTime(lease.ExpireAt),
		CreationTimestamp: metav1.NewTime(time.Now()),
		Version:           int64(lease.Version),
	}

	infisicalDynamicSecret.Status.DynamicSecretID = dynamicSecret.Id
	infisicalDynamicSecret.Status.MaxTTL = dynamicSecret.MaxTTL
	infisicalDynamicSecret.Status.Lease = newLeaseStatus

	// write the leaseData to the destination secret
	destinationData := map[string]string{}

	for key, value := range leaseData {
		if strValue, ok := value.(string); ok {
			destinationData[key] = strValue
		} else {
			return fmt.Errorf("unable to convert value to string for key %s", key)
		}
	}

	destination.StringData = destinationData
	destination.Annotations[constants.SECRET_VERSION_ANNOTATION] = fmt.Sprintf("%s-%d", lease.Id, lease.Version)

	if err := r.Client.Update(ctx, destination); err != nil {
		return fmt.Errorf("unable to update destination secret [err=%s]", err)
	}

	logger.Info(fmt.Sprintf("New lease successfully created [leaseId=%s]", lease.Id))
	return nil
}

func (r *InfisicalDynamicSecretReconciler) RenewDynamicSecretLease(ctx context.Context, logger logr.Logger, infisicalClient infisicalSdk.InfisicalClientInterface, infisicalDynamicSecret *v1alpha1.InfisicalDynamicSecret, destination *corev1.Secret) error {
	project, err := util.GetProjectByID(infisicalClient.Auth().GetAccessToken(), infisicalDynamicSecret.Spec.DynamicSecret.ProjectID)
	if err != nil {
		return err
	}

	request := infisicalSdk.RenewDynamicSecretLeaseOptions{
		LeaseId:         infisicalDynamicSecret.Status.Lease.ID,
		ProjectSlug:     project.Slug,
		SecretPath:      infisicalDynamicSecret.Spec.DynamicSecret.SecretPath,
		EnvironmentSlug: infisicalDynamicSecret.Spec.DynamicSecret.EnvironmentSlug,
	}

	if infisicalDynamicSecret.Spec.LeaseTTL != "" {
		request.TTL = infisicalDynamicSecret.Spec.LeaseTTL
	}

	lease, err := infisicalClient.DynamicSecrets().Leases().RenewById(request)

	if err != nil {

		if strings.Contains(err.Error(), "TTL cannot be larger than max ttl") || // Case 1: TTL is larger than the max TTL
			strings.Contains(err.Error(), "Dynamic secret lease with ID") { // Case 2: The lease has already expired and has been deleted
			return constants.ErrInvalidLease
		}

		return fmt.Errorf("unable to renew lease [err=%s]", err)
	}

	infisicalDynamicSecret.Status.Lease.ExpiresAt = metav1.NewTime(lease.ExpireAt)

	// update the infisicalDynamicSecret status
	if err := r.Client.Status().Update(ctx, infisicalDynamicSecret); err != nil {
		return fmt.Errorf("unable to update InfisicalDynamicSecret status [err=%s]", err)
	}

	logger.Info(fmt.Sprintf("Lease successfully renewed [leaseId=%s]", lease.Id))
	return nil

}

func (r *InfisicalDynamicSecretReconciler) updateResourceVariables(infisicalDynamicSecret v1alpha1.InfisicalDynamicSecret, resourceVariables util.ResourceVariables) {
	infisicalDynamicSecretsResourceVariablesMap[string(infisicalDynamicSecret.UID)] = resourceVariables
}

func (r *InfisicalDynamicSecretReconciler) HandleLeaseRevocation(ctx context.Context, logger logr.Logger, infisicalDynamicSecret *v1alpha1.InfisicalDynamicSecret) error {
	if infisicalDynamicSecret.Spec.LeaseRevocationPolicy != string(constants.DYNAMIC_SECRET_LEASE_REVOCATION_POLICY_ENABLED) {
		return nil
	}

	resourceVariables := r.getResourceVariables(*infisicalDynamicSecret)
	infisicalClient := resourceVariables.InfisicalClient

	logger.Info("Authenticating for lease revocation")
	authDetails, err := r.handleAuthentication(ctx, *infisicalDynamicSecret, infisicalClient)

	if err != nil {
		return fmt.Errorf("unable to authenticate for lease revocation [err=%s]", err)
	}

	r.updateResourceVariables(*infisicalDynamicSecret, util.ResourceVariables{
		InfisicalClient: infisicalClient,
		CancelCtx:       resourceVariables.CancelCtx,
		AuthDetails:     authDetails,
	})

	if infisicalDynamicSecret.Status.Lease == nil {
		return nil
	}

	project, err := util.GetProjectByID(infisicalClient.Auth().GetAccessToken(), infisicalDynamicSecret.Spec.DynamicSecret.ProjectID)

	if err != nil {
		return err
	}

	infisicalClient.DynamicSecrets().Leases().DeleteById(infisicalSdk.DeleteDynamicSecretLeaseOptions{
		LeaseId:         infisicalDynamicSecret.Status.Lease.ID,
		ProjectSlug:     project.Slug,
		SecretPath:      infisicalDynamicSecret.Spec.DynamicSecret.SecretPath,
		EnvironmentSlug: infisicalDynamicSecret.Spec.DynamicSecret.EnvironmentSlug,
	})

	// update the destination data to remove the lease data
	destination, err := util.GetKubeSecretByNamespacedName(ctx, r.Client, types.NamespacedName{
		Name:      infisicalDynamicSecret.Spec.ManagedSecretReference.SecretName,
		Namespace: infisicalDynamicSecret.Spec.ManagedSecretReference.SecretNamespace,
	})

	if err != nil {
		return fmt.Errorf("unable to fetch destination secret [err=%s]", err)
	}

	destination.Data = map[string][]byte{}

	if err := r.Client.Update(ctx, destination); err != nil {
		return fmt.Errorf("unable to update destination secret [err=%s]", err)
	}

	logger.Info(fmt.Sprintf("Lease successfully revoked [leaseId=%s]", infisicalDynamicSecret.Status.Lease.ID))

	return nil
}

func (r *InfisicalDynamicSecretReconciler) ReconcileInfisicalDynamicSecret(ctx context.Context, logger logr.Logger, infisicalDynamicSecret *v1alpha1.InfisicalDynamicSecret) (time.Duration, error) {

	resourceVariables := r.getResourceVariables(*infisicalDynamicSecret)
	infisicalClient := resourceVariables.InfisicalClient
	cancelCtx := resourceVariables.CancelCtx
	authDetails := resourceVariables.AuthDetails

	defaultNextReconcile := 5 * time.Second
	nextReconcile := defaultNextReconcile

	var err error

	if authDetails.AuthStrategy == "" {
		logger.Info("No authentication strategy found. Attempting to authenticate")
		authDetails, err = r.handleAuthentication(ctx, *infisicalDynamicSecret, infisicalClient)
		r.SetAuthenticatedConditionStatus(ctx, logger, infisicalDynamicSecret, err)

		if err != nil {
			return nextReconcile, fmt.Errorf("unable to authenticate [err=%s]", err)
		}

		r.updateResourceVariables(*infisicalDynamicSecret, util.ResourceVariables{
			InfisicalClient: infisicalClient,
			CancelCtx:       cancelCtx,
			AuthDetails:     authDetails,
		})
	}

	destination, err := util.GetKubeSecretByNamespacedName(ctx, r.Client, types.NamespacedName{
		Name:      infisicalDynamicSecret.Spec.ManagedSecretReference.SecretName,
		Namespace: infisicalDynamicSecret.Spec.ManagedSecretReference.SecretNamespace,
	})

	if err != nil {
		if k8Errors.IsNotFound(err) {

			annotationValue := ""
			if infisicalDynamicSecret.Status.Lease != nil {
				annotationValue = fmt.Sprintf("%s-%d", infisicalDynamicSecret.Status.Lease.ID, infisicalDynamicSecret.Status.Lease.Version)
			}

			r.createInfisicalManagedKubeSecret(ctx, logger, *infisicalDynamicSecret, annotationValue)

			destination, err = util.GetKubeSecretByNamespacedName(ctx, r.Client, types.NamespacedName{
				Name:      infisicalDynamicSecret.Spec.ManagedSecretReference.SecretName,
				Namespace: infisicalDynamicSecret.Spec.ManagedSecretReference.SecretNamespace,
			})

			if err != nil {
				return nextReconcile, fmt.Errorf("unable to fetch destination secret after creation [err=%s]", err)
			}

		} else {
			return nextReconcile, fmt.Errorf("unable to fetch destination secret")
		}
	}

	if infisicalDynamicSecret.Status.Lease == nil {
		err := r.CreateDynamicSecretLease(ctx, logger, infisicalClient, infisicalDynamicSecret, destination)
		r.SetCreatedLeaseConditionStatus(ctx, logger, infisicalDynamicSecret, err)

		return defaultNextReconcile, err // Short requeue after creation
	} else {
		now := time.Now()
		leaseExpiresAt := infisicalDynamicSecret.Status.Lease.ExpiresAt.Time

		// Calculate from creation to expiration
		originalLeaseDuration := leaseExpiresAt.Sub(infisicalDynamicSecret.Status.Lease.CreationTimestamp.Time)

		// Generate a random percentage between 20% and 30%
		jitterPercentage := 20 + r.Random.Intn(11) // Random int from 0 to 10, then add 20
		renewalThreshold := originalLeaseDuration * time.Duration(jitterPercentage) / 100
		timeUntilExpiration := time.Until(leaseExpiresAt)

		nextReconcile = timeUntilExpiration / 2

		// Max TTL
		if infisicalDynamicSecret.Status.MaxTTL != "" {
			maxTTLDuration, err := util.ConvertIntervalToDuration(&infisicalDynamicSecret.Status.MaxTTL)
			if err != nil {
				return defaultNextReconcile, fmt.Errorf("unable to parse MaxTTL duration: %w", err)
			}

			// Calculate when this dynamic secret will hit its max TTL
			maxTTLExpirationTime := infisicalDynamicSecret.Status.Lease.CreationTimestamp.Add(maxTTLDuration)

			// Calculate remaining time until max TTL
			timeUntilMaxTTL := maxTTLExpirationTime.Sub(now)
			maxTTLThreshold := maxTTLDuration * 40 / 100

			// If we have less than 40% of max TTL remaining or have exceeded it, create new lease
			if timeUntilMaxTTL <= maxTTLThreshold || now.After(maxTTLExpirationTime) {
				logger.Info(fmt.Sprintf("Approaching or exceeded max TTL [timeUntilMaxTTL=%v] [maxTTLThreshold=%v], creating new lease...",
					timeUntilMaxTTL,
					maxTTLThreshold))

				err := r.CreateDynamicSecretLease(ctx, logger, infisicalClient, infisicalDynamicSecret, destination)
				r.SetCreatedLeaseConditionStatus(ctx, logger, infisicalDynamicSecret, err)
				return defaultNextReconcile, err // Short requeue after creation
			}
		}

		// Fail-safe: If the lease has expired we create a new dynamic secret directly.
		if now.After(leaseExpiresAt) {
			logger.Info("Lease has expired, creating new lease...")
			err = r.CreateDynamicSecretLease(ctx, logger, infisicalClient, infisicalDynamicSecret, destination)
			r.SetCreatedLeaseConditionStatus(ctx, logger, infisicalDynamicSecret, err)
			return defaultNextReconcile, err // Short requeue after creation
		}

		if timeUntilExpiration < renewalThreshold || timeUntilExpiration < 30*time.Second {
			logger.Info(fmt.Sprintf("Lease renewal needed [leaseId=%s] [timeUntilExpiration=%v] [threshold=%v]",
				infisicalDynamicSecret.Status.Lease.ID,
				timeUntilExpiration,
				renewalThreshold))

			err = r.RenewDynamicSecretLease(ctx, logger, infisicalClient, infisicalDynamicSecret, destination)
			r.SetLeaseRenewalConditionStatus(ctx, logger, infisicalDynamicSecret, err)

			if err == constants.ErrInvalidLease {
				logger.Info("Failed to renew expired lease, creating new lease...")
				err = r.CreateDynamicSecretLease(ctx, logger, infisicalClient, infisicalDynamicSecret, destination)
				r.SetCreatedLeaseConditionStatus(ctx, logger, infisicalDynamicSecret, err)
			}
			return defaultNextReconcile, err // Short requeue after renewal/creation

		} else {
			logger.Info(fmt.Sprintf("Lease renewal not needed yet [leaseId=%s] [timeUntilExpiration=%v] [threshold=%v]",
				infisicalDynamicSecret.Status.Lease.ID,
				timeUntilExpiration,
				renewalThreshold))
		}

		// Small buffer (20% of the calculated time) to ensure we don't cut it too close
		nextReconcile = nextReconcile * 8 / 10

		// Minimum and maximum bounds for the reconcile interval (5 min max, 5 min minimum)
		nextReconcile = max(5*time.Second, min(nextReconcile, 5*time.Minute))
	}

	if err := r.Client.Status().Update(ctx, infisicalDynamicSecret); err != nil {
		return nextReconcile, fmt.Errorf("unable to update InfisicalDynamicSecret status [err=%s]", err)
	}

	return nextReconcile, nil
}
