package rotations_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Provider logic for AWS IAM user secrets only. The rotation plumbing is covered on
// PostgreSQL.

const (
	iamUser            = "app"
	accessKeyIDKey     = "AWS_ACCESS_KEY_ID"
	secretAccessKeyKey = "AWS_SECRET_ACCESS_KEY"
)

type iamEnv struct {
	tn   *harness.Tenant
	proj *fixture.Project
	conn *fixture.AppConnection
	cp   *aws.ControlPlane
}

// setupIAM returns a project, an AWS connection, and an account holding the IAM user a
// rotation takes over, with any access keys it already holds.
func setupIAM(t *testing.T, existingKeys ...string) iamEnv {
	t.Helper()
	tn := harness.From(t).NewTenant(t)
	conn := fixture.NewAppConnection(t, tn, fixture.AWSAccessKeyAppConnection)
	e := iamEnv{
		tn:   tn,
		proj: fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager")),
		conn: conn,
		cp:   aws.Open(t, conn.FakenetAdmin(t), conn.Nonce()),
	}
	e.cp.Seed(t, aws.SeedUser(iamUser, existingKeys...))
	return e
}

func (e iamEnv) newRotation(t *testing.T) uuid.UUID {
	t.Helper()
	body := api.CreateAWSIAMUserSecretRotationJSONRequestBody{
		Name:                  "rot-" + id.Short(),
		ProjectId:             e.proj.ID,
		ConnectionId:          e.conn.ID,
		Environment:           "dev",
		SecretPath:            "/",
		IsAutoRotationEnabled: new(false),
		RotationInterval:      1,
	}
	body.Parameters.UserName = iamUser
	body.SecretsMapping.AccessKeyId = accessKeyIDKey
	body.SecretsMapping.SecretAccessKey = secretAccessKeyKey
	res, err := e.tn.Admin.API.CreateAWSIAMUserSecretRotationWithResponse(t.Context(), body)
	require.NoError(t, err, "creating a rotation")
	require.NotNilf(t, res.JSON200, "creating a rotation returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.SecretRotation.Id
}

func (e iamEnv) rotate(t *testing.T, rotationID uuid.UUID) *api.RotateAWSIAMUserSecretRotationResponse {
	t.Helper()
	res, err := e.tn.Admin.API.RotateAWSIAMUserSecretRotationWithResponse(t.Context(), rotationID)
	require.NoError(t, err, "rotating")
	return res
}

func (e iamEnv) mustRotate(t *testing.T, rotationID uuid.UUID) view {
	t.Helper()
	res := e.rotate(t, rotationID)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return decode(t, res.Body)
}

func (e iamEnv) view(t *testing.T, rotationID uuid.UUID) view {
	t.Helper()
	res, err := e.tn.Admin.API.GetAWSIAMUserSecretRotationWithResponse(t.Context(), rotationID)
	require.NoError(t, err, "getting a rotation")
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return decode(t, res.Body)
}

func (e iamEnv) check(t *testing.T, rotationID uuid.UUID) *api.CheckAWSIAMUserSecretRotationCredentialsResponse {
	t.Helper()
	res, err := e.tn.Admin.API.CheckAWSIAMUserSecretRotationCredentialsWithResponse(t.Context(), rotationID)
	require.NoError(t, err, "checking credentials")
	return res
}

// published is the access key the mapped secrets hold.
func (e iamEnv) published(t *testing.T) aws.AccessKey {
	t.Helper()
	got := map[string]string{}
	for _, s := range secretmanager.ListSecrets(t, e.proj, "dev") {
		got[s.Key] = s.Value
	}
	require.Contains(t, got, accessKeyIDKey, "the mapped access key id is missing: %v", got)
	return aws.AccessKey{AccessKeyID: got[accessKeyIDKey], SecretAccessKey: got[secretAccessKeyKey]}
}

// liveKeys is the user's access keys at IAM, oldest first.
func (e iamEnv) liveKeys(t *testing.T) []aws.AccessKey {
	t.Helper()
	u := e.cp.User(t, iamUser)
	require.NotNil(t, u, "the IAM user is gone")
	out := make([]aws.AccessKey, 0, len(u.AccessKeys))
	for _, k := range u.AccessKeys {
		out = append(out, aws.AccessKey{AccessKeyID: k.AccessKeyID, SecretAccessKey: k.SecretAccessKey})
	}
	return out
}

func TestAwsIamUserSecretRotation_Rotate(t *testing.T) {
	t.Parallel()

	t.Run("should publish a new key, keep the previous one live, and delete the one before it on each rotation", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `IAM allows two keys a user, so the provider deletes the oldest before it
			creates the next. The oldest is the inactive slot's, never the published one.`)

		// Setup
		e := setupIAM(t)
		r := e.newRotation(t)
		first := e.published(t)

		// Action
		afterOne := e.mustRotate(t, r)
		second := e.published(t)
		keysAfterOne := e.liveKeys(t)
		afterTwo := e.mustRotate(t, r)

		// Assert
		require.Equal(t, 1, afterOne.ActiveIndex)
		require.Equal(t, []aws.AccessKey{first, second}, keysAfterOne)
		require.Equal(t, 0, afterTwo.ActiveIndex)
		third := e.published(t)
		require.Equal(t, []aws.AccessKey{second, third}, e.liveKeys(t))
	})

	t.Run("should delete the user's oldest key to make room when it already holds two at create", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setupIAM(t, "AKIAOLDEST"+id.Short(), "AKIANEWER"+id.Short())
		existing := e.liveKeys(t)

		// Action
		e.newRotation(t)

		// Assert
		require.Equal(t, []aws.AccessKey{existing[1], e.published(t)}, e.liveKeys(t))
	})

	t.Run("should answer 500, keep the published key live and lose only the inactive key when IAM refuses the new key", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `Today's behaviour, pinned so the planned fix finds it: a manual rotation
			failure is wrapped in an InternalServerError. The provider deletes the oldest key
			before it creates the next, so a refused create still costs the inactive key.`)

		// Setup
		e := setupIAM(t)
		r := e.newRotation(t)
		e.mustRotate(t, r)
		before := e.published(t)
		e.cp.Seed(t, aws.Deny(aws.IAM, "CreateAccessKey"))

		// Action
		res := e.rotate(t, r)

		// Assert
		requireStatus(t, http.StatusInternalServerError, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "iam:CreateAccessKey")
		require.Equal(t, before, e.published(t))
		require.Equal(t, []aws.AccessKey{before}, e.liveKeys(t))
		got := e.view(t, r)
		require.Equal(t, "failed", got.RotationStatus)
		require.Equal(t, 1, got.ActiveIndex)
	})
}

