package fixture

import (
	"bytes"
	"context"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/panos"
)

// PaloAltoNetworksBasicAuthAppConnection is a Palo Alto Networks App Connection that
// generates its API key from a username and password.
var PaloAltoNetworksBasicAuthAppConnection = AppConnectionKind{
	App:  "palo-alto-networks",
	Host: panos.Service.Host(),
	create: applianceConnection("palo-alto-networks", panos.Service.Host(), panos.Password,
		func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
			res, err := c.CreatePaloAltoNetworksAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
			if err != nil {
				return 0, nil, err
			}
			return res.StatusCode(), res.Body, nil
		}),
}
