package permission

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/infisical/gocasl"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/permission/project"
)

// ActorType identifies the kind of entity performing an action.
type ActorType string

const (
	ActorTypeUser     ActorType = "user"
	ActorTypeIdentity ActorType = "identity"
	ActorTypeService  ActorType = "service"
)

// ActorAuthMethod represents the authentication method used by the actor (e.g. "jwt", "api-key").
// An empty string means no specific method (e.g. platform-level actions).
type ActorAuthMethod string

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
	Actor             ActorType
	ActorID           uuid.UUID
	ProjectID         string // text in DB
	ActorAuthMethod   ActorAuthMethod
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

// permissionDAL defines the data-access methods required by the permission service.
type permissionDAL interface {
	GetPermission(ctx context.Context, params *GetPermissionParams) ([]PermissionData, error)
	FindProjectByID(ctx context.Context, projectID string) (*ProjectDetail, error)
	FindUserUsername(ctx context.Context, userID uuid.UUID) (string, error)
	FindIdentityName(ctx context.Context, identityID uuid.UUID) (string, error)
	FindServiceTokenByID(ctx context.Context, tokenID string) (*ServiceTokenDetail, error)
}

// Deps holds the dependencies for the permission shared service.
type Deps struct {
	DAL permissionDAL
}

// Service provides project and org permission checks.
type Service struct {
	logger *slog.Logger
	dal    permissionDAL
}

// NewService creates a new permission service instance.
func NewService(logger *slog.Logger, deps Deps) *Service {
	return &Service{
		logger: logger.With(slog.String("service", "permission")),
		dal:    deps.DAL,
	}
}

