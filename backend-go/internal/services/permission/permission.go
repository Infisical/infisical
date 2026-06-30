package permission

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/infisical/gocasl"
	"github.com/jackc/pgx/v5"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/database/pg/qb"
	"github.com/infisical/api/internal/database/pg/sqln"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/libs/fn"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission/project"
)

// ActionProjectType scopes the permission check to a specific project type.
type ActionProjectType string

const (
	ActionProjectTypeSecretManager      ActionProjectType = "secret-manager"
	ActionProjectTypeCertificateManager ActionProjectType = "certificate-manager"
	ActionProjectTypeKMS                ActionProjectType = "kms"
	ActionProjectTypeSSH                ActionProjectType = "ssh"
	ActionProjectTypeSecretScanning     ActionProjectType = "secret-scanning"
	ActionProjectTypeAny                ActionProjectType = "any"
)

// GetProjectPermissionArgs holds the input for a project-level permission check.
type GetProjectPermissionArgs struct {
	Actor             auth.ActorType
	ActorID           uuid.UUID
	ProjectID         string // text in DB
	ActorAuthMethod   auth.ActorAuthMethod
	ActorOrgID        uuid.UUID
	ActionProjectType ActionProjectType
}

// ProjectPermission is the resolved permission set for a project-level actor.
type ProjectPermission struct {
	Ability *gocasl.Ability
}

// Membership represents a project membership entry with its assigned roles.
type Membership struct {
	ID    uuid.UUID
	Roles []MembershipRole
}

// MembershipRole is a single role assignment within a membership.
type MembershipRole struct {
	Role           string
	CustomRoleSlug string
}

// GetProjectPermissionResult holds the output of a project-level permission check.
type GetProjectPermissionResult struct {
	Permission            ProjectPermission
	Memberships           []Membership
	HasProjectEnforcement func(check string) bool
}

// HasRole reports whether any membership includes the given role slug.
func (r *GetProjectPermissionResult) HasRole(role string) bool {
	for _, membership := range r.Memberships {
		for _, membershipRole := range membership.Roles {
			if membershipRole.Role == role || membershipRole.CustomRoleSlug == role {
				return true
			}
		}
	}
	return false
}

// Deps holds the dependencies for the permission shared service.
type Deps struct {
	DB pg.DB
}

// Service provides project and org permission checks.
type Service struct {
	logger *slog.Logger
	db     pg.DB
}

// NewService creates a new permission service instance.
func NewService(_ context.Context, logger *slog.Logger, deps *Deps) *Service {
	return &Service{
		logger: logger.With(slog.String("service", "permission")),
		db:     deps.DB,
	}
}

