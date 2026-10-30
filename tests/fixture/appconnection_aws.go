package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/google/uuid"
)

// AWSAccessKeyAppConnection is an AWS App Connection over an IAM access key.
//
// Access key rather than assume-role because assume-role needs the instance's own AWS
// credentials to call STS AssumeRole, which the harness does not configure. The access
// key id is the nonce, so the fake scopes the account by it, and the secret is the one
// the fake derives from it, so every request Infisical signs is checked.
//
// Host is STS, the call that validates the credential. Drive the account's other
// services with aws.Open(t, conn.FakenetAdmin(t), conn.Nonce()).
var AWSAccessKeyAppConnection = AppConnectionKind{
	App:    "aws",
	Host:   aws.STS.Host(),
	create: createAWSAccessKeyAppConnection,
}

func createAWSAccessKeyAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := AWSAccessKeyAppConnectionBody(name, credential, aws.SecretAccessKey(credential))
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreateAwsAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	var out struct {
		AppConnection struct {
			ID uuid.UUID `json:"id"`
		} `json:"appConnection"`
	}
	if res.StatusCode() != http.StatusOK || json.Unmarshal(res.Body, &out) != nil || out.AppConnection.ID == uuid.Nil {
		return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
	}
	return out.AppConnection.ID, nil
}

// AWSAccessKeyAppConnectionBody is the create request, for a test that calls the route
// itself, such as one about a refused secret.
func AWSAccessKeyAppConnectionBody(name, accessKeyID, secretAccessKey string) ([]byte, error) {
	return json.Marshal(map[string]any{
		"name":   name,
		"method": "access-key",
		"credentials": map[string]string{
			"accessKeyId":     accessKeyID,
			"secretAccessKey": secretAccessKey,
		},
	})
}