// GetProjectPermission resolves the effective permissions for an actor within a project.
// Exact port of permission-service.ts:350-510.
func (p *Service) GetProjectPermission(ctx context.Context, args *GetProjectPermissionArgs) (*GetProjectPermissionResult, error) {
	// 1. SERVICE actor → delegate to service token path
	if args.Actor == ActorTypeService {
		return p.getServiceTokenProjectPermission(ctx, args.ActorID.String(), args.ProjectID, args.ActorOrgID, args.ActionProjectType)
	}

	// 2. TODO(go): assumed privilege check

	// 3. Validate actor type
	if args.Actor != ActorTypeUser && args.Actor != ActorTypeIdentity {
		return nil, errutil.BadRequest("Invalid actor provided")
	}

	// 4. Find project
	projectDetails, err := p.dal.FindProjectByID(ctx, args.ProjectID)
	if err != nil {
		return nil, errutil.DatabaseErr("finding project").WithErr(err)
	}
	if projectDetails == nil {
		return nil, errutil.NotFound("Project with %s not found", args.ProjectID)
	}

	// 5. Org ownership
	if projectDetails.OrgID != args.ActorOrgID {
		return nil, errutil.Forbidden("This project does not belong to your selected organization.")
	}

	// 6. ActionProjectType check
	if args.ActionProjectType != ActionProjectTypeAny && ActionProjectType(projectDetails.Type) != args.ActionProjectType {
		return nil, errutil.BadRequest(
			"The project is of type %s. Operations of type %s are not allowed.",
			projectDetails.Type, string(args.ActionProjectType),
		)
	}

	// 7. Query permission data
	permissionData, err := p.dal.GetPermission(ctx, &GetPermissionParams{
		Scope:     AccessScopeProject,
		OrgID:     projectDetails.OrgID,
		ProjectID: args.ProjectID,
		ActorID:   args.ActorID,
		ActorType: args.Actor,
	})
	if err != nil {
		return nil, errutil.DatabaseErr("getting project permission").WithErr(err)
	}

	// 8. Empty check
	if len(permissionData) == 0 {
		return nil, errutil.Forbidden(
			"You are not a member of this project with ID %s. Please assign this %s to the project with the appropriate permissions, then try again.",
			args.ProjectID, string(args.Actor),
		)
	}

	// 9. Flatten active roles
	permissionFromRoles := flattenActiveRolesFromMemberships(permissionData)

	// 10. TODO(go): SSO enforcement (validateOrgSSO + org permission bypass check)

	// 11. Build rules
	rules := buildProjectPermissionRules(permissionFromRoles)

	// 12. Marshal rules to JSON
	rulesJSON, err := json.Marshal(rules)
	if err != nil {
		return nil, fmt.Errorf("marshaling permission rules: %w", err)
	}

	// 13. Fetch username
	var username string
	if args.Actor == ActorTypeUser {
		username, err = p.dal.FindUserUsername(ctx, args.ActorID)
		if err != nil {
			return nil, errutil.DatabaseErr("finding user username").WithErr(err)
		}
	} else {
		username, err = p.dal.FindIdentityName(ctx, args.ActorID)
		if err != nil {
			return nil, errutil.DatabaseErr("finding identity name").WithErr(err)
		}
	}

	// 14. Build template vars
	metadataMap := make(map[string]string)
	if len(permissionData) > 0 {
		for _, metadataEntry := range permissionData[0].Metadata {
			metadataMap[metadataEntry.Key] = metadataEntry.Value
		}
	}

	vars := map[string]any{
		"identity": map[string]any{
			"id":       args.ActorID.String(),
			"username": username,
			"metadata": metadataMap,
		},
	}

	// 15. Interpolate Handlebars templates in rules JSON with actual values
	rulesStr := InterpolateRulesJSON(string(rulesJSON), vars)

	// 16. Load ability from interpolated JSON
	ability, err := gocasl.LoadFromJSON([]byte(rulesStr), gocasl.LoadOptions{
		FieldOps: PermissionFieldOps(),
	})
	if err != nil {
		return nil, fmt.Errorf("loading permission rules: %w", err)
	}

	// 17. Build memberships for result
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
	serviceToken, err := p.dal.FindServiceTokenByID(ctx, serviceTokenID)
	if err != nil {
		return nil, errutil.DatabaseErr("finding service token").WithErr(err)
	}
	if serviceToken == nil {
		return nil, errutil.NotFound("Service token with ID '%s' not found", serviceTokenID)
	}

	// 2. Verify project linked
	serviceTokenProject, err := p.dal.FindProjectByID(ctx, serviceToken.ProjectID)
	if err != nil {
		return nil, errutil.DatabaseErr("finding service token project").WithErr(err)
	}
	if serviceTokenProject == nil {
		return nil, errutil.BadRequest("Service token not linked to a project")
	}

	// 3. Verify projectId match
	if serviceToken.ProjectID != projectID {
		return nil, errutil.Forbidden("Service token not a part of the specified project with ID %s", projectID)
	}

	// 4. Verify orgId match
	if serviceTokenProject.OrgID != actorOrgID {
		return nil, errutil.Forbidden("Service token not a part of the specified organization with ID %s", actorOrgID.String())
	}

	// 5. Verify actionProjectType match
	if actionProjectType != ActionProjectTypeAny && ActionProjectType(serviceTokenProject.Type) != actionProjectType {
		return nil, errutil.BadRequest(
			"The project is of type %s. Operations of type %s are not allowed.",
			serviceTokenProject.Type, string(actionProjectType),
		)
	}

	// 6. Parse scopes and build rules
	var scopes []ServiceTokenScope
	if err := json.Unmarshal([]byte(serviceToken.Scopes), &scopes); err != nil {
		return nil, fmt.Errorf("parsing service token scopes: %w", err)
	}

	rules := buildServiceTokenProjectPermission(scopes, serviceToken.Permissions)

	// 7. Load ability from JSON
	rulesJSON, err := json.Marshal(rules)
	if err != nil {
		return nil, fmt.Errorf("marshaling service token rules: %w", err)
	}

	ability, err := gocasl.LoadFromJSON(rulesJSON, gocasl.LoadOptions{
		FieldOps: PermissionFieldOps(),
	})
	if err != nil {
		return nil, fmt.Errorf("loading service token rules: %w", err)
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
func flattenActiveRolesFromMemberships(memberships []PermissionData) []roleWithPermissions {
	now := time.Now()
	var result []roleWithPermissions

	for i := range memberships {
		membership := &memberships[i]
		for j := range membership.Roles {
			role := &membership.Roles[j]
			if role.IsTemporary && (role.TemporaryAccessEndTime == nil || now.After(*role.TemporaryAccessEndTime)) {
				continue
			}
			result = append(result, roleWithPermissions{
				Role:        role.Role,
				Permissions: role.Permissions,
			})
		}

		for j := range membership.AdditionalPrivileges {
			additionalPrivilege := &membership.AdditionalPrivileges[j]
			if additionalPrivilege.IsTemporary && (additionalPrivilege.TemporaryAccessEndTime == nil || now.After(*additionalPrivilege.TemporaryAccessEndTime)) {
				continue
			}
			result = append(result, roleWithPermissions{
				Role:        project.RoleCustom,
				Permissions: additionalPrivilege.Permissions,
			})
		}
	}

	return result
}

// buildMembershipsFromPermissionData converts DAL permission data to the service result type.
func buildMembershipsFromPermissionData(permissionData []PermissionData) []Membership {
	memberships := make([]Membership, 0, len(permissionData))
	for i := range permissionData {
		data := &permissionData[i]
		membership := Membership{ID: data.ID}
		for j := range data.Roles {
			role := &data.Roles[j]
			membershipRole := MembershipRole{Role: role.Role}
			if role.CustomRoleSlug != nil {
				membershipRole.CustomRoleSlug = *role.CustomRoleSlug
			}
			membership.Roles = append(membership.Roles, membershipRole)
		}
		memberships = append(memberships, membership)
	}
	return memberships
}

// checkProjectEnforcement returns a function that checks project-level enforcements.
func checkProjectEnforcement(projectDetails *ProjectDetail) func(string) bool {
	return func(enforcement string) bool {
		if enforcement == "enforceEncryptedSecretManagerSecretMetadata" {
			return projectDetails.EnforceEncryptedSecretManagerSecretMetadata
		}
		return false
	}
}