// GetProjectPermission resolves the effective permissions for an actor within a project.
// Exact port of permission-service.ts:403-573.
func (p *Service) GetProjectPermission(ctx context.Context, args *GetProjectPermissionArgs) (*GetProjectPermissionResult, error) {
	// 1. SERVICE actor → delegate to service token path
	if args.Actor == auth.ActorTypeService {
		return p.getServiceTokenProjectPermission(ctx, args.ActorID.String(), args.ProjectID, args.ActorOrgID, args.ActionProjectType)
	}

	// 2. Assumed privilege check — allows users to assume another actor's privileges.
	// Port of permission-service.ts:482-492.
	if assumed := auth.AssumedPrivilegeFromContext(ctx); assumed != nil {
		if args.Actor == auth.ActorTypeUser &&
			args.ActorID == assumed.RequesterID &&
			args.ProjectID == assumed.ProjectID {
			args.Actor = assumed.ActorType
			args.ActorID = assumed.ActorID
		}
	}

	// 3. Validate actor type
	if args.Actor != auth.ActorTypeUser && args.Actor != auth.ActorTypeIdentity {
		return nil, errutil.BadRequest("Invalid actor provided").WithErrf("GetProjectPermission: unsupported actor type %s", args.Actor)
	}

	// TODO(go): request-scoped memoization — avoid redundant permission checks within same request.
	// Port of permission-service.ts:447-455, 568.
	// Implementation requires:
	// - Request context with memoizer (similar to Node.js @fastify/request-context)
	// - Memoization key based on projectId + actor + actorId + actorAuthMethod + actionProjectType + actorOrgId

	// TODO(go): Redis fingerprint cache — two-tier caching with marker TTL (10s) + data TTL (10m).
	// Port of permission-service.ts:465-483 (withCacheFingerprint).
	// Implementation requires:
	// - Redis keystore integration
	// - Fingerprint-based cache invalidation (permissionDAL.getPermissionFingerprint)
	// - Cache reviver for date fields

	// 4. Find project
	projectDetails, err := p.findProjectByID(ctx, args.ProjectID)
	if err != nil {
		return nil, errutil.DatabaseErr("finding project").WithErrf("GetProjectPermission(projectId=%s): %w", args.ProjectID, err)
	}
	if projectDetails == nil {
		return nil, errutil.NotFound("Project with %s not found", args.ProjectID).WithErrf("GetProjectPermission: project not found in DB")
	}

	// 5. Org ownership
	if projectDetails.OrgID != args.ActorOrgID {
		return nil, errutil.Forbidden("This project does not belong to your selected organization.").WithErrf("GetProjectPermission(projectId=%s): org mismatch projectOrg=%s actorOrg=%s", args.ProjectID, projectDetails.OrgID, args.ActorOrgID)
	}

	// 6. ActionProjectType check
	if args.ActionProjectType != ActionProjectTypeAny && ActionProjectType(projectDetails.Type) != args.ActionProjectType {
		return nil, errutil.BadRequest(
			"The project is of type %s. Operations of type %s are not allowed.",
			projectDetails.Type, string(args.ActionProjectType),
		).WithErrf("GetProjectPermission(projectId=%s): type mismatch", args.ProjectID)
	}

	// 7. Query permission data
	permissionData, err := p.getPermission(ctx, &getPermissionParams{
		Scope:     AccessScopeProject,
		OrgID:     projectDetails.OrgID,
		ProjectID: args.ProjectID,
		ActorID:   args.ActorID,
		ActorType: args.Actor,
	})
	if err != nil {
		return nil, errutil.DatabaseErr("getting project permission").WithErrf("GetProjectPermission(projectId=%s, actorId=%s): %w", args.ProjectID, args.ActorID, err)
	}

	// 8. Empty check
	if len(permissionData) == 0 {
		return nil, errutil.Forbidden(
			"You are not a member of this project with ID %s. Please assign this %s to the project with the appropriate permissions, then try again.",
			args.ProjectID, string(args.Actor),
		).WithErrf("GetProjectPermission(projectId=%s, actorId=%s): no membership found", args.ProjectID, args.ActorID)
	}

	// 9. Flatten active roles
	permissionFromRoles := flattenActiveRolesFromMemberships(permissionData)

	// 10. TODO(go): SSO enforcement — validate SSO requirements and bypass permissions.
	// Port of permission-service.ts:508-516 (validateOrgSSO) and L377-396 (canBypassSso).
	// Implementation requires:
	// - validateOrgSSO function checking orgAuthEnforced, googleSsoAuthEnforced, bypassOrgAuthEnabled
	// - Org-level permission check for SSO bypass capability
	// - Only applies to auth.ActorTypeUser

	// 11. Build rules
	rules, parseErrors := buildProjectPermissionRules(permissionFromRoles)
	for _, parseErr := range parseErrors {
		p.logger.WarnContext(ctx, "custom role permission parse failed (fail-closed: role contributes no rules)",
			slog.String("projectId", args.ProjectID),
			slog.Any("error", parseErr))
	}

	// 12. Marshal rules to JSON
	rulesJSON, err := json.Marshal(rules)
	if err != nil {
		return nil, errutil.InternalServer("Failed to marshal permission rules").WithErrf("GetProjectPermission: %w", err)
	}

	// 13. Fetch username
	var username string
	if args.Actor == auth.ActorTypeUser {
		username, err = p.findUserUsername(ctx, args.ActorID)
		if err != nil {
			return nil, errutil.DatabaseErr("finding user username").WithErrf("GetProjectPermission(userId=%s): %w", args.ActorID, err)
		}
	} else {
		username, err = p.findIdentityName(ctx, args.ActorID)
		if err != nil {
			return nil, errutil.DatabaseErr("finding identity name").WithErrf("GetProjectPermission(identityId=%s): %w", args.ActorID, err)
		}
	}

	// 14. Build template vars with metadata
	metadataMap := make(map[string]string)
	if len(permissionData) > 0 {
		for _, metadataEntry := range permissionData[0].Metadata {
			metadataMap[metadataEntry.Key] = metadataEntry.Value
		}
	}

	// 15. Build identity auth info for template vars (OIDC/Kubernetes/AWS claims)
	// Port of permission-service.ts:528-532.
	identityAuthMap := buildIdentityAuthMap(ctx, args.ActorID)

	vars := map[string]any{
		"identity": map[string]any{
			"id":       args.ActorID.String(),
			"username": username,
			"metadata": metadataMap,
			"auth":     identityAuthMap,
		},
	}

	// 16. Interpolate Handlebars templates in rules JSON with actual values
	rulesStr := InterpolateRulesJSON(string(rulesJSON), vars)

	// 17. Load ability from interpolated JSON
	ability, err := gocasl.LoadFromJSON([]byte(rulesStr), gocasl.LoadOptions{
		FieldOps: PermissionFieldOps(),
	})
	if err != nil {
		return nil, errutil.InternalServer("Failed to load permission rules").WithErrf("GetProjectPermission: %w", err)
	}

	// 18. Build memberships for result
	memberships := buildMembershipsFromPermissionData(permissionData)

	return &GetProjectPermissionResult{
		Permission:            ProjectPermission{Ability: ability},
		Memberships:           memberships,
		HasProjectEnforcement: checkProjectEnforcement(projectDetails),
	}, nil
}

