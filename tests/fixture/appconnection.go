package fixture

import (
	"context"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/provider"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// AppConnection is one connection and the credential its fake state is keyed on.
type AppConnection struct {
	ID       uuid.UUID
	Name     string
	Provider provider.Provider

	nonce string
	tn    *harness.Tenant
}

type AppConnectionOption func(*appConnectionConfig)

type appConnectionConfig struct {
	rejectWith int
}

// RejectCredentials makes the provider refuse the credential check, so the create
// fails. Proves the check is load bearing rather than merely made.
func RejectCredentials(status int) AppConnectionOption {
	return func(c *appConnectionConfig) { c.rejectWith = status }
}

func NewAppConnection(tt *testing.T, tn *harness.Tenant, p provider.Provider, opts ...AppConnectionOption) *AppConnection {
	tt.Helper()
	conn, err := TryAppConnection(tt, tn, p, opts...)
	require.NoErrorf(tt, err, "creating a %s connection\n%s", p.App, deniedHint(tt, tn))
	return conn
}

// TryAppConnection is NewAppConnection without failing, for an expected refusal.
func TryAppConnection(tt *testing.T, tn *harness.Tenant, p provider.Provider, opts ...AppConnectionOption) (*AppConnection, error) {
	tt.Helper()

	var cfg appConnectionConfig
	for _, o := range opts {
		o(&cfg)
	}

	conn := &AppConnection{
		Name:     p.App + "-" + id.Short(),
		Provider: p,
		nonce:    id.Nonce(),
		tn:       tn,
	}

	// Before the credential reaches Infisical, so nothing published under it can
	// arrive before its buffer exists.
	fakenet.Track(tt, conn.FakenetAdmin(tt), p.Host, conn.nonce)

	if cfg.rejectWith != 0 {
		fakenet.Open[any](tt, conn.FakenetAdmin(tt), p.Host, conn.nonce).
			Fail(tt, "", "*", cfg.rejectWith)
	}

	connID, err := p.Create(tt.Context(), tn.Admin.API, conn.Name, conn.nonce)
	if err != nil {
		return nil, err
	}
	conn.ID = connID
	return conn, nil
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

// FakenetAdmin is a URL rather than a handle so fake packages never import fixtures.
func (c *AppConnection) FakenetAdmin(tt *testing.T) string {
	tt.Helper()
	return c.tn.Module(tt, fakenet.Key, "harness.Shared").(*fakenet.Handle).AdminURL()
}
