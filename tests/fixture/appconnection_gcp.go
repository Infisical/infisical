package fixture

import (
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/oauth"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/google/uuid"
)

// GCPServiceAccountAppConnection is a GCP App Connection impersonating a service account
// of the tenant's, GCPServiceAccountEmail of the credential. A kind per tenant because
// Infisical only accepts an account whose id ends with the organization's id prefix.
// Creating it has the instance impersonate the account through
// iamcredentials.googleapis.com; drive what it reaches with
// oauth.OpenGCP(t, conn.FakenetAdmin(t), fixture.GCPServiceAccountEmail(tn, conn.Nonce())).
func GCPServiceAccountAppConnection(tn *harness.Tenant) AppConnectionKind {
	return AppConnectionKind{
		App:  "gcp",
		Host: oauth.GCPIAMCredentials.Host(),
		// The IAM scope is the service account email, not the credential, and creating
		// the connection already publishes under it.
		seed: func(tt *testing.T, adminURL, credential string) {
			fakenet.Track(tt, adminURL, oauth.GCPIAMCredentials.Host(), GCPServiceAccountEmail(tn, credential))
		},
		create: func(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error) {
			raw, err := json.Marshal(map[string]any{
				"name":        name,
				"method":      "service-account-impersonation",
				"credentials": map[string]any{"serviceAccountEmail": GCPServiceAccountEmail(tn, credential)},
			})
			if err != nil {
				return uuid.Nil, err
			}
			res, err := c.CreateGcpAppConnectionWithBodyWithResponse(ctx, "application/json", bytes.NewReader(raw))
			if err != nil {
				return uuid.Nil, err
			}
			return appConnectionID(res.Body, "gcp")
		},
	}
}

// GCPServiceAccountEmail is the service account a connection's credential names.
func GCPServiceAccountEmail(tn *harness.Tenant, credential string) string {
	orgPrefix := strings.Join(strings.Split(tn.OrgID.String(), "-")[:2], "-")
	return "sa-" + credential + "-" + orgPrefix + "@harness-gcp.iam.gserviceaccount.com"
}
