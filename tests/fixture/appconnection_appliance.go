package fixture

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/google/uuid"
)

// applianceConnection creates a connection to a device the customer hosts, reached by
// hostname on port 443 with a username and password. The username is the credential
// the fake is scoped by, and the password is the one the fake derives from it.
func applianceConnection(app string, host string, password func(string) string,
	post func(ctx context.Context, c *api.ClientWithResponses, body []byte) (int, []byte, error),
) func(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	return func(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
		raw, err := json.Marshal(map[string]any{
			"name":   name,
			"method": "basic-auth",
			"credentials": map[string]any{
				"hostname": host,
				"port":     443,
				"username": credential,
				"password": password(credential),
			},
		})
		if err != nil {
			return uuid.Nil, err
		}
		status, body, err := post(ctx, c, raw)
		if err != nil {
			return uuid.Nil, err
		}
		if status != 200 {
			return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", status, body)
		}
		return appConnectionID(body, app)
	}
}
