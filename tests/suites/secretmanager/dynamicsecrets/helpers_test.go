package dynamicsecrets_test

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

// Suite-local until a second package creates a dynamic secret; then it moves to
// fixture/secretmanager.

const totpSecret = "JBSWY3DPEHPK3PXP"

type provider map[string]any

func totpProvider() provider {
	return provider{"type": "totp", "inputs": map[string]any{"configType": "manual", "secret": totpSecret}}
}

// The statements quote the name so a generated name with a hyphen is one identifier. The
// revocation has no IF EXISTS on purpose: a role dropped behind Infisical's back then
// fails the revoke, which is how a test makes one fail.
func postgresInputs(target *fixture.PostgresTarget) map[string]any {
	return map[string]any{
		"client":              "postgres",
		"host":                target.Host,
		"port":                target.Port,
		"database":            target.Database,
		"username":            target.User,
		"password":            target.Password,
		"creationStatement":   `CREATE ROLE "{{username}}" WITH LOGIN PASSWORD '{{password}}' VALID UNTIL '{{expiration}}';`,
		"revocationStatement": `DROP ROLE "{{username}}";`,
	}
}

func postgresProvider(target *fixture.PostgresTarget) provider {
	return provider{"type": "sql-database", "inputs": postgresInputs(target)}
}

func sshProvider() provider {
	return provider{"type": "ssh", "inputs": map[string]any{"principals": []string{"deploy"}}}
}

type dsConfig struct {
	name             string
	env              string
	path             string
	defaultTTL       string
	maxTTL           string
	usernameTemplate string
	metadata         map[string]string
}

type dsOption func(*dsConfig)

func atPath(p string) dsOption           { return func(c *dsConfig) { c.path = p } }
func defaultTTL(ttl string) dsOption     { return func(c *dsConfig) { c.defaultTTL = ttl } }
func maxTTL(ttl string) dsOption         { return func(c *dsConfig) { c.maxTTL = ttl } }
func usernameTemplate(t string) dsOption { return func(c *dsConfig) { c.usernameTemplate = t } }
func named(n string) dsOption            { return func(c *dsConfig) { c.name = n } }

func withMetadata(key, value string) dsOption {
	return func(c *dsConfig) {
		if c.metadata == nil {
			c.metadata = map[string]string{}
		}
		c.metadata[key] = value
	}
}

type dynamicSecret struct {
	ID   string
	Name string
	env  string
	path string
	proj *fixture.Project
}

func newConfig(opts []dsOption) dsConfig {
	cfg := dsConfig{name: "ds-" + id.Short(), env: "dev", path: "/", defaultTTL: "1h"}
	for _, o := range opts {
		o(&cfg)
	}
	return cfg
}

// createDynamicSecret sends the create as raw JSON: the provider is a union, which
// the generated body type cannot marshal (docs/client.md).
func createDynamicSecret(tt *testing.T, c *api.ClientWithResponses, p *fixture.Project, prov provider,
	opts ...dsOption) (*api.CreateDynamicSecretResponse, dsConfig) {
	tt.Helper()
	cfg := newConfig(opts)
	body := map[string]any{
		"projectSlug":     p.Slug,
		"environmentSlug": cfg.env,
		"path":            cfg.path,
		"name":            cfg.name,
		"provider":        prov,
		"defaultTTL":      cfg.defaultTTL,
	}
	if cfg.maxTTL != "" {
		body["maxTTL"] = cfg.maxTTL
	}
	if cfg.usernameTemplate != "" {
		body["usernameTemplate"] = cfg.usernameTemplate
	}
	if len(cfg.metadata) > 0 {
		var md []map[string]string
		for k, v := range cfg.metadata {
			md = append(md, map[string]string{"key": k, "value": v})
		}
		body["metadata"] = md
	}
	raw, err := json.Marshal(body)
	require.NoError(tt, err)
	res, err := c.CreateDynamicSecretWithBodyWithResponse(tt.Context(), "application/json", bytes.NewReader(raw))
	require.NoError(tt, err, "creating a dynamic secret")
	return res, cfg
}