// getServiceTokenProjectPermission handles service token permission resolution.
// Port of permission-service.ts:310-348.
func (p *Service) getServiceTokenProjectPermission(
	ctx context.Context,
	serviceTokenID string,
	projectID string,
	actorOrgID uuid.UUID,
	actionProjectType ActionProjectType,
) (*GetProjectPermissionResult, error) {
	// 1. Find service token
	serviceToken, err := p.findServiceTokenByID(ctx, serviceTokenID)
	if err != nil {
		return nil, errutil.DatabaseErr("finding service token").WithErrf("getServiceTokenProjectPermission(tokenId=%s): %w", serviceTokenID, err)
	}
	if serviceToken == nil {
		return nil, errutil.NotFound("Service token with ID '%s' not found", serviceTokenID).WithErrf("getServiceTokenProjectPermission: token not found in DB")
	}

	// 2. Verify project linked
	serviceTokenProject, err := p.findProjectByID(ctx, serviceToken.ProjectID)
	if err != nil {
		return nil, errutil.DatabaseErr("finding service token project").WithErrf("getServiceTokenProjectPermission(projectId=%s): %w", serviceToken.ProjectID, err)
	}
	if serviceTokenProject == nil {
		return nil, errutil.BadRequest("Service token not linked to a project").WithErrf("getServiceTokenProjectPermission(tokenId=%s): project not found", serviceTokenID)
	}

	// 3. Verify projectId match
	if serviceToken.ProjectID != projectID {
		return nil, errutil.Forbidden("Service token not a part of the specified project with ID %s", projectID).WithErrf("getServiceTokenProjectPermission(tokenId=%s): project mismatch tokenProject=%s requestedProject=%s", serviceTokenID, serviceToken.ProjectID, projectID)
	}

	// 4. Verify orgId match
	if serviceTokenProject.OrgID != actorOrgID {
		return nil, errutil.Forbidden("Service token not a part of the specified organization with ID %s", actorOrgID.String()).WithErrf("getServiceTokenProjectPermission(tokenId=%s): org mismatch", serviceTokenID)
	}

	// 5. Verify actionProjectType match
	if actionProjectType != ActionProjectTypeAny && ActionProjectType(serviceTokenProject.Type) != actionProjectType {
		return nil, errutil.BadRequest(
			"The project is of type %s. Operations of type %s are not allowed.",
			serviceTokenProject.Type, string(actionProjectType),
		).WithErrf("getServiceTokenProjectPermission(tokenId=%s): type mismatch", serviceTokenID)
	}

	// 6. Parse scopes and build rules
	var scopes []ServiceTokenScope
	if err := json.Unmarshal([]byte(serviceToken.Scopes), &scopes); err != nil {
		return nil, errutil.InternalServer("Failed to parse service token scopes").WithErrf("getServiceTokenProjectPermission: %w", err)
	}

	rules := buildServiceTokenProjectPermission(scopes, serviceToken.Permissions)

	// 7. Load ability from JSON
	rulesJSON, err := json.Marshal(rules)
	if err != nil {
		return nil, errutil.InternalServer("Failed to marshal service token rules").WithErrf("getServiceTokenProjectPermission: %w", err)
	}

	ability, err := gocasl.LoadFromJSON(rulesJSON, gocasl.LoadOptions{
		FieldOps: PermissionFieldOps(),
	})
	if err != nil {
		return nil, errutil.InternalServer("Failed to load service token rules").WithErrf("getServiceTokenProjectPermission: %w", err)
	}

	return &GetProjectPermissionResult{
		Permission:            ProjectPermission{Ability: ability},
		Memberships:           nil,
		HasProjectEnforcement: checkProjectEnforcement(serviceTokenProject),
	}, nil
}

