package permission

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/database/pg/qb"
	"github.com/infisical/api/internal/database/pg/sqln"
	"github.com/infisical/api/internal/libs/fn"
)

// --- Types ---

// AccessScope determines whether the permission query is for an organization or project.
type AccessScope string

const (
	AccessScopeOrganization AccessScope = "organization"
	AccessScopeProject      AccessScope = "project"
)

// getPermissionParams holds the input for the main permission query.
type getPermissionParams struct {
	Scope     AccessScope
	OrgID     uuid.UUID
	ProjectID string
	ActorID   uuid.UUID
	ActorType ActorType
}

// RoleInfo represents a single role assignment from the permission query.
type RoleInfo struct {
	ID                     uuid.UUID
	Role                   string
	IsTemporary            sql.Null[bool]
	TemporaryAccessEndTime sql.Null[time.Time]
	CustomRoleSlug         sql.Null[string]
	Permissions            sql.Null[string]
}

// AdditionalPrivilegeInfo represents an additional privilege from the permission query.
type AdditionalPrivilegeInfo struct {
	ID                     uuid.UUID
	Permissions            sql.Null[string]
	IsTemporary            sql.Null[bool]
	TemporaryAccessEndTime sql.Null[time.Time]
}

// MetadataInfo represents identity metadata key-value pair.
type MetadataInfo struct {
	ID    uuid.UUID
	Key   string
	Value string
}

// permissionData is the nested result of the permission query.
type permissionData struct {
	ID                          uuid.UUID
	ScopeOrgID                  uuid.UUID
	OrgAuthEnforced             sql.Null[bool]
	OrgGoogleSsoAuthEnforced    bool
	BypassOrgAuthEnabled        bool
	ShouldUseNewPrivilegeSystem bool
	RootOrgID                   sql.Null[uuid.UUID]
	Roles                       []RoleInfo
	AdditionalPrivileges        []AdditionalPrivilegeInfo
	Metadata                    []MetadataInfo
}

// projectDetail holds project info needed by the permission service.
type projectDetail struct {
	ID                                          string
	Name                                        string
	Slug                                        string
	OrgID                                       uuid.UUID
	Type                                        string
	EnforceEncryptedSecretManagerSecretMetadata bool
}

// serviceTokenDetail holds service token info needed by the permission service.
type serviceTokenDetail struct {
	ID          string
	ProjectID   string
	ExpiresAt   *time.Time
	Scopes      string
	Permissions []string
}

// permissionGrouper groups flat permission rows by membership ID.
var permissionGrouper = sqln.Grouper[permissionData, uuid.UUID]{
	Key: func(p *permissionData) uuid.UUID { return p.ID },
	Merge: func(existing, row *permissionData) {
		if len(row.Roles) > 0 {
			existing.Roles = fn.AppendUnique(existing.Roles, row.Roles[0], func(r RoleInfo) uuid.UUID { return r.ID })
		}
		if len(row.AdditionalPrivileges) > 0 {
			existing.AdditionalPrivileges = fn.AppendUnique(existing.AdditionalPrivileges, row.AdditionalPrivileges[0], func(a AdditionalPrivilegeInfo) uuid.UUID { return a.ID })
		}
		if len(row.Metadata) > 0 {
			existing.Metadata = fn.AppendUnique(existing.Metadata, row.Metadata[0], func(m MetadataInfo) uuid.UUID { return m.ID })
		}
	},
}

// --- Query methods on Service ---

