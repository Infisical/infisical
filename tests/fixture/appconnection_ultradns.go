package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/ultradns"
	"github.com/google/uuid"
)

// UltraDNSUsernamePasswordAppConnection is an UltraDNS App Connection to the production
// API as a user named by the credential. Creating it requests a token with
// ultraDNSPassword of the user, so the fake is given that password first.
var UltraDNSUsernamePasswordAppConnection = AppConnectionKind{
	App:  "ultradns",
	Host: ultradns.Service.Host(),
	seed: func(tt *testing.T, adminURL, credential string) {
		tt.Helper()
		ultradns.Open(tt, adminURL, credential).Seed(tt, ultradns.WithPassword(ultraDNSPassword(credential)))
	},
	create: createUltraDNSUsernamePasswordAppConnection,
}

// ultraDNSPassword is the password of a connection's user.
func ultraDNSPassword(username string) string { return "pw-" + username }

func createUltraDNSUsernamePasswordAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := json.Marshal(map[string]any{
		"name":   name,
		"method": "username-password",
		"credentials": map[string]any{
			"username":    credential,
			"password":    ultraDNSPassword(credential),
			"environment": "production",
		},
	})
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreateUltradnsAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	if res.JSON200 == nil {
		return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
	}
	return appConnectionID(res.Body, "ultradns")
}