// flattenActiveRolesFromMemberships filters expired temporary roles and flattens all active
// roles + additional privileges from memberships.
// Exact port of permission-service.ts:125-146.
func flattenActiveRolesFromMemberships(memberships []permissionData) []roleWithPermissions {
	now := time.Now()
	var result []roleWithPermissions

	for i := range memberships {
		membership := &memberships[i]
		for j := range membership.Roles {
			role := &membership.Roles[j]
			isTemporary := role.IsTemporary.Valid && role.IsTemporary.V
			if isTemporary && (!role.TemporaryAccessEndTime.Valid || now.After(role.TemporaryAccessEndTime.V)) {
				continue
			}
			var permissions *string
			if role.Permissions.Valid {
				permissions = &role.Permissions.V
			}
			result = append(result, roleWithPermissions{
				Role:        role.Role,
				Permissions: permissions,
			})
		}

		for j := range membership.AdditionalPrivileges {
			additionalPrivilege := &membership.AdditionalPrivileges[j]
			isTemporary := additionalPrivilege.IsTemporary.Valid && additionalPrivilege.IsTemporary.V
			if isTemporary && (!additionalPrivilege.TemporaryAccessEndTime.Valid || now.After(additionalPrivilege.TemporaryAccessEndTime.V)) {
				continue
			}
			var permissions *string
			if additionalPrivilege.Permissions.Valid {
				permissions = &additionalPrivilege.Permissions.V
			}
			result = append(result, roleWithPermissions{
				Role:        project.RoleCustom,
				Permissions: permissions,
			})
		}
	}

	return result
}

// buildMembershipsFromPermissionData converts DAL permission data to the service result type.
func buildMembershipsFromPermissionData(permissionData []permissionData) []Membership {
	memberships := make([]Membership, 0, len(permissionData))
	for i := range permissionData {
		data := &permissionData[i]
		membership := Membership{ID: data.ID}
		for j := range data.Roles {
			role := &data.Roles[j]
			membershipRole := MembershipRole{Role: role.Role}
			if role.CustomRoleSlug.Valid {
				membershipRole.CustomRoleSlug = role.CustomRoleSlug.V
			}
			membership.Roles = append(membership.Roles, membershipRole)
		}
		memberships = append(memberships, membership)
	}
	return memberships
}

// checkProjectEnforcement returns a function that checks project-level enforcements.
func checkProjectEnforcement(projectDetails *projectDetail) func(string) bool {
	return func(enforcement string) bool {
		if enforcement == "enforceEncryptedSecretManagerSecretMetadata" {
			return projectDetails.EnforceEncryptedSecretManagerSecretMetadata
		}
		return false
	}
}

// buildIdentityAuthMap extracts identity auth info (OIDC/Kubernetes/AWS claims) from Identity
// for use in permission template variable interpolation.
// Port of permission-service.ts:528-532.
func buildIdentityAuthMap(ctx context.Context, actorID uuid.UUID) map[string]any {
	identity, err := auth.IdentityFromContext(ctx)
	if err != nil || identity.IdentityAuthInfo == nil {
		return map[string]any{}
	}

	authInfo := identity.IdentityAuthInfo
	if authInfo.IdentityID != actorID {
		return map[string]any{}
	}

	result := make(map[string]any)

	if authInfo.OIDC != nil && len(authInfo.OIDC.Claims) > 0 {
		result["oidc"] = authInfo.OIDC.Claims
	}

	if authInfo.Kubernetes != nil {
		result["kubernetes"] = map[string]string{
			"namespace": authInfo.Kubernetes.Namespace,
			"name":      authInfo.Kubernetes.Name,
		}
	}

	if authInfo.AWS != nil {
		result["aws"] = map[string]string{
			"accountId":    authInfo.AWS.AccountID,
			"arn":          authInfo.AWS.ARN,
			"userId":       authInfo.AWS.UserID,
			"partition":    authInfo.AWS.Partition,
			"service":      authInfo.AWS.Service,
			"resourceType": authInfo.AWS.ResourceType,
			"resourceName": authInfo.AWS.ResourceName,
		}
	}

	return result
}