func newDynamicSecret(tt *testing.T, p *fixture.Project, prov provider, opts ...dsOption) *dynamicSecret {
	tt.Helper()
	res, cfg := createDynamicSecret(tt, p.Tenant().Admin.API, p, prov, opts...)
	require.NotNilf(tt, res.JSON200, "creating a dynamic secret returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return &dynamicSecret{ID: res.JSON200.DynamicSecret.Id.String(), Name: cfg.name, env: cfg.env, path: cfg.path, proj: p}
}

func (d *dynamicSecret) get(tt *testing.T, c *api.ClientWithResponses) *api.GetDynamicSecretResponse {
	tt.Helper()
	res, err := c.GetDynamicSecretWithResponse(tt.Context(), d.Name, &api.GetDynamicSecretParams{
		ProjectSlug: d.proj.Slug, EnvironmentSlug: d.env, Path: &d.path,
	})
	require.NoError(tt, err, "getting a dynamic secret")
	return res
}

func (d *dynamicSecret) inputs(tt *testing.T) map[string]any {
	tt.Helper()
	res := d.get(tt, d.proj.Tenant().Admin.API)
	require.NotNilf(tt, res.JSON200, "getting a dynamic secret returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	in, ok := res.JSON200.DynamicSecret.Inputs.(map[string]any)
	require.True(tt, ok, "the inputs are not an object: %v", res.JSON200.DynamicSecret.Inputs)
	return in
}

func (d *dynamicSecret) update(tt *testing.T, data map[string]any) *api.UpdateDynamicSecretResponse {
	tt.Helper()
	raw, err := json.Marshal(map[string]any{
		"projectSlug": d.proj.Slug, "environmentSlug": d.env, "path": d.path, "data": data,
	})
	require.NoError(tt, err)
	res, err := d.proj.Tenant().Admin.API.UpdateDynamicSecretWithBodyWithResponse(tt.Context(), d.Name,
		"application/json", bytes.NewReader(raw))
	require.NoError(tt, err, "updating a dynamic secret")
	return res
}

func (d *dynamicSecret) delete(tt *testing.T, forced bool) *api.DeleteDynamicSecretResponse {
	tt.Helper()
	res, err := d.proj.Tenant().Admin.API.DeleteDynamicSecretWithResponse(tt.Context(), d.Name,
		api.DeleteDynamicSecretJSONRequestBody{
			ProjectSlug: d.proj.Slug, EnvironmentSlug: d.env, Path: &d.path, IsForced: &forced,
		})
	require.NoError(tt, err, "deleting a dynamic secret")
	return res
}

type lease struct {
	ID        string
	ExpireAt  time.Time
	CreatedAt time.Time
	Data      map[string]any
}

func (d *dynamicSecret) requestLease(tt *testing.T, c *api.ClientWithResponses, ttl string) *api.CreateDynamicSecretLeaseResponse {
	tt.Helper()
	body := api.CreateDynamicSecretLeaseJSONRequestBody{
		DynamicSecretName: d.Name, ProjectSlug: d.proj.Slug, EnvironmentSlug: d.env, Path: &d.path,
	}
	if ttl != "" {
		body.Ttl = &ttl
	}
	res, err := c.CreateDynamicSecretLeaseWithResponse(tt.Context(), body)
	require.NoError(tt, err, "requesting a lease")
	return res
}

func (d *dynamicSecret) lease(tt *testing.T, as *harness.Principal, ttl string) lease {
	tt.Helper()
	c := d.proj.Tenant().Admin.API
	if as != nil {
		c = as.API
	}
	res := d.requestLease(tt, c, ttl)
	require.NotNilf(tt, res.JSON200, "requesting a lease returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	data, _ := res.JSON200.Data.(map[string]any)
	l := res.JSON200.Lease
	return lease{ID: l.Id.String(), ExpireAt: l.ExpireAt, CreatedAt: l.CreatedAt, Data: data}
}

func (d *dynamicSecret) getLease(tt *testing.T, leaseID, path string) *api.GetDynamicSecretLeaseResponse {
	tt.Helper()
	res, err := d.proj.Tenant().Admin.API.GetDynamicSecretLeaseWithResponse(tt.Context(), leaseID,
		&api.GetDynamicSecretLeaseParams{ProjectSlug: d.proj.Slug, EnvironmentSlug: d.env, Path: &path})
	require.NoError(tt, err, "getting a lease")
	return res
}

func (d *dynamicSecret) revoke(tt *testing.T, c *api.ClientWithResponses, leaseID string, forced bool) *api.RevokeDynamicSecretLeaseResponse {
	tt.Helper()
	res, err := c.RevokeDynamicSecretLeaseWithResponse(tt.Context(), leaseID, api.RevokeDynamicSecretLeaseJSONRequestBody{
		ProjectSlug: d.proj.Slug, EnvironmentSlug: d.env, Path: &d.path, IsForced: &forced,
	})
	require.NoError(tt, err, "revoking a lease")
	return res
}

func (d *dynamicSecret) renew(tt *testing.T, leaseID, ttl string) *api.RenewDynamicSecretLeaseResponse {
	tt.Helper()
	res, err := d.proj.Tenant().Admin.API.RenewDynamicSecretLeaseWithResponse(tt.Context(), leaseID,
		api.RenewDynamicSecretLeaseJSONRequestBody{ProjectSlug: d.proj.Slug, EnvironmentSlug: d.env, Path: &d.path, Ttl: &ttl})
	require.NoError(tt, err, "renewing a lease")
	return res
}

func (d *dynamicSecret) leaseIDs(tt *testing.T) []string {
	tt.Helper()
	res, err := d.proj.Tenant().Admin.API.ListDynamicSecretLeasesWithResponse(tt.Context(), d.Name,
		&api.ListDynamicSecretLeasesParams{ProjectSlug: d.proj.Slug, EnvironmentSlug: d.env, Path: &d.path})
	require.NoError(tt, err, "listing leases")
	require.NotNilf(tt, res.JSON200, "listing leases returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	ids := []string{}
	for _, l := range res.JSON200.Leases {
		ids = append(ids, l.Id.String())
	}
	return ids
}

// names lists the dynamic secrets at a path, as the administrator sees them.
func names(tt *testing.T, p *fixture.Project, path string) []string {
	tt.Helper()
	res, err := p.Tenant().Admin.API.ListDynamicSecretsWithResponse(tt.Context(), &api.ListDynamicSecretsParams{
		ProjectSlug: p.Slug, EnvironmentSlug: "dev", Path: &path,
	})
	require.NoError(tt, err, "listing dynamic secrets")
	require.NotNilf(tt, res.JSON200, "listing dynamic secrets returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	out := []string{}
	for _, ds := range res.JSON200.DynamicSecrets {
		out = append(out, ds.Name)
	}
	return out
}

func credentials(tt *testing.T, l lease) (username, password string) {
	tt.Helper()
	username, _ = l.Data["DB_USERNAME"].(string)
	password, _ = l.Data["DB_PASSWORD"].(string)
	require.NotEmpty(tt, username, "the lease carries no DB_USERNAME: %v", l.Data)
	require.NotEmpty(tt, password, "the lease carries no DB_PASSWORD")
	return username, password
}

// totpCodes are the codes RFC 6238 gives for the steps either side of now, so a lease
// issued at a step boundary still matches.
func totpCodes(tt *testing.T, secret string) []string {
	tt.Helper()
	key, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(secret)
	require.NoError(tt, err)
	step := time.Now().Unix() / 30
	var codes []string
	for _, s := range []int64{step - 1, step, step + 1} {
		msg := make([]byte, 8)
		binary.BigEndian.PutUint64(msg, uint64(s))
		mac := hmac.New(sha1.New, key)
		mac.Write(msg)
		sum := mac.Sum(nil)
		off := sum[len(sum)-1] & 0x0f
		code := binary.BigEndian.Uint32(sum[off:off+4]) & 0x7fffffff
		codes = append(codes, fmt.Sprintf("%06d", code%1_000_000))
	}
	return codes
}

func requireStatus(tt *testing.T, want int, got int, body []byte) {
	tt.Helper()
	require.Equalf(tt, want, got, "%s", apierr.Body(body))
}
