package permission

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/go-jet/jet/v2/postgres"
	"github.com/go-jet/jet/v2/qrm"
	"github.com/google/uuid"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/database/pg/gen/table"
)

// DAL provides data access for permission queries.
type DAL struct {
	db pg.DB
}

// NewDAL creates a new permission DAL.
func NewDAL(db pg.DB) *DAL {
	return &DAL{db: db}
}

// --- Types ---

// AccessScope determines whether the permission query is for an organization or project.
type AccessScope string

const (
	AccessScopeOrganization AccessScope = "organization"
	AccessScopeProject      AccessScope = "project"
)

// GetPermissionParams holds the input for the main permission query.
type GetPermissionParams struct {
	Scope     AccessScope
	OrgID     uuid.UUID
	ProjectID string // text in DB, empty for org scope
	ActorID   uuid.UUID
	ActorType ActorType
}

// PermissionData is the nested result of the permission query.
type PermissionData struct {
	ID                          uuid.UUID
	ScopeOrgID                  uuid.UUID
	OrgAuthEnforced             *bool
	OrgGoogleSsoAuthEnforced    bool
	BypassOrgAuthEnabled        bool
	ShouldUseNewPrivilegeSystem bool
	RootOrgID                   *uuid.UUID
	Roles                       []RoleInfo
	AdditionalPrivileges        []AdditionalPrivilegeInfo
	Metadata                    []MetadataInfo
}

// RoleInfo represents a single role assignment from the permission query.
type RoleInfo struct {
	ID                     uuid.UUID
	Role                   string
	Permissions            *string // JSON for custom roles
	CustomRoleSlug         *string
	IsTemporary            bool
	TemporaryAccessEndTime *time.Time
}

// AdditionalPrivilegeInfo represents an additional privilege from the permission query.
type AdditionalPrivilegeInfo struct {
	ID                     uuid.UUID
	Permissions            *string // JSON
	IsTemporary            bool
	TemporaryAccessEndTime *time.Time
}

// MetadataInfo represents identity metadata key-value pair.
type MetadataInfo struct {
	ID    uuid.UUID
	Key   string
	Value string
}

// ProjectDetail holds project info needed by the permission service.
type ProjectDetail struct {
	ID                                          string
	Name                                        string
	Slug                                        string
	OrgID                                       uuid.UUID
	Type                                        string
	EnforceEncryptedSecretManagerSecretMetadata bool
}

// ServiceTokenDetail holds service token info needed by the permission service.
type ServiceTokenDetail struct {
	ID          string
	ProjectID   string
	ExpiresAt   *time.Time
	Scopes      string   // JSON string of [{environment, secretPath}]
	Permissions []string // e.g. ["read", "write"]
}

// --- Flat row type for the join query ---

type permissionFlatRow struct {
	// Membership fields
	MembershipID uuid.UUID `alias:"memberships.id"`
	ScopeOrgID   uuid.UUID `alias:"memberships.scope_org_id"`

	// Organization fields
	OrgAuthEnforced             sql.Null[bool]      `alias:"organizations.auth_enforced"`
	OrgGoogleSsoAuthEnforced    bool                `alias:"organizations.google_sso_auth_enforced"`
	BypassOrgAuthEnabled        bool                `alias:"organizations.bypass_org_auth_enabled"`
	ShouldUseNewPrivilegeSystem bool                `alias:"organizations.should_use_new_privilege_system"`
	RootOrgID                   sql.Null[uuid.UUID] `alias:"organizations.root_org_id"`

	// MembershipRole fields
	MembershipRoleID           sql.Null[uuid.UUID] `alias:"membership_roles.id"`
	MembershipRole             sql.Null[string]    `alias:"membership_roles.role"`
	MembershipRoleIsTemporary  sql.Null[bool]      `alias:"membership_roles.is_temporary"`
	MembershipRoleTemporaryEnd sql.NullTime        `alias:"membership_roles.temporary_access_end_time"`

	// Role (custom role) fields
	RoleSlug              sql.Null[string] `alias:"roles.slug"`
	CustomRolePermissions sql.Null[string] `alias:"roles.permissions"`

	// AdditionalPrivilege fields
	AdditionalPrivilegeID      sql.Null[uuid.UUID] `alias:"additional_privileges.id"`
	AdditionalPrivilegePerms   sql.Null[string]    `alias:"additional_privileges.permissions"`
	AdditionalPrivilegeIsTemp  sql.Null[bool]      `alias:"additional_privileges.is_temporary"`
	AdditionalPrivilegeTempEnd sql.NullTime        `alias:"additional_privileges.temporary_access_end_time"`

	// IdentityMetadata fields
	MetadataID    sql.Null[uuid.UUID] `alias:"identity_metadata.id"`
	MetadataKey   sql.Null[string]    `alias:"identity_metadata.key"`
	MetadataValue sql.Null[string]    `alias:"identity_metadata.value"`
}

