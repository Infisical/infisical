package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/digicert"
	"github.com/google/uuid"
)

// DigiCertAPIKeyAppConnection is a DigiCert App Connection over a CertCentral API key in
// the US region. Creating it calls GET /services/v2/organization on www.digicert.com.
var DigiCertAPIKeyAppConnection = AppConnectionKind{
	App:    "digicert",
	Host:   digicert.Service.Host(),
	create: createDigiCertAPIKeyAppConnection,
}

func createDigiCertAPIKeyAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := json.Marshal(map[string]any{
		"name":        name,
		"method":      "api-key",
		"credentials": map[string]any{"apiKey": credential, "region": "us"},
	})
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreateDigicertAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	if res.JSON200 == nil {
		return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
	}
	return appConnectionID(res.Body, "digicert")
}
