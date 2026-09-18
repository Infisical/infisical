package assumeprivilege

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/permission/platform"
)

const tokenExpiry = time.Hour // 1 hour, matches Node.js

// assumePrivilegeClaims is the JWT payload for assume privilege tokens.
type assumePrivilegeClaims struct {
	jwt.RegisteredClaims
	TokenVersionID string `json:"tokenVersionId"`
	ActorType      string `json:"actorType"`
	ActorID        string `json:"actorId"`
	ProjectID      string `json:"projectId"`
	RequesterID    string `json:"requesterId"`
}

// PermissionService is the interface for permission checks.
type PermissionService interface {
	GetProjectPermission(ctx context.Context, args *permission.GetProjectPermissionArgs) (*permission.GetProjectPermissionResult, error)
}

// Deps holds the dependencies for the assume privilege service.
type Deps struct {
	AuthSecret        string
	PermissionService PermissionService
}

// Service provides assume privilege functionality.
type Service struct {
	logger            *slog.Logger
	authSecret        []byte
	permissionService PermissionService
}

// NewService creates a new assume privilege service.
func NewService(_ context.Context, logger *slog.Logger, deps *Deps) *Service {
	return &Service{
		logger:            logger.With(slog.String("service", "assumeprivilege")),
		authSecret:        []byte(deps.AuthSecret),
		permissionService: deps.PermissionService,
	}
}

// AssumeProjectPrivileges creates an assume privilege token after verifying the requester has permission.
// Port of assume-privilege-service.ts:24-76.
func (s *Service) AssumeProjectPrivileges(ctx context.Context, opts *AssumeProjectPrivilegesOpts) (*AssumeProjectPrivilegesResult, error) {
	// 1. Check requester has AssumePrivileges permission
	permResult, err := s.permissionService.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             auth.ActorTypeUser,
		ActorID:           opts.RequesterID,
		ProjectID:         opts.ProjectID,
		ActorAuthMethod:   opts.AuthMethod,
		ActorOrgID:        opts.RequesterOrgID,
		ActionProjectType: permission.ActionProjectTypeAny,
	})
	if err != nil {
		return nil, err
	}

	// Check permission based on target actor type
	checker := platform.NewAssumePrivilegeChecker(permResult.Permission.Ability)
	if opts.TargetActorType == auth.ActorTypeUser {
		if !checker.CanAssumeMemberPrivileges() {
			return nil, errutil.Forbidden("You do not have permission to assume member privileges")
		}
	} else {
		if !checker.CanAssumeIdentityPrivileges(opts.TargetActorID.String()) {
			return nil, errutil.Forbidden("You do not have permission to assume identity privileges")
		}
	}

	// 2. Verify target actor is part of the project
	_, err = s.permissionService.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             opts.TargetActorType,
		ActorID:           opts.TargetActorID,
		ProjectID:         opts.ProjectID,
		ActorAuthMethod:   opts.AuthMethod,
		ActorOrgID:        opts.RequesterOrgID,
		ActionProjectType: permission.ActionProjectTypeAny,
	})
	if err != nil {
		return nil, errutil.BadRequest("Target actor is not a member of this project").WithErrf("AssumeProjectPrivileges: %w", err)
	}

	// 3. Create JWT token
	now := time.Now()
	claims := assumePrivilegeClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(tokenExpiry)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
		TokenVersionID: opts.TokenVersionID.String(),
		ActorType:      string(opts.TargetActorType),
		ActorID:        opts.TargetActorID.String(),
		ProjectID:      opts.ProjectID,
		RequesterID:    opts.RequesterID.String(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signedToken, err := token.SignedString(s.authSecret)
	if err != nil {
		return nil, errutil.InternalServer("Failed to create assume privilege token").WithErrf("AssumeProjectPrivileges: %w", err)
	}

	return &AssumeProjectPrivilegesResult{
		ActorType:             opts.TargetActorType,
		ActorID:               opts.TargetActorID,
		ProjectID:             opts.ProjectID,
		AssumePrivilegesToken: signedToken,
	}, nil
}

// VerifyAssumePrivilegeToken verifies an assume privilege token and returns the decoded details.
// Port of assume-privilege-service.ts:78-118.
func (s *Service) VerifyAssumePrivilegeToken(ctx context.Context, opts *VerifyTokenOpts) (*auth.AssumedPrivilegeDetails, error) {
	// 1. Parse and verify JWT
	claims := &assumePrivilegeClaims{}
	_, err := jwt.ParseWithClaims(opts.Token, claims, func(t *jwt.Token) (any, error) {
		if t.Method.Alg() != jwt.SigningMethodHS256.Alg() {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return s.authSecret, nil
	})
	if err != nil {
		return nil, errutil.Unauthorized("Invalid assume privilege token").WithErrf("VerifyAssumePrivilegeToken: %w", err)
	}

	// 2. Verify tokenVersionId matches (ensures token is invalidated on logout)
	if claims.TokenVersionID != opts.TokenVersionID.String() {
		return nil, errutil.Forbidden("Invalid token version")
	}

	// 3. Parse UUIDs
	requesterID, err := uuid.Parse(claims.RequesterID)
	if err != nil {
		return nil, errutil.Unauthorized("Invalid requester ID in token")
	}
	actorID, err := uuid.Parse(claims.ActorID)
	if err != nil {
		return nil, errutil.Unauthorized("Invalid actor ID in token")
	}
	tokenVersionID, err := uuid.Parse(claims.TokenVersionID)
	if err != nil {
		return nil, errutil.Unauthorized("Invalid token version ID in token")
	}

	// 4. Re-verify requester still has AssumePrivileges permission
	permResult, err := s.permissionService.GetProjectPermission(ctx, &permission.GetProjectPermissionArgs{
		Actor:             auth.ActorTypeUser,
		ActorID:           requesterID,
		ProjectID:         claims.ProjectID,
		ActorAuthMethod:   opts.AuthMethod,
		ActorOrgID:        opts.OrgID,
		ActionProjectType: permission.ActionProjectTypeAny,
	})
	if err != nil {
		return nil, errutil.Forbidden("Requester no longer has project access").WithErrf("VerifyAssumePrivilegeToken: %w", err)
	}

	actorType := auth.ActorType(claims.ActorType)
	checker := platform.NewAssumePrivilegeChecker(permResult.Permission.Ability)
	if actorType == auth.ActorTypeUser {
		if !checker.CanAssumeMemberPrivileges() {
			return nil, errutil.Forbidden("Requester no longer has permission to assume member privileges")
		}
	} else {
		if !checker.CanAssumeIdentityPrivileges(actorID.String()) {
			return nil, errutil.Forbidden("Requester no longer has permission to assume identity privileges")
		}
	}

	return &auth.AssumedPrivilegeDetails{
		TokenVersionID: tokenVersionID,
		ProjectID:      claims.ProjectID,
		RequesterID:    requesterID,
		ActorType:      actorType,
		ActorID:        actorID,
	}, nil
}