// --- Query Types ---

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
	ActorType auth.ActorType
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

// --- Query methods ---

// getPermission executes the main permission join query.
func (s *Service) getPermission(ctx context.Context, params *getPermissionParams) ([]permissionData, error) {
	// Build actor subquery for group membership
	var groupSubquery string
	if params.ActorType == auth.ActorTypeUser {
		groupSubquery = `
			SELECT grp.id FROM groups grp
			INNER JOIN user_group_membership ugm ON ugm."groupId" = grp.id
			WHERE ugm."userId" = @actorID
		`
	} else {
		groupSubquery = `
			SELECT grp.id FROM groups grp
			INNER JOIN identity_group_membership igm ON igm."groupId" = grp.id
			WHERE igm."identityId" = @actorID
		`
	}

	// Build WHERE conditions using qb.Where
	where := qb.NewWhere().Add(`membership."scopeOrgId" = @orgID`)

	// Actor condition
	if params.ActorType == auth.ActorTypeUser {
		where.Add(`(membership."actorUserId" = @actorID OR membership."actorGroupId" IN (` + groupSubquery + `))`)
	} else {
		where.Add(`(membership."actorIdentityId" = @actorID OR membership."actorGroupId" IN (` + groupSubquery + `))`)
	}

	// Scope condition
	if params.Scope == AccessScopeOrganization {
		where.Add("membership.scope = 'organization'")
	} else {
		where.Add("membership.scope = 'project'").Add(`membership."scopeProjectId" = @projectID`)
	}

	// Build additional privilege join condition.
	// Match the privilege against the request's actor literal, not against
	// membership.actor*Id. Group-derived memberships have actorUserId/actorIdentityId
	// NULL, so the column-to-column predicate dropped privileges for any user/identity
	// whose only project access is via a group.
	apJoinCond := qb.NewWhere()
	if params.ActorType == auth.ActorTypeIdentity {
		apJoinCond.Add(`addlPriv."actorIdentityId" = @actorID`)
	} else {
		apJoinCond.Add(`addlPriv."actorUserId" = @actorID`)
	}
	if params.Scope == AccessScopeOrganization {
		apJoinCond.Add(`membership."scopeOrgId" = addlPriv."orgId"`)
	} else {
		apJoinCond.Add(`membership."scopeProjectId" = addlPriv."projectId"`)
	}

	// Build metadata join condition
	metaJoinCond := qb.NewWhere()
	if params.ActorType == auth.ActorTypeUser {
		metaJoinCond.Add(`identityMeta."userId" = @actorID`).Add(`membership."scopeOrgId" = identityMeta."orgId"`)
	} else {
		metaJoinCond.Add(`identityMeta."identityId" = @actorID`)
	}

	query := `
		SELECT
			membership.id AS membership_id,
			membership."scopeOrgId",
			org."authEnforced",
			org."googleSsoAuthEnforced",
			org."bypassOrgAuthEnabled",
			org."shouldUseNewPrivilegeSystem",
			org."rootOrgId",
			memberRole.id AS role_id,
			memberRole.role,
			memberRole."isTemporary" AS role_is_temporary,
			memberRole."temporaryAccessEndTime" AS role_temporary_access_end_time,
			customRole.slug AS custom_role_slug,
			customRole.permissions AS custom_role_permissions,
			addlPriv.id AS ap_id,
			addlPriv.permissions AS ap_permissions,
			addlPriv."isTemporary" AS ap_is_temporary,
			addlPriv."temporaryAccessEndTime" AS ap_temporary_access_end_time,
			identityMeta.id AS meta_id,
			identityMeta.key AS meta_key,
			identityMeta.value AS meta_value
		FROM memberships membership
		INNER JOIN membership_roles memberRole ON membership.id = memberRole."membershipId"
		INNER JOIN organizations org ON membership."scopeOrgId" = org.id
		LEFT JOIN roles customRole ON memberRole."customRoleId" = customRole.id
		LEFT JOIN additional_privileges addlPriv ON ` + apJoinCond.String() + `
		LEFT JOIN identity_metadata identityMeta ON ` + metaJoinCond.String() + `
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
		SELECT id, name, slug, "orgId", type, "enforceEncryptedSecretManagerSecretMetadata"
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
		SELECT id, "projectId", "expiresAt", scopes, permissions
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