// GetPermission executes the main permission join query.
// Port of permission-dal.ts:173-366.
func (d *DAL) GetPermission(ctx context.Context, params *GetPermissionParams) ([]PermissionData, error) {
	memberships := table.Memberships
	membershipRoles := table.MembershipRoles
	organizations := table.Organizations
	roles := table.Roles
	additionalPrivileges := table.AdditionalPrivileges
	identityMetadata := table.IdentityMetadata
	groups := table.Groups
	userGroupMembership := table.UserGroupMembership
	identityGroupMembership := table.IdentityGroupMembership

	// Group subquery: find groups the actor belongs to
	var groupSubquery postgres.SelectStatement
	if params.ActorType == ActorTypeUser {
		groupSubquery = groups.SELECT(groups.ID).
			FROM(groups.INNER_JOIN(userGroupMembership, userGroupMembership.GroupId.EQ(groups.ID))).
			WHERE(userGroupMembership.UserId.EQ(postgres.UUID(params.ActorID)))
	} else {
		groupSubquery = groups.SELECT(groups.ID).
			FROM(groups.INNER_JOIN(identityGroupMembership, identityGroupMembership.GroupId.EQ(groups.ID))).
			WHERE(identityGroupMembership.IdentityId.EQ(postgres.UUID(params.ActorID)))
	}

	// AdditionalPrivilege join condition — match on actor + scope
	var additionalPrivilegeJoinCond postgres.BoolExpression
	if params.ActorType == ActorTypeIdentity {
		additionalPrivilegeJoinCond = memberships.ActorIdentityId.EQ(additionalPrivileges.ActorIdentityId)
	} else {
		additionalPrivilegeJoinCond = memberships.ActorUserId.EQ(additionalPrivileges.ActorUserId)
	}
	if params.Scope == AccessScopeOrganization {
		additionalPrivilegeJoinCond = additionalPrivilegeJoinCond.AND(memberships.ScopeOrgId.EQ(additionalPrivileges.OrgId))
	} else {
		additionalPrivilegeJoinCond = additionalPrivilegeJoinCond.AND(memberships.ScopeProjectId.EQ(additionalPrivileges.ProjectId))
	}

	// IdentityMetadata join condition — constant actor ID
	var identityMetadataJoinCond postgres.BoolExpression
	if params.ActorType == ActorTypeUser {
		identityMetadataJoinCond = identityMetadata.UserId.EQ(postgres.UUID(params.ActorID)).
			AND(memberships.ScopeOrgId.EQ(identityMetadata.OrgId))
	} else {
		identityMetadataJoinCond = identityMetadata.IdentityId.EQ(postgres.UUID(params.ActorID))
	}

	// Actor filter: direct membership OR group membership
	var actorFilter postgres.BoolExpression
	if params.ActorType == ActorTypeUser {
		actorFilter = memberships.ActorUserId.EQ(postgres.UUID(params.ActorID)).
			OR(memberships.ActorGroupId.IN(groupSubquery))
	} else {
		actorFilter = memberships.ActorIdentityId.EQ(postgres.UUID(params.ActorID)).
			OR(memberships.ActorGroupId.IN(groupSubquery))
	}

	// Scope filter
	var scopeFilter postgres.BoolExpression
	if params.Scope == AccessScopeOrganization {
		scopeFilter = memberships.Scope.EQ(postgres.String(string(AccessScopeOrganization)))
	} else {
		scopeFilter = memberships.Scope.EQ(postgres.String(string(AccessScopeProject))).
			AND(memberships.ScopeProjectId.EQ(postgres.String(params.ProjectID)))
	}

	stmt := memberships.SELECT(
		memberships.ID, memberships.ScopeOrgId,
		organizations.AuthEnforced, organizations.GoogleSsoAuthEnforced, organizations.BypassOrgAuthEnabled,
		organizations.ShouldUseNewPrivilegeSystem, organizations.RootOrgId,
		membershipRoles.ID, membershipRoles.Role, membershipRoles.IsTemporary, membershipRoles.TemporaryAccessEndTime,
		roles.Slug, roles.Permissions,
		additionalPrivileges.ID, additionalPrivileges.Permissions, additionalPrivileges.IsTemporary, additionalPrivileges.TemporaryAccessEndTime,
		identityMetadata.ID, identityMetadata.Key, identityMetadata.Value,
	).FROM(
		memberships.
			INNER_JOIN(membershipRoles, memberships.ID.EQ(membershipRoles.MembershipId)).
			INNER_JOIN(organizations, memberships.ScopeOrgId.EQ(organizations.ID)).
			LEFT_JOIN(roles, membershipRoles.CustomRoleId.EQ(roles.ID)).
			LEFT_JOIN(additionalPrivileges, additionalPrivilegeJoinCond).
			LEFT_JOIN(identityMetadata, identityMetadataJoinCond),
	).WHERE(
		memberships.ScopeOrgId.EQ(postgres.UUID(params.OrgID)).
			AND(actorFilter).
			AND(scopeFilter),
	)

	var rows []permissionFlatRow
	err := stmt.QueryContext(ctx, d.db.Replica(), &rows)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return nestPermissionRows(rows), nil
}

