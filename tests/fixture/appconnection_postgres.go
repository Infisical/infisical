package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/google/uuid"
)

// PostgresAppConnection is a PostgreSQL App Connection over username and password, as
// the target's superuser.
//
// A function rather than a variable because the host is the target container, not a
// hostname a client hardcodes: there is no fake in between, and Infisical dials the
// database itself.
func PostgresAppConnection(target *PostgresTarget) AppConnectionKind {
	return AppConnectionKind{
		App:  "postgres",
		Host: target.Host,
		create: func(ctx context.Context, c *api.ClientWithResponses, name, _ string) (uuid.UUID, error) {
			raw, err := json.Marshal(map[string]any{
				"name":   name,
				"method": "username-and-password",
				"credentials": map[string]any{
					"host":                  target.Host,
					"port":                  target.Port,
					"database":              target.Database,
					"username":              target.User,
					"password":              target.Password,
					"sslEnabled":            false,
					"sslRejectUnauthorized": false,
				},
			})
			if err != nil {
				return uuid.Nil, err
			}
			res, err := c.CreatePostgresAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
			if err != nil {
				return uuid.Nil, err
			}
			var out struct {
				AppConnection struct {
					ID uuid.UUID `json:"id"`
				} `json:"appConnection"`
			}
			if res.StatusCode() != 200 || json.Unmarshal(res.Body, &out) != nil || out.AppConnection.ID == uuid.Nil {
				return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
			}
			return out.AppConnection.ID, nil
		},
	}
}
