package fixture

import (
	"bytes"
	"context"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/f5bigip"
)

// F5BigIpBasicAuthAppConnection is a F5 BIG-IP App Connection that logs in with a username and password.
var F5BigIpBasicAuthAppConnection = AppConnectionKind{
	App:  "f5-big-ip",
	Host: f5bigip.Service.Host(),
	create: applianceConnection("f5-big-ip", f5bigip.Service.Host(), f5bigip.Password,
		func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
			res, err := c.CreateF5BigIpAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
			if err != nil {
				return 0, nil, err
			}
			return res.StatusCode(), res.Body, nil
		}),
}
