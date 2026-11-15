package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/vercel"
	"github.com/google/uuid"
)

// VercelAPITokenAppConnection is a Vercel App Connection over an API token, the only
// method Vercel connections have. Creating it calls GET /v2/user on api.vercel.com,
// which the fake answers, so a working connection also proves interception.
var VercelAPITokenAppConnection = AppConnectionKind{
	App:    "vercel",
	Host:   vercel.Service.Host(),
	create: createVercelAPITokenAppConnection,
}

func createVercelAPITokenAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := json.Marshal(map[string]any{
		"name":        name,
		"method":      "api-token",
		"credentials": map[string]any{"apiToken": credential},
	})
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreateVercelAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	if res.JSON200 == nil {
		return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
	}

	// Read the id from the body: the generated response is a union whose As… methods
	// accept any branch, so a wrong one would hand back a zero id instead of an error.
	var out struct {
		AppConnection struct {
			ID  uuid.UUID `json:"id"`
			App string    `json:"app"`
		} `json:"appConnection"`
	}
	if err := json.Unmarshal(res.Body, &out); err != nil {
		return uuid.Nil, err
	}
	if out.AppConnection.App != "vercel" || out.AppConnection.ID == uuid.Nil {
		return uuid.Nil, fmt.Errorf("creating the connection returned an unexpected body: %s", res.Body)
	}
	return out.AppConnection.ID, nil
}
