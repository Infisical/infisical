package fixture

import (
	"context"
	"fmt"
	"net/url"
	"testing"

	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra"
	"github.com/Infisical/infisical/tests/infra/postgres"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/require"
)

// PostgresTargetInstance names the target database in TestMain:
//
//	harness.Main(m, harness.Shared, harness.WithInfra(postgres.Module(postgres.Named(fixture.PostgresTargetInstance))))
//
// It has to be a second instance. Infisical refuses its own database host as a target.
const PostgresTargetInstance = "target"

// PostgresTarget is a database Infisical manages credentials on: the one a rotation
// rotates or a dynamic secret leases roles in. Every package that declares it shares
// the one container, so tests stay apart by role name, never by database.
type PostgresTarget struct {
	// Host, Port and Database are what Infisical dials, on the container network.
	Host     string
	Port     int
	Database string

	// User and Password are the superuser, for an App Connection or a provider
	// configuration that has to create and alter roles.
	User     string
	Password string

	external string
}

// OpenPostgresTarget returns the package's target database.
func OpenPostgresTarget(tt *testing.T, tn *harness.Tenant) *PostgresTarget {
	tt.Helper()
	h := tn.Module(tt, postgres.Key+":"+PostgresTargetInstance,
		fmt.Sprintf("harness.WithInfra(postgres.Module(postgres.Named(%q)))", PostgresTargetInstance)).(*postgres.Handle)

	u, err := url.Parse(h.DSN(infra.Internal))
	require.NoError(tt, err)
	pw, _ := u.User.Password()
	in := h.Endpoint(infra.Internal)
	return &PostgresTarget{
		Host:     in.Host,
		Port:     in.Port,
		Database: h.Database(),
		User:     u.User.Username(),
		Password: pw,
		external: h.DSN(infra.External),
	}
}

// NewRole creates a role that can log in, named uniquely so parallel tests never share
// one, and drops it when the test ends.
func (p *PostgresTarget) NewRole(tt *testing.T) (name, password string) {
	tt.Helper()
	name = "r_" + id.Short() + id.Short()
	password = "pw_" + id.Nonce()
	p.exec(tt, fmt.Sprintf(`CREATE ROLE %s WITH LOGIN PASSWORD '%s'`, pgx.Identifier{name}.Sanitize(), password))
	p.DropRoleAtCleanup(tt, name)
	return name, password
}

// DropRoleAtCleanup drops a role Infisical created, such as a lease the test leaves
// behind on purpose.
func (p *PostgresTarget) DropRoleAtCleanup(tt *testing.T, name string) {
	tt.Helper()
	tt.Cleanup(func() {
		ctx := context.WithoutCancel(tt.Context())
		conn, err := pgx.Connect(ctx, p.external)
		if err != nil {
			tt.Errorf("dropping role %s: connecting to the target: %v", name, err)
			return
		}
		defer func() { _ = conn.Close(ctx) }()
		if _, err := conn.Exec(ctx, "DROP ROLE IF EXISTS "+pgx.Identifier{name}.Sanitize()); err != nil {
			tt.Errorf("dropping role %s: %v", name, err)
		}
	})
}

// DropRole removes a role behind Infisical's back.
func (p *PostgresTarget) DropRole(tt *testing.T, name string) {
	tt.Helper()
	p.exec(tt, "DROP ROLE "+pgx.Identifier{name}.Sanitize())
}

// SetPassword changes a role's password behind Infisical's back, which is how a
// credential gets revoked out of band.
func (p *PostgresTarget) SetPassword(tt *testing.T, name, password string) {
	tt.Helper()
	p.exec(tt, fmt.Sprintf(`ALTER ROLE %s WITH PASSWORD '%s'`, pgx.Identifier{name}.Sanitize(), password))
}

// RoleExists reports whether the role is present on the target.
func (p *PostgresTarget) RoleExists(tt *testing.T, name string) bool {
	tt.Helper()
	conn := p.connect(tt)
	defer p.close(tt, conn)
	var exists bool
	require.NoError(tt, conn.QueryRow(tt.Context(),
		"SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = $1)", name).Scan(&exists))
	return exists
}

// Login connects as a role and returns why it could not, or nil when it could. The
// proof a published credential works is that it logs in.
func (p *PostgresTarget) Login(tt *testing.T, name, password string) error {
	tt.Helper()
	u, err := url.Parse(p.external)
	require.NoError(tt, err)
	u.User = url.UserPassword(name, password)
	conn, err := pgx.Connect(tt.Context(), u.String())
	if err != nil {
		return err
	}
	return conn.Close(context.WithoutCancel(tt.Context()))
}

func (p *PostgresTarget) exec(tt *testing.T, sql string) {
	tt.Helper()
	conn := p.connect(tt)
	defer p.close(tt, conn)
	_, err := conn.Exec(tt.Context(), sql)
	require.NoErrorf(tt, err, "running %q on the target database", sql)
}

func (p *PostgresTarget) connect(tt *testing.T) *pgx.Conn {
	tt.Helper()
	conn, err := pgx.Connect(tt.Context(), p.external)
	require.NoError(tt, err, "connecting to the target database")
	return conn
}

// close is per call rather than at cleanup: every package shares the one target, and
// parallel tests holding their connections would run it out of slots.
func (p *PostgresTarget) close(tt *testing.T, conn *pgx.Conn) {
	_ = conn.Close(context.WithoutCancel(tt.Context()))
}
