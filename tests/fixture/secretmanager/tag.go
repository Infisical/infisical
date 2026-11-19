package secretmanager

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// CreateTag creates a tag in the project and returns its ID, which is what secret
// bodies take.
func CreateTag(tt *testing.T, p *fixture.Project, slug string, opts ...SecretOption) string {
	tt.Helper()
	_, client := resolve(p, opts)

	res, err := client.CreateSecretTagWithResponse(tt.Context(), p.ID,
		api.CreateSecretTagJSONRequestBody{Slug: slug, Color: "#2563eb"})
	require.NoErrorf(tt, err, "creating tag %s", slug)
	require.NotNilf(tt, res.JSON200, "creating tag %s returned %d: %s", slug, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Tag.Id.String()
}
