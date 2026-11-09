package fixture

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// AWSLaunchStackProvisioning is what a connection records about a role created with
// Launch Stack. Pass overrides to change or add a field; a nil value removes it.
func AWSLaunchStackProvisioning(overrides map[string]any) map[string]any {
	provisioning := map[string]any{
		"launchMethod":    "launch-stack",
		"useCases":        []string{"secrets-manager"},
		"stackName":       "infisical-aws-app-connection",
		"partition":       "aws",
		"templateVersion": "1",
		"region":          "eu-west-1",
		"roleName":        "infisical-app-connection",
	}
	for k, v := range overrides {
		if v == nil {
			delete(provisioning, k)
			continue
		}
		provisioning[k] = v
	}
	return provisioning
}

// NewAWSAppConnectionWithConfiguration creates an access key AWS connection carrying the
// given configuration, at org scope or, with a project ID, in that project.
//
// Access key because assume-role cannot be created here (see AWSAccessKeyAppConnection).
// The configuration is stored whatever the method, so a test about how a role was
// provisioned reads the same either way.
func NewAWSAppConnectionWithConfiguration(tt *testing.T, tn *harness.Tenant, projectID string, configuration map[string]any) uuid.UUID {
	tt.Helper()

	accessKeyID := id.Nonce()
	fakenet.Track(tt, FakenetAdmin(tt, tn), aws.STS.Host(), accessKeyID)
	body := map[string]any{
		"name":   "aws-" + id.Short(),
		"method": "access-key",
		"credentials": map[string]string{
			"accessKeyId":     accessKeyID,
			"secretAccessKey": aws.SecretAccessKey(accessKeyID),
		},
	}
	if projectID != "" {
		body["projectId"] = projectID
	}
	if configuration != nil {
		body["configuration"] = configuration
	}
	raw, err := json.Marshal(body)
	require.NoError(tt, err)

	res, err := tn.Admin.API.CreateAwsAppConnectionWithBodyWithResponse(tt.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(tt, err)
	var out struct {
		AppConnection struct {
			ID uuid.UUID `json:"id"`
		} `json:"appConnection"`
	}
	require.Equal(tt, http.StatusOK, res.StatusCode(), fmt.Sprintf("creating the connection: %s", res.Body))
	require.NoError(tt, json.Unmarshal(res.Body, &out))
	return out.AppConnection.ID
}
