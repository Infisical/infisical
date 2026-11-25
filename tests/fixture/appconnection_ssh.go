package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/linuxserver"
	"github.com/google/uuid"
)

// SSHPasswordAppConnection is an SSH App Connection to a Linux host, logging in with a
// username and password. The username is the credential the fake scopes the host by,
// and creating the connection logs in, so the host exists before Infisical first
// reaches it.
var SSHPasswordAppConnection = AppConnectionKind{
	App:    "ssh",
	Host:   linuxserver.Service.Host(),
	create: createSSHPasswordAppConnection,
	seed: func(tt *testing.T, adminURL, credential string) {
		tt.Helper()
		linuxserver.Open(tt, adminURL, credential).Seed(tt, linuxserver.WithDirectories("/home/"+credential))
	},
}

func createSSHPasswordAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := json.Marshal(map[string]any{
		"name":   name,
		"method": "password",
		"credentials": map[string]any{
			"host":     linuxserver.Service.Host(),
			"port":     linuxserver.Port,
			"username": credential,
			"password": linuxserver.Password(credential),
		},
	})
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreateSshAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	if res.StatusCode() != 200 {
		return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
	}
	return appConnectionID(res.Body, "ssh")
}