// nestPermissionRows transforms flat join rows into nested PermissionData.
func nestPermissionRows(rows []permissionFlatRow) []PermissionData {
	type entry struct {
		data     PermissionData
		roleSeen map[uuid.UUID]bool
		apSeen   map[uuid.UUID]bool
		metaSeen map[uuid.UUID]bool
	}

	orderKeys := make([]uuid.UUID, 0)
	lookup := make(map[uuid.UUID]*entry)

	for i := range rows {
		row := &rows[i]
		existing, ok := lookup[row.MembershipID]
		if !ok {
			var rootOrgID *uuid.UUID
			if row.RootOrgID.Valid {
				rootOrgID = &row.RootOrgID.V
			}
			var orgAuthEnforced *bool
			if row.OrgAuthEnforced.Valid {
				orgAuthEnforced = &row.OrgAuthEnforced.V
			}
			existing = &entry{
				data: PermissionData{
					ID:                          row.MembershipID,
					ScopeOrgID:                  row.ScopeOrgID,
					OrgAuthEnforced:             orgAuthEnforced,
					OrgGoogleSsoAuthEnforced:    row.OrgGoogleSsoAuthEnforced,
					BypassOrgAuthEnabled:        row.BypassOrgAuthEnabled,
					ShouldUseNewPrivilegeSystem: row.ShouldUseNewPrivilegeSystem,
					RootOrgID:                   rootOrgID,
				},
				roleSeen: make(map[uuid.UUID]bool),
				apSeen:   make(map[uuid.UUID]bool),
				metaSeen: make(map[uuid.UUID]bool),
			}
			orderKeys = append(orderKeys, row.MembershipID)
			lookup[row.MembershipID] = existing
		}

		// Dedup roles by membershipRoleId
		if row.MembershipRoleID.Valid && !existing.roleSeen[row.MembershipRoleID.V] {
			existing.roleSeen[row.MembershipRoleID.V] = true
			roleInfo := RoleInfo{
				ID:          row.MembershipRoleID.V,
				Role:        row.MembershipRole.V,
				IsTemporary: row.MembershipRoleIsTemporary.Valid && row.MembershipRoleIsTemporary.V,
			}
			if row.RoleSlug.Valid {
				roleInfo.CustomRoleSlug = &row.RoleSlug.V
			}
			if row.CustomRolePermissions.Valid {
				roleInfo.Permissions = &row.CustomRolePermissions.V
			}
			if row.MembershipRoleTemporaryEnd.Valid {
				roleInfo.TemporaryAccessEndTime = &row.MembershipRoleTemporaryEnd.Time
			}
			existing.data.Roles = append(existing.data.Roles, roleInfo)
		}

		// Dedup additional privileges
		if row.AdditionalPrivilegeID.Valid && !existing.apSeen[row.AdditionalPrivilegeID.V] {
			existing.apSeen[row.AdditionalPrivilegeID.V] = true
			privilegeInfo := AdditionalPrivilegeInfo{
				ID:          row.AdditionalPrivilegeID.V,
				IsTemporary: row.AdditionalPrivilegeIsTemp.Valid && row.AdditionalPrivilegeIsTemp.V,
			}
			if row.AdditionalPrivilegePerms.Valid {
				privilegeInfo.Permissions = &row.AdditionalPrivilegePerms.V
			}
			if row.AdditionalPrivilegeTempEnd.Valid {
				privilegeInfo.TemporaryAccessEndTime = &row.AdditionalPrivilegeTempEnd.Time
			}
			existing.data.AdditionalPrivileges = append(existing.data.AdditionalPrivileges, privilegeInfo)
		}

		// Dedup metadata
		if row.MetadataID.Valid && !existing.metaSeen[row.MetadataID.V] {
			existing.metaSeen[row.MetadataID.V] = true
			existing.data.Metadata = append(existing.data.Metadata, MetadataInfo{
				ID:    row.MetadataID.V,
				Key:   row.MetadataKey.V,
				Value: row.MetadataValue.V,
			})
		}
	}

	result := make([]PermissionData, 0, len(orderKeys))
	for _, key := range orderKeys {
		result = append(result, lookup[key].data)
	}
	return result
}

