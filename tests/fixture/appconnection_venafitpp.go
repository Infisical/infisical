package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/venafitpp"
	"github.com/google/uuid"
)

// VenafiTppOAuthAppConnection is a Venafi TPP App Connection over OAuth with a username
// and password. The TPP URL is the fake's server for the connection's own scope, and
// creating the connection takes a token from /vedauth/authorize/oauth and revokes it.
var VenafiTppOAuthAppConnection = AppConnectionKind{
	App:    "venafi-tpp",
	Host:   venafitpp.Service.Host(),
	create: createVenafiTppOAuthAppConnection,
}

func createVenafiTppOAuthAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := json.Marshal(map[string]any{
		"name":   name,
		"method": "oauth",
		"credentials": map[string]any{
			"tppUrl":   venafitpp.URL(credential),
			"clientId": "infisical",
			"username": credential,
			"password": venafitpp.Password(credential),
		},
	})
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreateVenafiTppAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	if res.JSON200 == nil {
		return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
	}
	return appConnectionID(res.Body, "venafi-tpp")
}