// getPermission executes the main permission join query.
func (s *Service) getPermission(ctx context.Context, params *getPermissionParams) ([]permissionData, error) {
	// Build actor subquery for group membership
	var groupSubquery string
	if params.ActorType == ActorTypeUser {
		groupSubquery = `
			SELECT g.id FROM groups g
			INNER JOIN user_group_membership ugm ON ugm.group_id = g.id
			WHERE ugm.user_id = @actorID
		`
	} else {
		groupSubquery = `
			SELECT g.id FROM groups g
			INNER JOIN identity_group_membership igm ON igm.group_id = g.id
			WHERE igm.identity_id = @actorID
		`
	}

	// Build WHERE conditions using qb.Where
	where := qb.NewWhere().Add("m.scope_org_id = @orgID")

	// Actor condition
	if params.ActorType == ActorTypeUser {
		where.Add("(m.actor_user_id = @actorID OR m.actor_group_id IN (" + groupSubquery + "))")
	} else {
		where.Add("(m.actor_identity_id = @actorID OR m.actor_group_id IN (" + groupSubquery + "))")
	}

	// Scope condition
	if params.Scope == AccessScopeOrganization {
		where.Add("m.scope = 'organization'")
	} else {
		where.Add("m.scope = 'project'").Add("m.scope_project_id = @projectID")
	}

	// Build additional privilege join condition
	apJoinCond := qb.NewWhere()
	if params.ActorType == ActorTypeIdentity {
		apJoinCond.Add("m.actor_identity_id = ap.actor_identity_id")
	} else {
		apJoinCond.Add("m.actor_user_id = ap.actor_user_id")
	}
	if params.Scope == AccessScopeOrganization {
		apJoinCond.Add("m.scope_org_id = ap.org_id")
	} else {
		apJoinCond.Add("m.scope_project_id = ap.project_id")
	}

	// Build metadata join condition
	metaJoinCond := qb.NewWhere()
	if params.ActorType == ActorTypeUser {
		metaJoinCond.Add("im.user_id = @actorID").Add("m.scope_org_id = im.org_id")
	} else {
		metaJoinCond.Add("im.identity_id = @actorID")
	}

	query := `
		SELECT
			m.id AS membership_id,
			m.scope_org_id,
			o.auth_enforced,
			o.google_sso_auth_enforced,
			o.bypass_org_auth_enabled,
			o.should_use_new_privilege_system,
			o.root_org_id,
			mr.id AS role_id,
			mr.role,
			mr.is_temporary AS role_is_temporary,
			mr.temporary_access_end_time AS role_temporary_access_end_time,
			r.slug AS custom_role_slug,
			r.permissions AS custom_role_permissions,
			ap.id AS ap_id,
			ap.permissions AS ap_permissions,
			ap.is_temporary AS ap_is_temporary,
			ap.temporary_access_end_time AS ap_temporary_access_end_time,
			im.id AS meta_id,
			im.key AS meta_key,
			im.value AS meta_value
		FROM memberships m
		INNER JOIN membership_roles mr ON m.id = mr.membership_id
		INNER JOIN organizations o ON m.scope_org_id = o.id
		LEFT JOIN roles r ON mr.custom_role_id = r.id
		LEFT JOIN additional_privileges ap ON ` + apJoinCond.String() + `
		LEFT JOIN identity_metadata im ON ` + metaJoinCond.String() + `
		WHERE ` + where.String()

	args := pgx.NamedArgs{
		"orgID":     params.OrgID,
		"actorID":   params.ActorID,
		"projectID": params.ProjectID,
	}

	rows, err := s.db.Replica().Query(ctx, query, args)
	if err != nil {
		return nil, err
	}

	flatRows, err := pgx.CollectRows(rows, func(row pgx.CollectableRow) (permissionData, error) {
		var (
			membershipID             uuid.UUID
			scopeOrgID               uuid.UUID
			orgAuthEnforced          sql.Null[bool]
			orgGoogleSsoAuthEnforced bool
			orgBypassOrgAuthEnabled  bool
			orgShouldUseNewPrivSys   bool
			orgRootOrgID             sql.Null[uuid.UUID]
			roleID                   sql.Null[uuid.UUID]
			role                     sql.Null[string]
			roleIsTemporary          sql.Null[bool]
			roleTemporaryEndTime     sql.Null[time.Time]
			customRoleSlug           sql.Null[string]
			customRolePermissions    sql.Null[string]
			apID                     sql.Null[uuid.UUID]
			apPermissions            sql.Null[string]
			apIsTemporary            sql.Null[bool]
			apTemporaryEndTime       sql.Null[time.Time]
			metaID                   sql.Null[uuid.UUID]
			metaKey                  sql.Null[string]
			metaValue                sql.Null[string]
		)

		if err := row.Scan(
			&membershipID, &scopeOrgID,
			&orgAuthEnforced, &orgGoogleSsoAuthEnforced, &orgBypassOrgAuthEnabled,
			&orgShouldUseNewPrivSys, &orgRootOrgID,
			&roleID, &role, &roleIsTemporary, &roleTemporaryEndTime,
			&customRoleSlug, &customRolePermissions,
			&apID, &apPermissions, &apIsTemporary, &apTemporaryEndTime,
			&metaID, &metaKey, &metaValue,
		); err != nil {
			return permissionData{}, err
		}

		data := permissionData{
			ID:                          membershipID,
			ScopeOrgID:                  scopeOrgID,
			OrgAuthEnforced:             orgAuthEnforced,
			OrgGoogleSsoAuthEnforced:    orgGoogleSsoAuthEnforced,
			BypassOrgAuthEnabled:        orgBypassOrgAuthEnabled,
			ShouldUseNewPrivilegeSystem: orgShouldUseNewPrivSys,
			RootOrgID:                   orgRootOrgID,
		}

		if roleID.Valid {
			data.Roles = []RoleInfo{{
				ID:                     roleID.V,
				Role:                   role.V,
				IsTemporary:            roleIsTemporary,
				TemporaryAccessEndTime: roleTemporaryEndTime,
				CustomRoleSlug:         customRoleSlug,
				Permissions:            customRolePermissions,
			}}
		}

		if apID.Valid {
			data.AdditionalPrivileges = []AdditionalPrivilegeInfo{{
				ID:                     apID.V,
				Permissions:            apPermissions,
				IsTemporary:            apIsTemporary,
				TemporaryAccessEndTime: apTemporaryEndTime,
			}}
		}

		if metaID.Valid {
			data.Metadata = []MetadataInfo{{
				ID:    metaID.V,
				Key:   metaKey.V,
				Value: metaValue.V,
			}}
		}

		return data, nil
	})
	if err != nil {
		return nil, err
	}

	if len(flatRows) == 0 {
		return nil, nil
	}

	return sqln.GroupRows(flatRows, permissionGrouper), nil
}

