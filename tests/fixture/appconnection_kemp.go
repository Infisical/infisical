package fixture

import (
	"bytes"
	"context"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/kemp"
)

// KempLoadMasterBasicAuthAppConnection is a Kemp LoadMaster App Connection that logs in with a username and password.
var KempLoadMasterBasicAuthAppConnection = AppConnectionKind{
	App:  "kemp-loadmaster",
	Host: kemp.Service.Host(),
	create: applianceConnection("kemp-loadmaster", kemp.Service.Host(), kemp.Password,
		func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error) {
			res, err := c.CreateKempLoadmasterAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(body))
			if err != nil {
				return 0, nil, err
			}
			return res.StatusCode(), res.Body, nil
		}),
}
