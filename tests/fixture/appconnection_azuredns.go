package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/azure"
	"github.com/google/uuid"
)

// AzureDNSClientSecretAppConnection is an Azure DNS App Connection over an app
// registration's client secret. Its client id, AzureClientID of the credential, is what
// the tenant's token endpoint names in the token it mints and what Resource Manager
// scopes its zones by. Creating it lists the zones of AzureSubscriptionID of the
// credential on management.azure.com, so the fake is given that subscription first;
// drive the zones with azure.OpenDNS(t, conn.FakenetAdmin(t), fixture.AzureClientID(conn.Nonce())).
var AzureDNSClientSecretAppConnection = AppConnectionKind{
	App:  "azure-dns",
	Host: azure.DNS.Host(),
	seed: func(tt *testing.T, adminURL, credential string) {
		tt.Helper()
		azure.OpenDNS(tt, adminURL, AzureClientID(credential)).Seed(tt, azure.WithSubscription(AzureSubscriptionID(credential)))
	},
	create: createAzureDNSClientSecretAppConnection,
}

// AzureSubscriptionID is the subscription a connection's credential names.
func AzureSubscriptionID(credential string) string {
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte("azure-subscription/"+credential)).String()
}

func createAzureDNSClientSecretAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := json.Marshal(map[string]any{
		"name":   name,
		"method": "client-secret",
		"credentials": map[string]any{
			"tenantId":       azureTenantID(credential),
			"clientId":       AzureClientID(credential),
			"clientSecret":   "secret-" + credential,
			"subscriptionId": AzureSubscriptionID(credential),
		},
	})
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreateAzureDnsAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	if res.JSON200 == nil {
		return uuid.Nil, fmt.Errorf("creating the connection returned %d: %s", res.StatusCode(), res.Body)
	}
	return appConnectionID(res.Body, "azure-dns")
}
