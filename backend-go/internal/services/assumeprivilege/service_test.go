package assumeprivilege

import (
	"context"
	"encoding/json"
	"log/slog"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/infisical/gocasl"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/permission"
	"github.com/infisical/api/internal/services/permission/project"
)

type mockPermissionService struct {
	getProjectPermissionResult *permission.GetProjectPermissionResult
	getProjectPermissionErr    error
	callCount                  int
}

func (m *mockPermissionService) GetProjectPermission(_ context.Context, _ *permission.GetProjectPermissionArgs) (*permission.GetProjectPermissionResult, error) {
	m.callCount++
	return m.getProjectPermissionResult, m.getProjectPermissionErr
}

func buildTestAbility(t *testing.T, canAssumeMember, canAssumeIdentity bool) *gocasl.Ability {
	t.Helper()
	var rules []gocasl.JSONRule
	if canAssumeMember {
		rules = append(rules, gocasl.JSONRule{
			Action:  []string{project.MemberActionAssumePrivileges.Name()},
			Subject: []string{project.SubMember},
		})
	}
	if canAssumeIdentity {
		rules = append(rules, gocasl.JSONRule{
			Action:  []string{project.IdentityActionAssumePrivileges.Name()},
			Subject: []string{project.SubIdentity},
		})
	}
	if len(rules) == 0 {
		rules = append(rules, gocasl.JSONRule{
			Action:  []string{"read"},
			Subject: []string{"none"},
		})
	}
	rulesJSON, err := json.Marshal(rules)
	require.NoError(t, err)
	ability, err := gocasl.LoadFromJSON(rulesJSON, gocasl.LoadOptions{
		FieldOps: permission.PermissionFieldOps(),
	})
	require.NoError(t, err)
	return ability
}

func TestAssumeProjectPrivileges_Success_User(t *testing.T) {
	ctx := context.Background()
	logger := slog.Default()
	authSecret := "test-secret-key-32-chars-long!!"

	permSvc := &mockPermissionService{
		getProjectPermissionResult: &permission.GetProjectPermissionResult{
			Permission: permission.ProjectPermission{
				Ability: buildTestAbility(t, true, false),
			},
		},
	}

	svc := NewService(ctx, logger, &Deps{
		AuthSecret:        authSecret,
		PermissionService: permSvc,
	})

	opts := &AssumeProjectPrivilegesOpts{
		TargetActorType: auth.ActorTypeUser,
		TargetActorID:   uuid.New(),
		ProjectID:       "project-123",
		RequesterID:     uuid.New(),
		RequesterOrgID:  uuid.New(),
		AuthMethod:      "jwt",
		TokenVersionID:  uuid.New(),
	}

	result, err := svc.AssumeProjectPrivileges(ctx, opts)
	require.NoError(t, err)
	assert.Equal(t, opts.TargetActorType, result.ActorType)
	assert.Equal(t, opts.TargetActorID, result.ActorID)
	assert.Equal(t, opts.ProjectID, result.ProjectID)
	assert.NotEmpty(t, result.AssumePrivilegesToken)

	// Verify JWT is valid
	claims := &assumePrivilegeClaims{}
	_, err = jwt.ParseWithClaims(result.AssumePrivilegesToken, claims, func(_ *jwt.Token) (any, error) {
		return []byte(authSecret), nil
	})
	require.NoError(t, err)
	assert.Equal(t, opts.TargetActorID.String(), claims.ActorID)
	assert.Equal(t, opts.ProjectID, claims.ProjectID)
}

func TestAssumeProjectPrivileges_Success_Identity(t *testing.T) {
	ctx := context.Background()
	logger := slog.Default()
	authSecret := "test-secret-key-32-chars-long!!"

	permSvc := &mockPermissionService{
		getProjectPermissionResult: &permission.GetProjectPermissionResult{
			Permission: permission.ProjectPermission{
				Ability: buildTestAbility(t, false, true),
			},
		},
	}

	svc := NewService(ctx, logger, &Deps{
		AuthSecret:        authSecret,
		PermissionService: permSvc,
	})

	opts := &AssumeProjectPrivilegesOpts{
		TargetActorType: auth.ActorTypeIdentity,
		TargetActorID:   uuid.New(),
		ProjectID:       "project-123",
		RequesterID:     uuid.New(),
		RequesterOrgID:  uuid.New(),
		AuthMethod:      "jwt",
		TokenVersionID:  uuid.New(),
	}

	result, err := svc.AssumeProjectPrivileges(ctx, opts)
	require.NoError(t, err)
	assert.Equal(t, opts.TargetActorType, result.ActorType)
	assert.Equal(t, opts.TargetActorID, result.ActorID)
}

