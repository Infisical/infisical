package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/servicenow"
	"github.com/google/uuid"
)

// ServiceNowBasicAuthAppConnection is a ServiceNow App Connection over an integration
// user's basic auth, the only method ServiceNow connections have.
//
// The instance URL is the one exception to taking a hardcoded host: every customer
// supplies their own, so the client has none. It still names a real service-now.com
// instance rather than fakenet's address, so the call reaches the fake only through
// fakenet's DNS and CA, the same as every other kind.
var ServiceNowBasicAuthAppConnection = AppConnectionKind{
	App:    "servicenow",
	Host:   servicenow.Service.Host(),
	create: createServiceNowBasicAuthAppConnection,
}

func createServiceNowBasicAuthAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	var branch api.CreateServiceNowAppConnectionJSONBody0
	branch.Method = api.CreateServiceNowAppConnectionJSONBody0MethodBasicAuth
	branch.Credentials.InstanceUrl = "https://" + servicenow.Service.Host()
	branch.Credentials.Username = credential
	branch.Credentials.Password = "harness-password"

	// Marshalled by hand because the request-body type does not inherit the union's
	// MarshalJSON, so the typed body would serialise as {}.
	var body api.CreateServiceNowAppConnectionJSONBody
	if err := body.FromCreateServiceNowAppConnectionJSONBody0(branch); err != nil {
		return uuid.Nil, err
	}
	body.Name = name
	raw, err := json.Marshal(body)
	if err != nil {
		return uuid.Nil, err
	}

	res, err := c.CreateServiceNowAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	if res.JSON200 == nil {
		return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
	}
	conn, err := res.JSON200.AppConnection.AsCreateServiceNowAppConnection200JSONResponseBodyAppConnection0()
	if err != nil {
		return uuid.Nil, err
	}
	return conn.Id, nil
}
