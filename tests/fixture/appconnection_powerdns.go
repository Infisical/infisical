package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/powerdns"
	"github.com/google/uuid"
)

// PowerDNSAPIKeyAppConnection is a PowerDNS App Connection over the server's API key.
// A PowerDNS server is self-hosted, so the API URL is the fake's fixed .test name.
// Creating it lists the server's zones, so the fake is told to accept the key first.
var PowerDNSAPIKeyAppConnection = AppConnectionKind{
	App:  "powerdns",
	Host: powerdns.Service.Host(),
	seed: func(tt *testing.T, adminURL, credential string) {
		tt.Helper()
		powerdns.Open(tt, adminURL, credential).Seed(tt, powerdns.WithKeyAccepted())
	},
	create: createPowerDNSAPIKeyAppConnection,
}

func createPowerDNSAPIKeyAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := json.Marshal(map[string]any{
		"name":   name,
		"method": "api-key",
		"credentials": map[string]any{
			"apiUrl": "https://" + powerdns.Service.Host(),
			"apiKey": credential,
		},
	})
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreatePowerdnsAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	if res.JSON200 == nil {
		return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
	}
	return appConnectionID(res.Body, "powerdns")
}
