package rotations_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// Suite-local until a second package creates a rotation; then it moves to
// fixture/secretmanager.

const (
	usernameKey = "PG_USERNAME"
	passwordKey = "PG_PASSWORD"
)

// role is a database user the rotation alternates between, with the password it was
// created with.
type role struct{ name, password string }

type env struct {
	tn     *harness.Tenant
	proj   *fixture.Project
	target *fixture.PostgresTarget
	conn   *fixture.AppConnection
	users  [2]role
}

// setup returns a project, a connection to the target as its superuser, and two
// database users for a rotation to take over.
func setup(t *testing.T, opts ...harness.TenantOption) env {
	t.Helper()
	tn := harness.From(t).NewTenant(t, opts...)
	target := fixture.OpenPostgresTarget(t, tn)
	e := env{
		tn:     tn,
		proj:   fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager")),
		target: target,
		conn:   fixture.NewAppConnection(t, tn, fixture.PostgresAppConnection(target)),
	}
	for i := range e.users {
		name, password := target.NewRole(t)
		e.users[i] = role{name, password}
	}
	return e
}

type rotationConfig struct {
	name      string
	path      string
	usernames [2]string
	mapping   [2]string
	auto      bool
	interval  float32
	rotateAt  *[2]int
}

type rotationOption func(*rotationConfig)

func rotationName(n string) rotationOption { return func(c *rotationConfig) { c.name = n } }
func atPath(p string) rotationOption       { return func(c *rotationConfig) { c.path = p } }
func usernames(a, b string) rotationOption {
	return func(c *rotationConfig) { c.usernames = [2]string{a, b} }
}
func mapping(u, p string) rotationOption {
	return func(c *rotationConfig) { c.mapping = [2]string{u, p} }
}

// autoRotate is off by default, so the midnight cron never touches a test's rotation.
func autoRotate(intervalDays float32, hours, minutes int) rotationOption {
	return func(c *rotationConfig) {
		c.auto = true
		c.interval = intervalDays
		c.rotateAt = &[2]int{hours, minutes}
	}
}

func (e env) body(opts []rotationOption) api.CreatePostgreSQLCredentialsRotationJSONRequestBody {
	cfg := rotationConfig{
		name:      "rot-" + id.Short(),
		path:      "/",
		usernames: [2]string{e.users[0].name, e.users[1].name},
		mapping:   [2]string{usernameKey, passwordKey},
		interval:  1,
	}
	for _, o := range opts {
		o(&cfg)
	}
	body := api.CreatePostgreSQLCredentialsRotationJSONRequestBody{
		Name:                  cfg.name,
		ProjectId:             e.proj.ID,
		ConnectionId:          e.conn.ID,
		Environment:           "dev",
		SecretPath:            cfg.path,
		IsAutoRotationEnabled: &cfg.auto,
		RotationInterval:      cfg.interval,
	}
	body.Parameters.Username1 = cfg.usernames[0]
	body.Parameters.Username2 = cfg.usernames[1]
	body.SecretsMapping.Username = cfg.mapping[0]
	body.SecretsMapping.Password = cfg.mapping[1]
	if cfg.rotateAt != nil {
		body.RotateAtUtc = &struct {
			Hours   float32 `json:"hours"`
			Minutes float32 `json:"minutes"`
		}{Hours: float32(cfg.rotateAt[0]), Minutes: float32(cfg.rotateAt[1])}
	}
	return body
}

func (e env) create(t *testing.T, opts ...rotationOption) *api.CreatePostgreSQLCredentialsRotationResponse {
	t.Helper()
	res, err := e.tn.Admin.API.CreatePostgreSQLCredentialsRotationWithResponse(t.Context(), e.body(opts))
	require.NoError(t, err, "creating a rotation")
	return res
}

type rotation struct {
	ID   uuid.UUID
	Name string
	e    env
}

