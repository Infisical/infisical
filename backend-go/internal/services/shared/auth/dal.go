package auth

import (
	"context"
	"database/sql"
	"errors"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"
	"github.com/google/uuid"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/database/pg/gen/table"
	"github.com/infisical/api/internal/services/shared/permission"
)

// DAL provides data access for authentication-related queries.
// All reads use the replica; writes (deletes) hit primary.
type DAL struct {
	db pg.DB
}

// NewDAL creates a new auth DAL.
func NewDAL(db pg.DB) *DAL {
	return &DAL{db: db}
}

// --- Sessions ---

// SessionRow holds the subset of auth_token_sessions used by the auth handler.
type SessionRow struct {
	AccessVersion int32     `alias:"auth_token_sessions.access_version"`
	UserId        uuid.UUID `alias:"auth_token_sessions.user_id"`
}

// FindSessionByIDAndUserID returns the session matching id + userId, or nil if not found.
func (d *DAL) FindSessionByIDAndUserID(ctx context.Context, sessionID, userID uuid.UUID) (*SessionRow, error) {
	s := table.AuthTokenSessions

	stmt := postgres.SELECT(s.AccessVersion, s.UserId).
		FROM(s).
		WHERE(postgres.AND(
			s.ID.EQ(postgres.UUID(sessionID)),
			s.UserId.EQ(postgres.UUID(userID)),
		))

	var row SessionRow
	err := stmt.QueryContext(ctx, d.db.Replica(), &row)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// --- Users ---

// UserRow holds the subset of users used by the auth handler.
type UserRow struct {
	ID         uuid.UUID      `alias:"users.id"`
	Email      sql.NullString `alias:"users.email"`
	IsAccepted sql.Null[bool] `alias:"users.is_accepted"`
	SuperAdmin sql.Null[bool] `alias:"users.super_admin"`
}

// FindUserByID returns the user matching id, or nil if not found.
func (d *DAL) FindUserByID(ctx context.Context, id uuid.UUID) (*UserRow, error) {
	u := table.Users

	stmt := postgres.SELECT(u.ID, u.Email, u.IsAccepted, u.SuperAdmin).
		FROM(u).
		WHERE(u.ID.EQ(postgres.UUID(id)))

	var row UserRow
	err := stmt.QueryContext(ctx, d.db.Replica(), &row)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// --- Organizations ---

// OrgRow holds the subset of organizations used by the auth handler.
type OrgRow struct {
	ID          uuid.UUID           `alias:"organizations.id"`
	RootOrgId   sql.Null[uuid.UUID] `alias:"organizations.root_org_id"`
	ParentOrgId sql.Null[uuid.UUID] `alias:"organizations.parent_org_id"`
}

// FindOrgByID returns the organization matching id, or nil if not found.
func (d *DAL) FindOrgByID(ctx context.Context, id uuid.UUID) (*OrgRow, error) {
	o := table.Organizations

	stmt := postgres.SELECT(o.ID, o.RootOrgId, o.ParentOrgId).
		FROM(o).
		WHERE(o.ID.EQ(postgres.UUID(id)))

	var row OrgRow
	err := stmt.QueryContext(ctx, d.db.Replica(), &row)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// --- Projects ---

// ProjectRow holds the subset of projects used by the auth handler.
type ProjectRow struct {
	OrgId uuid.UUID `alias:"projects.org_id"`
}

// FindProjectByID returns the project matching id, or nil if not found.
func (d *DAL) FindProjectByID(ctx context.Context, id string) (*ProjectRow, error) {
	p := table.Projects

	stmt := postgres.SELECT(p.OrgId).
		FROM(p).
		WHERE(p.ID.EQ(postgres.String(id)))

	var row ProjectRow
	err := stmt.QueryContext(ctx, d.db.Replica(), &row)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// --- Identity Access Tokens ---

// IdentityAccessTokenRow holds the identity_access_tokens columns + joined identity fields
// used by the auth handler. Nearly all token columns are needed for validation.
type IdentityAccessTokenRow struct {
	ID                       string              `alias:"identity_access_tokens.id"`
	AccessTokenTTL           int64               `alias:"identity_access_tokens.access_token_ttl"`
	AccessTokenMaxTTL        int64               `alias:"identity_access_tokens.access_token_max_ttl"`
	AccessTokenNumUses       int64               `alias:"identity_access_tokens.access_token_num_uses"`
	AccessTokenNumUsesLimit  int64               `alias:"identity_access_tokens.access_token_num_uses_limit"`
	AccessTokenLastRenewedAt sql.NullTime        `alias:"identity_access_tokens.access_token_last_renewed_at"`
	IsAccessTokenRevoked     bool                `alias:"identity_access_tokens.is_access_token_revoked"`
	IdentityId               uuid.UUID           `alias:"identity_access_tokens.identity_id"`
	CreatedAt                sql.NullTime        `alias:"identity_access_tokens.created_at"`
	AuthMethod               string              `alias:"identity_access_tokens.auth_method"`
	AccessTokenPeriod        int64               `alias:"identity_access_tokens.access_token_period"`
	SubOrganizationId        sql.Null[uuid.UUID] `alias:"identity_access_tokens.sub_organization_id"`

	// Joined from identities table.
	IdentityOrgID uuid.UUID `alias:"identities.org_id"`
	IdentityName  string    `alias:"identities.name"`
}

// FindIdentityAccessTokenByID returns the token (joined with identity) if not revoked, or nil.
func (d *DAL) FindIdentityAccessTokenByID(ctx context.Context, id string) (*IdentityAccessTokenRow, error) {
	iat := table.IdentityAccessTokens
	ident := table.Identities

	stmt := postgres.SELECT(
		iat.ID,
		iat.AccessTokenTTL,
		iat.AccessTokenMaxTTL,
		iat.AccessTokenNumUses,
		iat.AccessTokenNumUsesLimit,
		iat.AccessTokenLastRenewedAt,
		iat.IsAccessTokenRevoked,
		iat.IdentityId,
		iat.CreatedAt,
		iat.AuthMethod,
		iat.AccessTokenPeriod,
		iat.SubOrganizationId,
		ident.OrgId,
		ident.Name,
	).FROM(
		iat.INNER_JOIN(ident, iat.IdentityId.EQ(ident.ID)),
	).WHERE(postgres.AND(
		iat.ID.EQ(postgres.String(id)),
		iat.IsAccessTokenRevoked.EQ(postgres.Bool(false)),
	))

	var row IdentityAccessTokenRow
	err := stmt.QueryContext(ctx, d.db.Replica(), &row)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// DeleteIdentityAccessTokenByID deletes the token on primary. Used for expired/exceeded tokens.
func (d *DAL) DeleteIdentityAccessTokenByID(ctx context.Context, id string) error {
	iat := table.IdentityAccessTokens

	stmt := iat.DELETE().WHERE(iat.ID.EQ(postgres.String(id)))
	_, err := stmt.ExecContext(ctx, d.db.Primary())
	return err
}

// --- Service Tokens ---

// ServiceTokenRow holds the subset of service_tokens used by the auth handler.
type ServiceTokenRow struct {
	ID         string       `alias:"service_tokens.id"`
	ProjectId  string       `alias:"service_tokens.project_id"`
	ExpiresAt  sql.NullTime `alias:"service_tokens.expires_at"`
	SecretHash string       `alias:"service_tokens.secret_hash"`
}

// FindServiceTokenByID returns the service token matching id, or nil.
func (d *DAL) FindServiceTokenByID(ctx context.Context, id string) (*ServiceTokenRow, error) {
	st := table.ServiceTokens

	stmt := postgres.SELECT(st.ID, st.ProjectId, st.ExpiresAt, st.SecretHash).
		FROM(st).
		WHERE(st.ID.EQ(postgres.String(id)))

	var row ServiceTokenRow
	err := stmt.QueryContext(ctx, d.db.Replica(), &row)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// DeleteServiceTokenByID deletes the service token on primary. Used for expired tokens.
func (d *DAL) DeleteServiceTokenByID(ctx context.Context, id string) error {
	st := table.ServiceTokens

	stmt := st.DELETE().WHERE(st.ID.EQ(postgres.String(id)))
	_, err := stmt.ExecContext(ctx, d.db.Primary())
	return err
}

// --- Memberships ---

// MembershipRow holds the subset of memberships used by the auth handler.
type MembershipRow struct {
	IsActive bool `alias:"memberships.is_active"`
}

// FindEffectiveOrgMembership returns the first effective org membership for an actor (user or identity),
// including direct membership and membership via groups.
// Exact port of Node.js orgDAL.findEffectiveOrgMembership.
// TODO(go): move this to dal like membership
func (d *DAL) FindEffectiveOrgMembership(ctx context.Context, actorType permission.ActorType, actorID, orgID uuid.UUID, filterStatus string) (*MembershipRow, error) {
	m := table.Memberships
	g := table.Groups
	ugm := table.UserGroupMembership
	igm := table.IdentityGroupMembership

	// Build the group subquery based on actor type.
	var actorCondition postgres.BoolExpression
	if actorType == permission.ActorTypeUser {
		groupSubquery := postgres.SELECT(g.ID).
			FROM(g.INNER_JOIN(ugm, ugm.GroupId.EQ(g.ID))).
			WHERE(ugm.UserId.EQ(postgres.UUID(actorID)))

		actorCondition = postgres.OR(
			m.ActorUserId.EQ(postgres.UUID(actorID)),
			m.ActorGroupId.IN(groupSubquery),
		)
	} else {
		groupSubquery := postgres.SELECT(g.ID).
			FROM(g.INNER_JOIN(igm, igm.GroupId.EQ(g.ID))).
			WHERE(igm.IdentityId.EQ(postgres.UUID(actorID)))

		actorCondition = postgres.OR(
			m.ActorIdentityId.EQ(postgres.UUID(actorID)),
			m.ActorGroupId.IN(groupSubquery),
		)
	}

	// Status filter: match the requested status OR null (same as Node.js).
	var statusCondition postgres.BoolExpression
	if filterStatus != "" {
		statusCondition = postgres.OR(
			m.Status.EQ(postgres.String(filterStatus)),
			m.Status.IS_NULL(),
		)
	} else {
		statusCondition = postgres.OR(
			m.Status.EQ(postgres.String("accepted")),
			m.Status.IS_NULL(),
		)
	}

	stmt := postgres.SELECT(m.IsActive).
		FROM(m).
		WHERE(postgres.AND(
			m.Scope.EQ(postgres.String("organization")),
			m.ScopeOrgId.EQ(postgres.UUID(orgID)),
			actorCondition,
			statusCondition,
		)).
		LIMIT(1)

	var row MembershipRow
	err := stmt.QueryContext(ctx, d.db.Replica(), &row)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &row, nil
}

// --- Trusted IPs ---

// trustedIPRow holds the accessTokenTrustedIps JSON column from any identity auth table.
type trustedIPRow struct {
	AccessTokenTrustedIps string `alias:"access_token_trusted_ips"`
}

// FindTrustedIpsByAuthMethod returns the parsed trusted IPs for an identity's auth method.
// Exact port of Node.js identityDAL.getTrustedIpsByAuthMethod.
func (d *DAL) FindTrustedIpsByAuthMethod(ctx context.Context, identityID uuid.UUID, authMethod string) ([]TrustedIP, error) {
	iua := table.IdentityUniversalAuths
	ika := table.IdentityKubernetesAuths
	iga := table.IdentityGcpAuths
	iaa := table.IdentityAlicloudAuths
	iwa := table.IdentityAwsAuths
	iza := table.IdentityAzureAuths
	ita := table.IdentityTokenAuths
	itca := table.IdentityTLSCertAuths
	ioa := table.IdentityOciAuths
	ioda := table.IdentityOidcAuths
	ija := table.IdentityJwtAuths
	ila := table.IdentityLdapAuths
	isa := table.IdentitySpiffeAuths

	// Map auth method string → table + column references.
	var tbl postgres.ReadableTable
	var identityCol postgres.Column
	var trustedIPsProj postgres.Projection

	switch authMethod {
	case "universal_auth":
		tbl, identityCol, trustedIPsProj = iua, iua.IdentityId, iua.AccessTokenTrustedIps
	case "kubernetes_auth":
		tbl, identityCol, trustedIPsProj = ika, ika.IdentityId, ika.AccessTokenTrustedIps
	case "gcp_auth":
		tbl, identityCol, trustedIPsProj = iga, iga.IdentityId, iga.AccessTokenTrustedIps
	case "alicloud_auth":
		tbl, identityCol, trustedIPsProj = iaa, iaa.IdentityId, iaa.AccessTokenTrustedIps
	case "aws_auth":
		tbl, identityCol, trustedIPsProj = iwa, iwa.IdentityId, iwa.AccessTokenTrustedIps
	case "azure_auth":
		tbl, identityCol, trustedIPsProj = iza, iza.IdentityId, iza.AccessTokenTrustedIps
	case "token_auth":
		tbl, identityCol, trustedIPsProj = ita, ita.IdentityId, ita.AccessTokenTrustedIps
	case "tls_cert_auth":
		tbl, identityCol, trustedIPsProj = itca, itca.IdentityId, itca.AccessTokenTrustedIps
	case "oci_auth":
		tbl, identityCol, trustedIPsProj = ioa, ioa.IdentityId, ioa.AccessTokenTrustedIps
	case "oidc_auth":
		tbl, identityCol, trustedIPsProj = ioda, ioda.IdentityId, ioda.AccessTokenTrustedIps
	case "jwt_auth":
		tbl, identityCol, trustedIPsProj = ija, ija.IdentityId, ija.AccessTokenTrustedIps
	case "ldap_auth":
		tbl, identityCol, trustedIPsProj = ila, ila.IdentityId, ila.AccessTokenTrustedIps
	case "spiffe_auth":
		tbl, identityCol, trustedIPsProj = isa, isa.IdentityId, isa.AccessTokenTrustedIps
	default:
		return nil, nil
	}

	identityColStr, ok := identityCol.(postgres.ColumnString)
	if !ok {
		return nil, nil
	}

	stmt := postgres.SELECT(trustedIPsProj).
		FROM(tbl).
		WHERE(identityColStr.EQ(postgres.UUID(identityID))).
		LIMIT(1)

	var row trustedIPRow
	err := stmt.QueryContext(ctx, d.db.Replica(), &row)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return parseTrustedIPs(row.AccessTokenTrustedIps)
}

// --- Helpers ---

// parseUUID parses a string to uuid.UUID. Returns uuid.Nil on failure.
func parseUUID(s string) uuid.UUID {
	id, _ := uuid.Parse(s)
	return id
}

// nullUUIDValid returns true when the nullable UUID is present and non-nil.
func nullUUIDValid(n sql.Null[uuid.UUID]) bool {
	return n.Valid && n.V != uuid.Nil
}
