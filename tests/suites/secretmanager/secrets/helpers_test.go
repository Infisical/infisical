package secrets_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// The generated bodies declare metadata as an anonymous struct; an identical alias is
// assignable to it.
type secretMetadataEntry = struct {
	IsEncrypted *bool   `json:"isEncrypted,omitempty"`
	Key         string  `json:"key"`
	Value       *string `json:"value,omitempty"`
}

func newTag(t *testing.T, proj *fixture.Project, slug string) string {
	t.Helper()
	res, err := proj.Tenant().Admin.API.CreateSecretTagWithResponse(t.Context(), proj.ID,
		api.CreateSecretTagJSONRequestBody{Slug: slug, Color: "#2563eb"})
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating tag %s returned %d: %s", slug, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.Tag.Id.String()
}
