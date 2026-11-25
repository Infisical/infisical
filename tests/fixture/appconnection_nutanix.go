package fixture

import (
	"bytes"
	"context"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/nutanix"
)

// NutanixPrismCentralBasicAuthAppConnection is a Nutanix Prism Central App Connection
// that logs in with a username and password. Basic auth rather than an API key
// because the key must be 32 hex characters, which leaves no room for the nonce.
var NutanixPrismCentralBasicAuthAppConnection = AppConnectionKind{
	App:  "nutanix-prism-central",
	Host: nutanix.Service.Host(),
	create: applianceConnection("nutanix-prism-central", nutanix.Service.Host(), nutanix.Password,
		func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
			res, err := c.CreateNutanixPrismCentralAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
			if err != nil {
				return 0, nil, err
			}
			return res.StatusCode(), res.Body, nil
		}),
}
