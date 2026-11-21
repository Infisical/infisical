package externalkms_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func jsonBody(t *testing.T, v any) *bytes.Reader {
	t.Helper()
	raw, err := json.Marshal(v)
	require.NoError(t, err)
	return bytes.NewReader(raw)
}

func requireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "answered %d: %s", got, apierr.Body(body))
}

// requireOrgIDRequired is the refusal of an external ID that is not the organization's own,
// which tells the admin the value to use instead.
func requireOrgIDRequired(t *testing.T, tn *harness.Tenant, status int, body []byte) {
	t.Helper()
	requireStatus(t, http.StatusBadRequest, status, body)
	require.Contains(t, apierr.Message(body), "must be your organization ID ("+tn.OrgID.String()+")")
}

// customerRole seeds a customer's AWS account holding a KMS key and a role that trusts
// Infisical's account with the given external ID, as the KMS guide has customers set up.
func customerRole(t *testing.T, tn *harness.Tenant, externalID string) (roleArn, keyID string) {
	t.Helper()
	account := id.Nonce()
	keyID = uuid.NewString()
	aws.Open(t, fixture.FakenetAdmin(t, tn), account).Seed(t,
		aws.SeedRole(account, "infisical-kms", aws.TrustPolicy(aws.AccountID(instanceKey), externalID)),
		aws.SeedKey(keyID))
	return aws.RoleArn(account, "infisical-kms"), keyID
}

// infisicalSTS is what Infisical's own credential asked STS for. Call it before the
// action, so no AssumeRole the action makes is missed.
func infisicalSTS(t *testing.T, tn *harness.Tenant) *fakenet.Events {
	t.Helper()
	admin := fixture.FakenetAdmin(t, tn)
	fakenet.Track(t, admin, aws.STS.Host(), instanceKey)
	return fakenet.OpenEvents(admin, aws.STS.Host(), instanceKey)
}

func assumeRoleCredential(roleArn, externalID string) map[string]any {
	data := map[string]any{"assumeRoleArn": roleArn}
	if externalID != "" {
		data["externalId"] = externalID
	}
	return map[string]any{"type": "assume-role", "data": data}
}

func createAWSKMS(t *testing.T, actor *harness.Principal, roleArn, externalID, keyID string) *api.CreateAwsExternalKmsResponse {
	t.Helper()
	res, err := actor.API.CreateAwsExternalKmsWithBodyWithResponse(t.Context(), "application/json", jsonBody(t, map[string]any{
		"name": "kms-" + id.Short(),
		"configuration": map[string]any{
			"awsRegion":  aws.Region,
			"kmsKeyId":   keyID,
			"credential": assumeRoleCredential(roleArn, externalID),
		},
	}))
	require.NoError(t, err)
	return res
}

func kmsID(t *testing.T, body []byte) string {
	t.Helper()
	var out struct {
		ID string `json:"id"`
	}
	require.NoError(t, json.Unmarshal(body, &out))
	require.NotEmpty(t, out.ID, "%s", body)
	return out.ID
}

type assumeRole struct {
	RoleArn    string
	ExternalID string
}

// storedAssumeRole is the role and external ID an external KMS holds, as its admin reads
// them back.
func storedAssumeRole(t *testing.T, actor *harness.Principal, kmsID string) assumeRole {
	t.Helper()
	res, err := actor.API.GetAwsExternalKmsWithResponse(t.Context(), kmsID)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	var out struct {
		ExternalKms struct {
			Configuration struct {
				Credential struct {
					Data struct {
						AssumeRoleArn string `json:"assumeRoleArn"`
						ExternalID    string `json:"externalId"`
					} `json:"data"`
				} `json:"credential"`
			} `json:"configuration"`
		} `json:"externalKms"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &out))
	data := out.ExternalKms.Configuration.Credential.Data
	return assumeRole{RoleArn: data.AssumeRoleArn, ExternalID: data.ExternalID}
}

func externalKMSCount(t *testing.T, actor *harness.Principal) int {
	t.Helper()
	res, err := actor.API.ListExternalKmsWithResponse(t.Context())
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
	return len(res.JSON200.ExternalKmsList)
}
