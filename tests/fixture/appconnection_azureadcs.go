package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/azureadcs"
	"github.com/google/uuid"
)

// AzureADCSPasswordAppConnection is an Azure AD CS App Connection over a username and
// password. The ADCS URL is the fake's server for the connection's own scope, and
// creating the connection signs in to certsrv/certrqus.asp over NTLM.
var AzureADCSPasswordAppConnection = AppConnectionKind{
	App:    "azure-adcs",
	Host:   azureadcs.Service.Host(),
	create: createAzureADCSPasswordAppConnection,
}

func createAzureADCSPasswordAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := json.Marshal(map[string]any{
		"name":   name,
		"method": "username-password",
		"credentials": map[string]any{
			"adcsUrl":  azureadcs.URL(credential),
			"username": credential,
			"password": azureadcs.Password(credential),
		},
	})
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreateAzureAdcsAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	if res.JSON200 == nil {
		return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
	}
	return appConnectionID(res.Body, "azure-adcs")
}
