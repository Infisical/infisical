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

// RoleInfo represents a single role assignment from the permission query.
// Uses go-jet automatic nesting via sql:"primary_key" tag.
type RoleInfo struct {
	ID                     uuid.UUID      `sql:"primary_key" alias:"membership_roles.id"`
	Role                   string         `alias:"membership_roles.role"`
	IsTemporary            sql.Null[bool] `alias:"membership_roles.is_temporary"`
	TemporaryAccessEndTime sql.NullTime   `alias:"membership_roles.temporary_access_end_time"`
	// Custom role fields from LEFT JOIN roles table
	CustomRoleSlug sql.NullString `alias:"roles.slug"`
	Permissions    sql.NullString `alias:"roles.permissions"`
}

// AdditionalPrivilegeInfo represents an additional privilege from the permission query.
// Uses go-jet automatic nesting via sql:"primary_key" tag.
type AdditionalPrivilegeInfo struct {
	ID                     uuid.UUID      `sql:"primary_key" alias:"additional_privileges.id"`
	Permissions            sql.NullString `alias:"additional_privileges.permissions"`
	IsTemporary            sql.Null[bool] `alias:"additional_privileges.is_temporary"`
	TemporaryAccessEndTime sql.NullTime   `alias:"additional_privileges.temporary_access_end_time"`
}

// MetadataInfo represents identity metadata key-value pair.
// Uses go-jet automatic nesting via sql:"primary_key" tag.
type MetadataInfo struct {
	ID    uuid.UUID `sql:"primary_key" alias:"identity_metadata.id"`
	Key   string    `alias:"identity_metadata.key"`
	Value string    `alias:"identity_metadata.value"`
}

// PermissionData is the nested result of the permission query.
// Go-jet automatically nests Roles, AdditionalPrivileges, and Metadata
// based on sql:"primary_key" tags in child structs.
type PermissionData struct {
	ID                          uuid.UUID                 `sql:"primary_key" alias:"memberships.id"`
	ScopeOrgID                  uuid.UUID                 `alias:"memberships.scope_org_id"`
	OrgAuthEnforced             sql.Null[bool]            `alias:"organizations.auth_enforced"`
	OrgGoogleSsoAuthEnforced    bool                      `alias:"organizations.google_sso_auth_enforced"`
	BypassOrgAuthEnabled        bool                      `alias:"organizations.bypass_org_auth_enabled"`
	ShouldUseNewPrivilegeSystem bool                      `alias:"organizations.should_use_new_privilege_system"`
	RootOrgID                   sql.Null[uuid.UUID]       `alias:"organizations.root_org_id"`
	Roles                       []RoleInfo                `alias:"membership_roles"`
	AdditionalPrivileges        []AdditionalPrivilegeInfo `alias:"additional_privileges"`
	Metadata                    []MetadataInfo            `alias:"identity_metadata"`
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

// GetPermission executes the main permission join query.
// Uses go-jet automatic nesting to populate Roles, AdditionalPrivileges, and Metadata arrays.
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

	// Go-jet automatically nests Roles, AdditionalPrivileges, and Metadata arrays
	// based on sql:"primary_key" tags in the child structs.
	var result []PermissionData
	err := stmt.QueryContext(ctx, d.db.Replica(), &result)
	if err != nil {
		if errors.Is(err, qrm.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}

	return result, nil
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
