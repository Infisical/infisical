package secretmanager

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// Location is one folder in one environment, the unit an import reads from.
type Location struct {
	Env  string
	Path string
}

type ImportOption func(*importConfig)

type importConfig struct {
	path        string
	source      *fixture.Project
	replication bool
	as          []SecretOption
}

// IntoPath places the import in a folder other than the project root.
func IntoPath(p string) ImportOption { return func(c *importConfig) { c.path = p } }

// FromProject reads from another project's folder, which needs a folder grant.
func FromProject(source *fixture.Project) ImportOption {
	return func(c *importConfig) { c.source = source }
}

// Replicated copies the source secrets into the destination instead of reading them
// through.
func Replicated() ImportOption { return func(c *importConfig) { c.replication = true } }

// ImportAs creates the import as another principal.
func ImportAs(opts ...SecretOption) ImportOption { return func(c *importConfig) { c.as = opts } }

// CreateImport makes env's folder import from. It returns the import's ID.
func CreateImport(tt *testing.T, p *fixture.Project, env string, from Location, opts ...ImportOption) string {
	tt.Helper()
	cfg := importConfig{path: "/"}
	for _, o := range opts {
		o(&cfg)
	}
	_, client := resolve(p, cfg.as)

	body := api.CreateSecretImportJSONRequestBody{
		ProjectId:   p.ID,
		Environment: env,
		Path:        &cfg.path,
	}
	body.Import.Environment = from.Env
	body.Import.Path = from.Path
	if cfg.source != nil {
		body.Import.SourceProjectId = &cfg.source.ID
	}
	if cfg.replication {
		body.IsReplication = &cfg.replication
	}

	res, err := client.CreateSecretImportWithResponse(tt.Context(), body)
	require.NoErrorf(tt, err, "importing %s:%s into %s:%s", from.Env, from.Path, env, cfg.path)
	require.NotNilf(tt, res.JSON200, "importing %s:%s into %s:%s returned %d: %s",
		from.Env, from.Path, env, cfg.path, res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.SecretImport.Id.String()
}
