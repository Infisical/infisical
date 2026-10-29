package secretmanager

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// CreateWebhook subscribes a general webhook at url to every event at env and
// secretPath, and returns its ID. A test about the webhook's own options calls the
// route itself.
func CreateWebhook(tt *testing.T, p *fixture.Project, env, secretPath, url string) string {
	tt.Helper()
	res, err := p.Tenant().Admin.API.CreateWebhookWithResponse(tt.Context(), api.CreateWebhookJSONRequestBody{
		ProjectId:   p.ID,
		Environment: env,
		SecretPath:  &secretPath,
		WebhookUrl:  url,
	})
	require.NoErrorf(tt, err, "creating a webhook at %s:%s", env, secretPath)
	require.NotNilf(tt, res.JSON200, "creating a webhook at %s:%s returned %d: %s",
		env, secretPath, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Webhook.Id.String()
}
