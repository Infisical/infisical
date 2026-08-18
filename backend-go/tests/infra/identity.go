//go:build integration

package infra

import (
	"github.com/google/uuid"

	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/tests/infra/nodejs"
)

// TestIdentity represents authentication context for test requests.
// Add new fields as needed without breaking existing callers.
type TestIdentity struct {
	AuthMode    auth.AuthMode
	ActorType   auth.ActorType
	ActorID     uuid.UUID
	OrgID       uuid.UUID
	RootOrgID   uuid.UUID
	ParentOrgID uuid.UUID

	// User-specific
	UserEmail     string
	Username      string
	IsMfaVerified bool

	// Identity-specific
	IdentityName       string
	IdentityAuthMethod auth.IdentityAuthMethod

	// Service token specific (reuses ServiceTokenScope from the nodejs package)
	ServiceTokenScopes []nodejs.ServiceTokenScope
}

// ToAuthIdentity converts TestIdentity to the auth.Identity used by handlers.
func (i *TestIdentity) ToAuthIdentity() *auth.Identity {
	identity := &auth.Identity{
		AuthMode:      i.AuthMode,
		Actor:         i.ActorType,
		ActorID:       i.ActorID,
		OrgID:         i.OrgID,
		RootOrgID:     i.RootOrgID,
		ParentOrgID:   i.ParentOrgID,
		IsMfaVerified: i.IsMfaVerified,
	}

	if i.ActorType == auth.ActorTypeUser {
		identity.UserAuthInfo = &auth.UserAuthInfo{
			UserID: i.ActorID,
			Email:  i.UserEmail,
		}
		identity.Email = i.UserEmail
		identity.Username = i.Username
	}

	if i.ActorType == auth.ActorTypeIdentity {
		identity.Name = i.IdentityName
		identity.IdentityAuthInfo = &auth.AuthInfo{
			IdentityID:   i.ActorID,
			IdentityName: i.IdentityName,
			AuthMethod:   i.IdentityAuthMethod,
		}
	}

	return identity
}

// UserIdentity creates a test identity for a user (JWT auth).
func UserIdentity(userID, orgID string) *TestIdentity {
	return &TestIdentity{
		AuthMode:  auth.AuthModeJWT,
		ActorType: auth.ActorTypeUser,
		ActorID:   uuid.MustParse(userID),
		OrgID:     uuid.MustParse(orgID),
	}
}

// MachineIdentity creates a test identity for a machine identity (access token auth).
func MachineIdentity(identityID, orgID string) *TestIdentity {
	return &TestIdentity{
		AuthMode:  auth.AuthModeIdentityAccessToken,
		ActorType: auth.ActorTypeIdentity,
		ActorID:   uuid.MustParse(identityID),
		OrgID:     uuid.MustParse(orgID),
	}
}

// ServiceTokenIdentity creates a test identity for a service token.
func ServiceTokenIdentity(tokenID, orgID string, scopes ...nodejs.ServiceTokenScope) *TestIdentity {
	return &TestIdentity{
		AuthMode:           auth.AuthModeServiceToken,
		ActorType:          auth.ActorTypeService,
		ActorID:            uuid.MustParse(tokenID),
		OrgID:              uuid.MustParse(orgID),
		ServiceTokenScopes: scopes,
	}
}

// Chainable modifiers for TestIdentity

// WithEmail sets the user email.
func (i *TestIdentity) WithEmail(email string) *TestIdentity {
	i.UserEmail = email
	return i
}

// WithUsername sets the username.
func (i *TestIdentity) WithUsername(username string) *TestIdentity {
	i.Username = username
	return i
}

// WithIdentityName sets the machine identity name.
func (i *TestIdentity) WithIdentityName(name string) *TestIdentity {
	i.IdentityName = name
	return i
}

// WithIdentityAuthMethod sets the identity auth method.
func (i *TestIdentity) WithIdentityAuthMethod(method auth.IdentityAuthMethod) *TestIdentity {
	i.IdentityAuthMethod = method
	return i
}

// WithMfaVerified sets the MFA verified flag.
func (i *TestIdentity) WithMfaVerified(verified bool) *TestIdentity {
	i.IsMfaVerified = verified
	return i
}

// WithRootOrgID sets the root org ID.
func (i *TestIdentity) WithRootOrgID(rootOrgID string) *TestIdentity {
	i.RootOrgID = uuid.MustParse(rootOrgID)
	return i
}