func TestAssumeProjectPrivileges_NoPermission_User(t *testing.T) {
	ctx := context.Background()
	logger := slog.Default()
	authSecret := "test-secret-key-32-chars-long!!"

	permSvc := &mockPermissionService{
		getProjectPermissionResult: &permission.GetProjectPermissionResult{
			Permission: permission.ProjectPermission{
				Ability: buildTestAbility(t, false, false),
			},
		},
	}

	svc := NewService(ctx, logger, &Deps{
		AuthSecret:        authSecret,
		PermissionService: permSvc,
	})

	opts := &AssumeProjectPrivilegesOpts{
		TargetActorType: auth.ActorTypeUser,
		TargetActorID:   uuid.New(),
		ProjectID:       "project-123",
		RequesterID:     uuid.New(),
		RequesterOrgID:  uuid.New(),
		AuthMethod:      "jwt",
		TokenVersionID:  uuid.New(),
	}

	_, err := svc.AssumeProjectPrivileges(ctx, opts)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "do not have permission to assume member privileges")
}

func TestAssumeProjectPrivileges_NoPermission_Identity(t *testing.T) {
	ctx := context.Background()
	logger := slog.Default()
	authSecret := "test-secret-key-32-chars-long!!"

	permSvc := &mockPermissionService{
		getProjectPermissionResult: &permission.GetProjectPermissionResult{
			Permission: permission.ProjectPermission{
				Ability: buildTestAbility(t, false, false),
			},
		},
	}

	svc := NewService(ctx, logger, &Deps{
		AuthSecret:        authSecret,
		PermissionService: permSvc,
	})

	opts := &AssumeProjectPrivilegesOpts{
		TargetActorType: auth.ActorTypeIdentity,
		TargetActorID:   uuid.New(),
		ProjectID:       "project-123",
		RequesterID:     uuid.New(),
		RequesterOrgID:  uuid.New(),
		AuthMethod:      "jwt",
		TokenVersionID:  uuid.New(),
	}

	_, err := svc.AssumeProjectPrivileges(ctx, opts)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "do not have permission to assume identity privileges")
}

func TestVerifyAssumePrivilegeToken_Success(t *testing.T) {
	ctx := context.Background()
	logger := slog.Default()
	authSecret := "test-secret-key-32-chars-long!!"

	permSvc := &mockPermissionService{
		getProjectPermissionResult: &permission.GetProjectPermissionResult{
			Permission: permission.ProjectPermission{
				Ability: buildTestAbility(t, true, true),
			},
		},
	}

	svc := NewService(ctx, logger, &Deps{
		AuthSecret:        authSecret,
		PermissionService: permSvc,
	})

	// First create a token
	tokenVersionID := uuid.New()
	requesterID := uuid.New()
	actorID := uuid.New()
	projectID := "project-123"
	orgID := uuid.New()

	createOpts := &AssumeProjectPrivilegesOpts{
		TargetActorType: auth.ActorTypeUser,
		TargetActorID:   actorID,
		ProjectID:       projectID,
		RequesterID:     requesterID,
		RequesterOrgID:  orgID,
		AuthMethod:      "jwt",
		TokenVersionID:  tokenVersionID,
	}

	createResult, err := svc.AssumeProjectPrivileges(ctx, createOpts)
	require.NoError(t, err)

	// Reset call count
	permSvc.callCount = 0

	// Now verify the token
	verifyOpts := &VerifyTokenOpts{
		Token:          createResult.AssumePrivilegesToken,
		TokenVersionID: tokenVersionID,
		AuthMethod:     "jwt",
		OrgID:          orgID,
	}

	details, err := svc.VerifyAssumePrivilegeToken(ctx, verifyOpts)
	require.NoError(t, err)
	assert.Equal(t, auth.ActorTypeUser, details.ActorType)
	assert.Equal(t, actorID, details.ActorID)
	assert.Equal(t, projectID, details.ProjectID)
	assert.Equal(t, requesterID, details.RequesterID)
	assert.Equal(t, tokenVersionID, details.TokenVersionID)
}

func TestVerifyAssumePrivilegeToken_InvalidToken(t *testing.T) {
	ctx := context.Background()
	logger := slog.Default()
	authSecret := "test-secret-key-32-chars-long!!"

	permSvc := &mockPermissionService{}

	svc := NewService(ctx, logger, &Deps{
		AuthSecret:        authSecret,
		PermissionService: permSvc,
	})

	verifyOpts := &VerifyTokenOpts{
		Token:          "invalid-token",
		TokenVersionID: uuid.New(),
		AuthMethod:     "jwt",
		OrgID:          uuid.New(),
	}

	_, err := svc.VerifyAssumePrivilegeToken(ctx, verifyOpts)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Invalid assume privilege token")
}

