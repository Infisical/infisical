package fixture

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// AppConnectionKind is one app and auth method an App Connection can be created with.
type AppConnectionKind struct {
	// App is the name in errors and the /api/v1/app-connections/<app> segment.
	App string

	// Host is what the app's client has hardcoded, taken from its fake. It has to be
	// hardcoded for the test to mean anything: a configurable base URL could be
	// pointed straight at fakenet, which would prove the fake works and nothing about
	// interception.
	Host string

	create func(ctx context.Context, c *api.ClientWithResponses, name, credential string) (uuid.UUID, error)

	// seed prepares the fake for a credential before Infisical first uses it, for an
	// app whose credential check needs state the fake cannot invent, such as the
	// account a token belongs to.
	seed func(tt *testing.T, adminURL, credential string)
}

// AppConnection is one connection and the credential its fake state is keyed on.
type AppConnection struct {
	ID   uuid.UUID
	Name string

	nonce string
	tn    *harness.Tenant
}

func NewAppConnection(tt *testing.T, tn *harness.Tenant, kind AppConnectionKind) *AppConnection {
	tt.Helper()

	conn := &AppConnection{
		Name:  kind.App + "-" + id.Short(),
		nonce: id.Nonce(),
		tn:    tn,
	}

	// Before the credential reaches Infisical, so nothing published under it can
	// arrive before its buffer exists.
	fakenet.Track(tt, FakenetAdmin(tt, tn), kind.Host, conn.nonce)
	if kind.seed != nil {
		kind.seed(tt, FakenetAdmin(tt, tn), conn.nonce)
	}

	connID, err := kind.create(tt.Context(), tn.Admin.API, conn.Name, conn.nonce)
	require.NoErrorf(tt, err, "creating a %s connection\n%s", kind.App, deniedHint(tt, tn))
	conn.ID = connID
	return conn
}

// deniedHint names the outbound calls that reached no fake, which the application's
// own error rarely does.
func deniedHint(tt *testing.T, tn *harness.Tenant) string {
	h, ok := tn.Module(tt, fakenet.Key, "harness.Shared").(*fakenet.Handle)
	if !ok {
		return ""
	}
	denied, err := h.Denied(context.WithoutCancel(tt.Context()))
	if err != nil || len(denied) == 0 {
		return ""
	}
	out := "Outbound calls that reached no fake:\n"
	for _, d := range denied {
		out += "  " + d.Method + " " + d.URL + ": " + d.Reason + "\n"
	}
	return out
}

func (c *AppConnection) Nonce() string { return c.nonce }

func (c *AppConnection) FakenetAdmin(tt *testing.T) string {
	tt.Helper()
	return FakenetAdmin(tt, c.tn)
}

// FakenetAdmin is fakenet's control URL, for a test that drives a fake before any
// connection exists. A URL rather than a handle so fake packages never import fixtures.
func FakenetAdmin(tt *testing.T, tn *harness.Tenant) string {
	tt.Helper()
	return tn.Module(tt, fakenet.Key, "harness.Shared").(*fakenet.Handle).AdminURL()
}

// appConnectionID reads the new connection's id from a create response. It reads the
// body rather than the generated union, whose As… methods accept any branch and so
// would hand back a zero id instead of an error.
func appConnectionID(body []byte, app string) (uuid.UUID, error) {
	var out struct {
		AppConnection struct {
			ID  uuid.UUID `json:"id"`
			App string    `json:"app"`
		} `json:"appConnection"`
	}
	if err := json.Unmarshal(body, &out); err != nil {
		return uuid.Nil, err
	}
	if out.AppConnection.App != app || out.AppConnection.ID == uuid.Nil {
		return uuid.Nil, fmt.Errorf("creating the connection returned an unexpected body: %s", body)
	}
	return out.AppConnection.ID, nil
}
