package fixture

import (
	"bytes"
	"context"
	"encoding/json"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/imperva"
	"github.com/google/uuid"
)

// ImpervaAPIKeyAppConnection is an Imperva App Connection over an API ID and key. The
// API ID is the credential, and the key is the one the fake derives from it. Creating
// it lists websites on api.imperva.com; uploads go to my.imperva.com. Drive both with
// imperva.Open(t, conn.FakenetAdmin(t), conn.Nonce()).
var ImpervaAPIKeyAppConnection = AppConnectionKind{
	App:    "imperva",
	Host:   imperva.REST.Host(),
	create: createImpervaAPIKeyAppConnection,
}

func createImpervaAPIKeyAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := json.Marshal(map[string]any{
		"name":   name,
		"method": "api-key",
		"credentials": map[string]any{
			"apiId":  credential,
			"apiKey": imperva.APIKey(credential),
		},
	})
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreateImpervaAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	return appConnectionID(res.Body, "imperva")
}