func TestAwsIamUserSecretRotation_CheckCredentials(t *testing.T) {
	t.Parallel()

	t.Run("should pass when STS accepts the published key", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setupIAM(t)
		r := e.newRotation(t)

		// Action
		res := e.check(t, r)

		// Assert
		requireStatus(t, http.StatusNoContent, res.StatusCode(), res.Body)
	})

	t.Run("should fail naming STS's refusal and leave the secrets when the published key was deleted in AWS", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setupIAM(t)
		r := e.newRotation(t)
		published := e.published(t)
		e.cp.Seed(t, aws.RemoveAccessKey(published.AccessKeyID))

		// Action
		res := e.check(t, r)

		// Assert
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, apierr.Body(res.Body), "Unable to validate credentials")
		require.Contains(t, apierr.Body(res.Body), "security token included in the request is invalid")
		require.Equal(t, published, e.published(t))
	})
}

func TestAwsIamUserSecretRotation_Delete(t *testing.T) {
	t.Parallel()

	t.Run("should delete both keys at IAM when deleted revoking the generated credentials", func(t *testing.T) {
		t.Parallel()

		// Setup
		e := setupIAM(t)
		r := e.newRotation(t)
		e.mustRotate(t, r)
		ds := api.DeleteAWSIAMUserSecretRotationParamsDeleteSecrets("false")
		rv := api.DeleteAWSIAMUserSecretRotationParamsRevokeGeneratedCredentials("true")

		// Action
		res, err := e.tn.Admin.API.DeleteAWSIAMUserSecretRotationWithResponse(t.Context(), r,
			&api.DeleteAWSIAMUserSecretRotationParams{DeleteSecrets: &ds, RevokeGeneratedCredentials: &rv})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Empty(t, e.liveKeys(t))
	})
}
