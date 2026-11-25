package fixture

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/chef"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// ChefUserKeyAppConnection is a Chef App Connection over a user's client key, on
// api.chef.io (no server URL). The user name is the credential, so the fake scopes
// the user by it; the fake is given the user's public key and organization
// (ChefOrganization) first, and checks every signed request against it. A kind per
// connection because the key is generated here and both halves are used.
func ChefUserKeyAppConnection(tt *testing.T) AppConnectionKind {
	tt.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	require.NoError(tt, err)
	der, err := x509.MarshalPKIXPublicKey(&key.PublicKey)
	require.NoError(tt, err)
	publicPEM := string(pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der}))
	privatePEM := string(pem.EncodeToMemory(&pem.Block{Type: "RSA PRIVATE KEY", Bytes: x509.MarshalPKCS1PrivateKey(key)}))
	return AppConnectionKind{
		App:  "chef",
		Host: chef.Service.Host(),
		create: func(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
			return createChefUserKeyAppConnection(ctx, c, name, credential, privatePEM)
		},
		seed: func(tt *testing.T, adminURL, credential string) {
			tt.Helper()
			chef.Open(tt, adminURL, credential).Seed(tt, chef.WithUser(ChefOrganization(credential), publicPEM))
		},
	}
}

// ChefOrganization is the organization a connection's user belongs to.
func ChefOrganization(userName string) string { return "org-" + userName }

func createChefUserKeyAppConnection(ctx context.Context, c *api.ClientWithResponses, name, credential, privateKeyPEM string) (uuid.UUID, error) {
	raw, err := json.Marshal(map[string]any{
		"name":   name,
		"method": "user-key",
		"credentials": map[string]any{
			"orgName":    ChefOrganization(credential),
			"userName":   credential,
			"privateKey": privateKeyPEM,
		},
	})
	if err != nil {
		return uuid.Nil, err
	}
	res, err := c.CreateChefAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
	if err != nil {
		return uuid.Nil, err
	}
	return appConnectionID(res.Body, "chef")
}
