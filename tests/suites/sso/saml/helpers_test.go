package saml_test

import (
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture/sso"
	"github.com/Infisical/infisical/tests/harness"
)

func setup(t *testing.T, provider api.CreateSamlConfigJSONBodyAuthProvider) *sso.SAML {
	t.Helper()
	return sso.NewSAML(t, harness.From(t).NewTenant(t), provider)
}
