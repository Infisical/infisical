package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/dnsmadeeasy"
	"github.com/google/uuid"
)

// DNSMadeEasyAPIKeyAppConnection is a DNS Made Easy App Connection over an API key and
// secret. Creating it calls GET /V2.0/dns/managed/ on api.dnsmadeeasy.com, signed with
// the secret, so the fake is given the secret first: DNSMadeEasySecretKey of the key.
var DNSMadeEasyAPIKeyAppConnection = AppConnectionKind{
	App:    "dns-made-easy",
	Host:   dnsmadeeasy.Service.Host(),
	create: createDNSMadeEasyAPIKeyAppConnection,
	seed: func(tt *testing.T, adminURL, credential string) {
		tt.Helper()
		dnsmadeeasy.Open(tt, adminURL, credential).Seed(tt, dnsmadeeasy.WithSecretKey(DNSMadeEasySecretKey(credential)))
	},
}

// DNSMadeEasySecretKey is the secret paired with a connection's API key.
func DNSMadeEasySecretKey(apiKey string) string { return "secret-" + apiKey }

func createDNSMadeEasyAPIKeyAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := json.Marshal(map[string]any{
		"name":   name,
		"method": "api-key-secret",
		"credentials": map[string]any{
			"apiKey":    credential,
			"secretKey": DNSMadeEasySecretKey(credential),
		},
	})
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreateDnsMadeEasyAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	if res.JSON200 == nil {
		return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
	}
	return appConnectionID(res.Body, "dns-made-easy")
}