func TestVerifyAssumePrivilegeToken_TokenVersionMismatch(t *testing.T) {
	ctx := context.Background()
	logger := slog.Default()
	authSecret := "test-secret-key-32-chars-long!!"

	permSvc := &mockPermissionService{
		getProjectPermissionResult: &permission.GetProjectPermissionResult{
			Permission: permission.ProjectPermission{
				Ability: buildTestAbility(t, true, true),
			},
		},
	}

	svc := NewService(ctx, logger, &Deps{
		AuthSecret:        authSecret,
		PermissionService: permSvc,
	})

	// Create a token
	createOpts := &AssumeProjectPrivilegesOpts{
		TargetActorType: auth.ActorTypeUser,
		TargetActorID:   uuid.New(),
		ProjectID:       "project-123",
		RequesterID:     uuid.New(),
		RequesterOrgID:  uuid.New(),
		AuthMethod:      "jwt",
		TokenVersionID:  uuid.New(),
	}

	createResult, err := svc.AssumeProjectPrivileges(ctx, createOpts)
	require.NoError(t, err)

	// Verify with DIFFERENT token version ID (simulates logout/session change)
	verifyOpts := &VerifyTokenOpts{
		Token:          createResult.AssumePrivilegesToken,
		TokenVersionID: uuid.New(), // Different!
		AuthMethod:     "jwt",
		OrgID:          uuid.New(),
	}

	_, err = svc.VerifyAssumePrivilegeToken(ctx, verifyOpts)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Invalid token version")
}

func TestVerifyAssumePrivilegeToken_ExpiredToken(t *testing.T) {
	ctx := context.Background()
	logger := slog.Default()
	authSecret := "test-secret-key-32-chars-long!!"

	svc := NewService(ctx, logger, &Deps{
		AuthSecret:        authSecret,
		PermissionService: &mockPermissionService{},
	})

	// Create an expired token manually
	tokenVersionID := uuid.New()
	now := time.Now().Add(-2 * time.Hour)
	claims := assumePrivilegeClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(now.Add(-time.Hour)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
		TokenVersionID: tokenVersionID.String(),
		ActorType:      string(auth.ActorTypeUser),
		ActorID:        uuid.New().String(),
		ProjectID:      "project-123",
		RequesterID:    uuid.New().String(),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signedToken, err := token.SignedString([]byte(authSecret))
	require.NoError(t, err)

	verifyOpts := &VerifyTokenOpts{
		Token:          signedToken,
		TokenVersionID: tokenVersionID,
		AuthMethod:     "jwt",
		OrgID:          uuid.New(),
	}

	_, err = svc.VerifyAssumePrivilegeToken(ctx, verifyOpts)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Invalid assume privilege token")
}

func TestVerifyAssumePrivilegeToken_RequesterLostPermission(t *testing.T) {
	ctx := context.Background()
	logger := slog.Default()
	authSecret := "test-secret-key-32-chars-long!!"

	permSvc := &mockPermissionService{}
	permSvc.getProjectPermissionResult = &permission.GetProjectPermissionResult{
		Permission: permission.ProjectPermission{
			Ability: buildTestAbility(t, true, true),
		},
	}

	svc := NewService(ctx, logger, &Deps{
		AuthSecret:        authSecret,
		PermissionService: permSvc,
	})

	// Create a token while requester has permission
	tokenVersionID := uuid.New()
	createOpts := &AssumeProjectPrivilegesOpts{
		TargetActorType: auth.ActorTypeUser,
		TargetActorID:   uuid.New(),
		ProjectID:       "project-123",
		RequesterID:     uuid.New(),
		RequesterOrgID:  uuid.New(),
		AuthMethod:      "jwt",
		TokenVersionID:  tokenVersionID,
	}

	createResult, err := svc.AssumeProjectPrivileges(ctx, createOpts)
	require.NoError(t, err)

	// Now requester loses permission
	permSvc.getProjectPermissionResult = &permission.GetProjectPermissionResult{
		Permission: permission.ProjectPermission{
			Ability: buildTestAbility(t, false, false),
		},
	}

	verifyOpts := &VerifyTokenOpts{
		Token:          createResult.AssumePrivilegesToken,
		TokenVersionID: tokenVersionID,
		AuthMethod:     "jwt",
		OrgID:          uuid.New(),
	}

	_, err = svc.VerifyAssumePrivilegeToken(ctx, verifyOpts)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "Requester no longer has permission to assume member privileges")
}