// findProjectByID returns basic project details needed for permission checks.
func (s *Service) findProjectByID(ctx context.Context, projectID string) (*projectDetail, error) {
	query := `
		SELECT id, name, slug, org_id, type, enforce_encrypted_secret_manager_secret_metadata
		FROM projects
		WHERE id = @projectID
	`
	args := pgx.NamedArgs{"projectID": projectID}

	row := s.db.Replica().QueryRow(ctx, query, args)

	var id, name, slug string
	var orgID uuid.UUID
	var projectType sql.Null[string]
	var enforceEncrypted sql.Null[bool]

	err := row.Scan(&id, &name, &slug, &orgID, &projectType, &enforceEncrypted)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return &projectDetail{
		ID:    id,
		Name:  name,
		Slug:  slug,
		OrgID: orgID,
		Type:  projectType.V,
		EnforceEncryptedSecretManagerSecretMetadata: enforceEncrypted.Valid && enforceEncrypted.V,
	}, nil
}

// findUserUsername returns the username for a user by ID.
func (s *Service) findUserUsername(ctx context.Context, userID uuid.UUID) (string, error) {
	query := `SELECT username FROM users WHERE id = @userID`
	args := pgx.NamedArgs{"userID": userID}

	var username string
	err := s.db.Replica().QueryRow(ctx, query, args).Scan(&username)
	if err != nil {
		return "", err
	}
	return username, nil
}

// findIdentityName returns the name for an identity by ID.
func (s *Service) findIdentityName(ctx context.Context, identityID uuid.UUID) (string, error) {
	query := `SELECT name FROM identities WHERE id = @identityID`
	args := pgx.NamedArgs{"identityID": identityID}

	var name string
	err := s.db.Replica().QueryRow(ctx, query, args).Scan(&name)
	if err != nil {
		return "", err
	}
	return name, nil
}

// findServiceTokenByID returns service token details needed for permission checks.
func (s *Service) findServiceTokenByID(ctx context.Context, tokenID string) (*serviceTokenDetail, error) {
	query := `
		SELECT id, project_id, expires_at, scopes, permissions
		FROM service_tokens
		WHERE id = @tokenID
	`
	args := pgx.NamedArgs{"tokenID": tokenID}

	row := s.db.Replica().QueryRow(ctx, query, args)

	var id, projectID, scopes string
	var expiresAt sql.Null[time.Time]
	var permissions []string

	err := row.Scan(&id, &projectID, &expiresAt, &scopes, &permissions)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	detail := &serviceTokenDetail{
		ID:          id,
		ProjectID:   projectID,
		Scopes:      scopes,
		Permissions: permissions,
	}
	if expiresAt.Valid {
		detail.ExpiresAt = &expiresAt.V
	}
	return detail, nil
}

// NewDAL is kept for backward compatibility during migration.
// Deprecated: Use service methods directly.
func NewDAL(db pg.DB) *Service {
	return &Service{db: db}
}
