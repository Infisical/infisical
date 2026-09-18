package assumeprivilege

import (
	"github.com/google/uuid"

	"github.com/infisical/api/internal/services/auth"
)

// AssumeProjectPrivilegesOpts holds the input for assuming project privileges.
type AssumeProjectPrivilegesOpts struct {
	TargetActorType auth.ActorType
	TargetActorID   uuid.UUID
	ProjectID       string
	RequesterID     uuid.UUID
	RequesterOrgID  uuid.UUID
	AuthMethod      auth.ActorAuthMethod
	TokenVersionID  uuid.UUID
}

// AssumeProjectPrivilegesResult holds the output of assuming project privileges.
type AssumeProjectPrivilegesResult struct {
	ActorType             auth.ActorType
	ActorID               uuid.UUID
	ProjectID             string
	AssumePrivilegesToken string
}

// VerifyTokenOpts holds the input for verifying an assume privilege token.
type VerifyTokenOpts struct {
	Token          string
	TokenVersionID uuid.UUID
	AuthMethod     auth.ActorAuthMethod
	OrgID          uuid.UUID
}
