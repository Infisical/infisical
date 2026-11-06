package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/cloudflare"
	"github.com/google/uuid"
)

// CloudflareAPITokenAppConnection is a Cloudflare App Connection over an API token.
// Creating it calls GET /client/v4/accounts/<id> on api.cloudflare.com, so the fake
// is told which account the token belongs to first: CloudflareAccountID of the token.
var CloudflareAPITokenAppConnection = AppConnectionKind{
	App:    "cloudflare",
	Host:   cloudflare.Service.Host(),
	create: createCloudflareAPITokenAppConnection,
	seed: func(tt *testing.T, adminURL, credential string) {
		tt.Helper()
		cloudflare.Open(tt, adminURL, credential).Seed(tt, cloudflare.WithAccount(CloudflareAccountID(credential)))
	},
}

// CloudflareAccountID is the account a connection's API token belongs to.
func CloudflareAccountID(apiToken string) string { return "acct-" + apiToken }

func createCloudflareAPITokenAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := json.Marshal(map[string]any{
		"name":   name,
		"method": "api-token",
		"credentials": map[string]any{
			"apiToken":  credential,
			"accountId": CloudflareAccountID(credential),
		},
	})
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreateCloudflareAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	if res.JSON200 == nil {
		return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
	}
	return appConnectionID(res.Body, "cloudflare")
}
