package fixture

import (
	"bytes"
	"context"
	"encoding/json"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/azure"
	"github.com/google/uuid"
)

// AzureKeyVaultClientSecretAppConnection is an Azure Key Vault App Connection over an
// app registration's client secret. Its client id, AzureClientID of the credential, is
// what the tenant's token endpoint names in the token it mints and what Key Vault scopes
// its vaults by. Creating it requests a token from login.microsoftonline.com; drive the
// vaults with azure.OpenKeyVault(t, conn.FakenetAdmin(t), fixture.AzureClientID(conn.Nonce())).
var AzureKeyVaultClientSecretAppConnection = AppConnectionKind{
	App:    "azure-key-vault",
	Host:   azure.Service.Host(),
	create: createAzureKeyVaultClientSecretAppConnection,
}

// AzureClientID is the app registration a connection's credential names. Azure ids are
// UUIDs, which the connection requires, so it is derived from the credential.
func AzureClientID(credential string) string {
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte("azure-client/"+credential)).String()
}

func azureTenantID(credential string) string {
	return uuid.NewSHA1(uuid.NameSpaceURL, []byte("azure-tenant/"+credential)).String()
}

func createAzureKeyVaultClientSecretAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
	raw, err := json.Marshal(map[string]any{
		"name":   name,
		"method": "client-secret",
		"credentials": map[string]any{
			"tenantId":     azureTenantID(credential),
			"clientId":     AzureClientID(credential),
			"clientSecret": "secret-" + credential,
		},
	})
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreateAzureKeyVaultAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	return appConnectionID(res.Body, "azure-key-vault")
}
