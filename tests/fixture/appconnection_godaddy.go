package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/godaddy"
	"github.com/google/uuid"
)

// GoDaddyAPIKeyAppConnection is a GoDaddy App Connection over an API key and secret.
// Creating it probes GET /v1/certificates/infisical-connection-validation on
// api.godaddy.com, which answers 404 for a key and secret that match.
var GoDaddyAPIKeyAppConnection = AppConnectionKind{
	App:    "godaddy",
	Host:   godaddy.Service.Host(),
	create: createGoDaddyAPIKeyAppConnection,
}

func createGoDaddyAPIKeyAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := json.Marshal(map[string]any{
		"name":        name,
		"method":      "api-key",
		"credentials": map[string]any{"apiKey": credential, "apiSecret": godaddy.APISecret(credential)},
	})
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreateGodaddyAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	if res.JSON200 == nil {
		return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
	}
	return appConnectionID(res.Body, "godaddy")
}
