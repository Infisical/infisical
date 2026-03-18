package permission

import "context"

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
	ActorID           string
	ProjectID         string
	ActorAuthMethod   ActorAuthMethod
	ActorOrgID        string
	ActionProjectType ActionProjectType
}

// ProjectPermission is the resolved permission set for a project-level actor.
// TODO: Replace with real CASL-equivalent ability once implemented.
type ProjectPermission struct {
	// Placeholder — will hold the built permission/ability object.
}

// Membership represents a project membership entry with its assigned roles.
type Membership struct {
	ID    string
	Roles []MembershipRole
}

// MembershipRole is a single role assignment within a membership.
type MembershipRole struct {
	Role           string
	CustomRoleSlug string
}

// GetProjectPermissionResult holds the output of a project-level permission check.
type GetProjectPermissionResult struct {
	Permission  ProjectPermission
	Memberships []Membership
}

// HasRole reports whether any membership includes the given role slug.
func (r *GetProjectPermissionResult) HasRole(role string) bool {
	for _, m := range r.Memberships {
		for _, mr := range m.Roles {
			if mr.Role == role || mr.CustomRoleSlug == role {
				return true
			}
		}
	}
	return false
}

// permissionDAL defines the data-access methods required by the permission library.
type permissionDAL interface {
	// TODO: Define DAL methods as the permission system is fleshed out.
}

// Service provides project and org permission checks.
type SharedService struct {
	dal permissionDAL
}

// NewService creates a new permission service instance.
func NewSharedService(dal permissionDAL) *SharedService {
	return &SharedService{dal: dal}
}

// GetProjectPermission resolves the effective permissions for an actor within a project.
// TODO: Implement the full permission resolution logic (role lookup, CASL rule building, etc.).
func (p *SharedService) GetProjectPermission(ctx context.Context, args GetProjectPermissionArgs) (*GetProjectPermissionResult, error) {
	panic("not implemented")
}