func (e env) newRotation(t *testing.T, opts ...rotationOption) *rotation {
	t.Helper()
	res := e.create(t, opts...)
	require.NotNilf(t, res.JSON200, "creating a rotation returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return &rotation{ID: res.JSON200.SecretRotation.Id, Name: res.JSON200.SecretRotation.Name, e: e}
}

// view is the part of a rotation the tests read. Decoded from the body because each
// route's generated response is its own anonymous struct.
type view struct {
	ID                  uuid.UUID  `json:"id"`
	Name                string     `json:"name"`
	Description         *string    `json:"description"`
	ActiveIndex         int        `json:"activeIndex"`
	RotationStatus      string     `json:"rotationStatus"`
	LastRotationMessage *string    `json:"lastRotationMessage"`
	LastRotatedAt       time.Time  `json:"lastRotatedAt"`
	NextRotationAt      *time.Time `json:"nextRotationAt"`
	RotationInterval    int        `json:"rotationInterval"`
	SecretsMapping      struct {
		Username string `json:"username"`
		Password string `json:"password"`
	} `json:"secretsMapping"`
	Folder struct {
		Path string `json:"path"`
	} `json:"folder"`
}

func decode(t *testing.T, body []byte) view {
	t.Helper()
	var out struct {
		SecretRotation view `json:"secretRotation"`
	}
	require.NoError(t, json.Unmarshal(body, &out), "decoding a rotation: %s", body)
	return out.SecretRotation
}

func (r *rotation) get(t *testing.T) *api.GetPostgreSQLCredentialsRotationResponse {
	t.Helper()
	res, err := r.e.tn.Admin.API.GetPostgreSQLCredentialsRotationWithResponse(t.Context(), r.ID)
	require.NoError(t, err, "getting a rotation")
	return res
}

func (r *rotation) view(t *testing.T) view {
	t.Helper()
	res := r.get(t)
	require.NotNilf(t, res.JSON200, "getting a rotation returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return decode(t, res.Body)
}

func (r *rotation) rotate(t *testing.T) *api.RotatePostgreSQLCredentialsRotationResponse {
	t.Helper()
	res, err := r.e.tn.Admin.API.RotatePostgreSQLCredentialsRotationWithResponse(t.Context(), r.ID)
	require.NoError(t, err, "rotating")
	return res
}

func (r *rotation) mustRotate(t *testing.T) view {
	t.Helper()
	res := r.rotate(t)
	require.NotNilf(t, res.JSON200, "rotating returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return decode(t, res.Body)
}

func (r *rotation) generated(t *testing.T, c *api.ClientWithResponses) *api.GetPostgreSQLCredentialsRotationGeneratedCredentialsResponse {
	t.Helper()
	res, err := c.GetPostgreSQLCredentialsRotationGeneratedCredentialsWithResponse(t.Context(), r.ID)
	require.NoError(t, err, "reading generated credentials")
	return res
}

func (r *rotation) check(t *testing.T, c *api.ClientWithResponses) *api.CheckPostgreSQLCredentialsRotationCredentialsResponse {
	t.Helper()
	res, err := c.CheckPostgreSQLCredentialsRotationCredentialsWithResponse(t.Context(), r.ID)
	require.NoError(t, err, "checking credentials")
	return res
}

func (r *rotation) update(t *testing.T, body api.UpdatePostgreSQLCredentialsRotationJSONRequestBody) *api.UpdatePostgreSQLCredentialsRotationResponse {
	t.Helper()
	res, err := r.e.tn.Admin.API.UpdatePostgreSQLCredentialsRotationWithResponse(t.Context(), r.ID, body)
	require.NoError(t, err, "updating a rotation")
	return res
}

func (r *rotation) move(t *testing.T, c *api.ClientWithResponses, path string) *api.MovePostgreSQLCredentialsRotationResponse {
	t.Helper()
	res, err := c.MovePostgreSQLCredentialsRotationWithResponse(t.Context(), r.ID,
		api.MovePostgreSQLCredentialsRotationJSONRequestBody{DestinationEnvironment: "dev", DestinationSecretPath: path})
	require.NoError(t, err, "moving a rotation")
	return res
}

func (r *rotation) delete(t *testing.T, deleteSecrets, revoke bool) *api.DeletePostgreSQLCredentialsRotationResponse {
	t.Helper()
	ds := api.DeletePostgreSQLCredentialsRotationParamsDeleteSecrets(boolString(deleteSecrets))
	rv := api.DeletePostgreSQLCredentialsRotationParamsRevokeGeneratedCredentials(boolString(revoke))
	res, err := r.e.tn.Admin.API.DeletePostgreSQLCredentialsRotationWithResponse(t.Context(), r.ID,
		&api.DeletePostgreSQLCredentialsRotationParams{DeleteSecrets: &ds, RevokeGeneratedCredentials: &rv})
	require.NoError(t, err, "deleting a rotation")
	return res
}

func boolString(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// list is the rotations the administrator can see in the project.
func (e env) list(t *testing.T) *api.ListPostgreSQLCredentialsRotationsResponse {
	t.Helper()
	res, err := e.tn.Admin.API.ListPostgreSQLCredentialsRotationsWithResponse(t.Context(),
		&api.ListPostgreSQLCredentialsRotationsParams{ProjectId: e.proj.ID})
	require.NoError(t, err, "listing rotations")
	return res
}

func (e env) rotationNames(t *testing.T) []string {
	t.Helper()
	res := e.list(t)
	require.NotNilf(t, res.JSON200, "listing rotations returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	out := []string{}
	for _, r := range res.JSON200.SecretRotations {
		out = append(out, r.Name)
	}
	return out
}

// secretsAt is what an application reading the folder gets.
func (e env) secretsAt(t *testing.T, path string) map[string]string {
	t.Helper()
	out := map[string]string{}
	for _, s := range secretmanager.ListSecrets(t, e.proj, "dev", secretmanager.WithPath(path)) {
		out[s.Key] = s.Value
	}
	return out
}

// published is the credential the mapped secrets hold.
func (e env) published(t *testing.T, path string) role {
	t.Helper()
	got := e.secretsAt(t, path)
	require.Contains(t, got, usernameKey, "the mapped username secret is missing: %v", got)
	require.Contains(t, got, passwordKey, "the mapped password secret is missing")
	return role{got[usernameKey], got[passwordKey]}
}

func (e env) requireLogsIn(t *testing.T, r role, msg string) {
	t.Helper()
	require.NoErrorf(t, e.target.Login(t, r.name, r.password), "%s: %s does not log in", msg, r.name)
}

func (e env) requireRefused(t *testing.T, r role, msg string) {
	t.Helper()
	require.Errorf(t, e.target.Login(t, r.name, r.password), "%s: %s still logs in", msg, r.name)
}

func requireStatus(t *testing.T, want, got int, body []byte) {
	t.Helper()
	require.Equalf(t, want, got, "%s", apierr.Body(body))
}
