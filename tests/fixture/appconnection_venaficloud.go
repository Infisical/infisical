package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/venaficloud"
	"github.com/google/uuid"
)

// VenafiCloudAPIKeyAppConnection is a Venafi TLS Protect Cloud App Connection over an
// API key in the US region. Creating it calls GET /v1/useraccounts on api.venafi.cloud.
var VenafiCloudAPIKeyAppConnection = AppConnectionKind{
	App:    "venafi",
	Host:   venaficloud.Service.Host(),
	create: createVenafiCloudAPIKeyAppConnection,
}

func createVenafiCloudAPIKeyAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := json.Marshal(map[string]any{
		"name":        name,
		"method":      "api-key",
		"credentials": map[string]any{"apiKey": credential, "region": "us"},
	})
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreateVenafiAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	if res.JSON200 == nil {
		return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
	}
	return appConnectionID(res.Body, "venafi")
}
