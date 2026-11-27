package fixture

import (
	"bytes"
	"context"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/netscaler"
)

// NetScalerBasicAuthAppConnection is a NetScaler App Connection that logs in with a username and password.
var NetScalerBasicAuthAppConnection = AppConnectionKind{
	App:  "netscaler",
	Host: netscaler.Service.Host(),
	create: applianceConnection("netscaler", netscaler.Service.Host(), netscaler.Password,
		func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
			res, err := c.CreateNetscalerAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
			if err != nil {
				return 0, nil, err
			}
			return res.StatusCode(), res.Body, nil
		}),
}
