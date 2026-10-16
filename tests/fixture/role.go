package fixture

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// Permission is one rule of a project role. It is sent as raw JSON because the generated
// body cannot express it; see docs/client.md.
type Permission struct {
	Subject    string         `json:"subject"`
	Action     []string       `json:"action"`
	Conditions map[string]any `json:"conditions,omitempty"`
	Inverted   bool           `json:"inverted,omitempty"`
}

// NewRole creates a custom project role. Hand its slug to WithRoles or Grant.
func (p *Project) NewRole(tt *testing.T, slug string, permissions ...Permission) {
	tt.Helper()

	body, err := json.Marshal(map[string]any{"slug": slug, "name": slug, "permissions": permissions})
	require.NoError(tt, err)
	res, err := p.tn.Admin.API.CreateProjectRoleWithBodyWithResponse(tt.Context(), p.ID,
		"application/json", bytes.NewReader(body))
	require.NoErrorf(tt, err, "creating role %s in %s", slug, p.Slug)
	require.Equalf(tt, http.StatusOK, res.StatusCode(), "creating role %s in %s: %s",
		slug, p.Slug, apierr.Body(res.Body))
}