// FindProjectByID returns basic project details needed for permission checks.
func (d *DAL) FindProjectByID(ctx context.Context, projectID string) (*ProjectDetail, error) {
	projects := table.Projects

	var result struct {
		ID                                          string         `alias:"projects.id"`
		Name                                        string         `alias:"projects.name"`
		Slug                                        string         `alias:"projects.slug"`
		OrgID                                       uuid.UUID      `alias:"projects.org_id"`
		Type                                        string         `alias:"projects.type"`
		EnforceEncryptedSecretManagerSecretMetadata sql.Null[bool] `alias:"projects.enforce_encrypted_secret_manager_secret_metadata"`
	}

	err := projects.SELECT(
		projects.ID, projects.Name, projects.Slug, projects.OrgId, projects.Type,
		projects.EnforceEncryptedSecretManagerSecretMetadata,
	).WHERE(
		projects.ID.EQ(postgres.String(projectID)),
	).QueryContext(ctx, d.db.Replica(), &result)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return &ProjectDetail{
		ID:    result.ID,
		Name:  result.Name,
		Slug:  result.Slug,
		OrgID: result.OrgID,
		Type:  result.Type,
		EnforceEncryptedSecretManagerSecretMetadata: result.EnforceEncryptedSecretManagerSecretMetadata.Valid && result.EnforceEncryptedSecretManagerSecretMetadata.V,
	}, nil
}

// FindUserUsername returns the username for a user by ID.
func (d *DAL) FindUserUsername(ctx context.Context, userID uuid.UUID) (string, error) {
	users := table.Users

	var result struct {
		Username string `alias:"users.username"`
	}

	err := users.SELECT(users.Username).
		WHERE(users.ID.EQ(postgres.UUID(userID))).
		QueryContext(ctx, d.db.Replica(), &result)
	if err != nil {
		return "", err
	}
	return result.Username, nil
}

// FindIdentityName returns the name for an identity by ID.
func (d *DAL) FindIdentityName(ctx context.Context, identityID uuid.UUID) (string, error) {
	identities := table.Identities

	var result struct {
		Name string `alias:"identities.name"`
	}

	err := identities.SELECT(identities.Name).
		WHERE(identities.ID.EQ(postgres.UUID(identityID))).
		QueryContext(ctx, d.db.Replica(), &result)
	if err != nil {
		return "", err
	}
	return result.Name, nil
}

// FindServiceTokenByID returns service token details needed for permission checks.
func (d *DAL) FindServiceTokenByID(ctx context.Context, tokenID string) (*ServiceTokenDetail, error) {
	serviceTokens := table.ServiceTokens

	var result struct {
		ID          string       `alias:"service_tokens.id"`
		ProjectID   string       `alias:"service_tokens.project_id"`
		ExpiresAt   sql.NullTime `alias:"service_tokens.expires_at"`
		Scopes      string       `alias:"service_tokens.scopes"`
		Permissions []string     `alias:"service_tokens.permissions"`
	}

	err := serviceTokens.SELECT(
		serviceTokens.ID, serviceTokens.ProjectId, serviceTokens.ExpiresAt,
		serviceTokens.Scopes, serviceTokens.Permissions,
	).WHERE(
		serviceTokens.ID.EQ(postgres.String(tokenID)),
	).QueryContext(ctx, d.db.Replica(), &result)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	detail := &ServiceTokenDetail{
		ID:          result.ID,
		ProjectID:   result.ProjectID,
		Scopes:      result.Scopes,
		Permissions: result.Permissions,
	}
	if result.ExpiresAt.Valid {
		detail.ExpiresAt = &result.ExpiresAt.Time
	}
	return detail, nil
}
