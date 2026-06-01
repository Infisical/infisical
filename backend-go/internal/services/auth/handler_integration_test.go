//go:build integration

package auth_test

import (
	"context"
	"encoding/base64"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/auth"
	"github.com/infisical/api/internal/services/auth/apiauth"
	"github.com/infisical/api/internal/testutil/infra"
)

var (
	stack         *infra.Stack
	authenticator apiauth.Authenticator
	memKeyStore   *keystore.MemoryKeyStore
)

func TestMain(m *testing.M) {
	stack = infra.New().
		WithPostgres().
		WithRedis().
		WithNodeJSApi().
		MustStart()

	memKeyStore = keystore.NewMemoryKeyStore()
	authenticator = apiauth.NewAuthenticator(stack.DB(), infra.AuthSecret, memKeyStore, nil)

	code := m.Run()
	stack.Stop()
	os.Exit(code)
}

// =============================================================================
// JWT Signing Helpers
// =============================================================================

func signUserJWT(t *testing.T, secret string, mut func(*apiauth.UserJWTClaims)) string {
	t.Helper()
	claims := &apiauth.UserJWTClaims{
		AuthTokenType:  auth.AuthTokenTypeAccessToken,
		UserID:         uuid.MustParse(stack.NodeJS().UserID()),
		TokenVersionID: uuid.New(),
		AccessVersion:  1,
		OrganizationID: uuid.MustParse(stack.NodeJS().OrgID()),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	if mut != nil {
		mut(claims)
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secret))
	require.NoError(t, err)
	return tokenString
}

func signIdentityJWT(t *testing.T, secret string, mut func(*apiauth.IdentityJWTClaims)) string {
	t.Helper()
	claims := &apiauth.IdentityJWTClaims{
		AuthTokenType:         auth.AuthTokenTypeIdentityAccessToken,
		IdentityID:            uuid.New(),
		IdentityAccessTokenID: uuid.New().String(),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	if mut != nil {
		mut(claims)
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenString, err := token.SignedString([]byte(secret))
	require.NoError(t, err)
	return tokenString
}

// =============================================================================
// Error Assertion Helpers
// =============================================================================

func assertUnauthorized(t *testing.T, err error) {
	t.Helper()
	require.Error(t, err)
	var appErr *errutil.Error
	if errors.As(err, &appErr) {
		assert.Equal(t, 401, appErr.Status)
	}
}

func assertNotFound(t *testing.T, err error) {
	t.Helper()
	require.Error(t, err)
	var appErr *errutil.Error
	if errors.As(err, &appErr) {
		assert.Equal(t, 404, appErr.Status)
	}
}

func assertErrorName(t *testing.T, err error, expectedName string) {
	t.Helper()
	require.Error(t, err)
	var appErr *errutil.Error
	if errors.As(err, &appErr) {
		assert.Equal(t, expectedName, appErr.Name)
	}
}

// =============================================================================
// JWT User Token Tests
// =============================================================================

func TestValidateJWT_UserToken_Valid(t *testing.T) {
	token := stack.NodeJS().UserToken()

	identity, err := authenticator.ValidateJWT(context.Background(), token)

	require.NoError(t, err)
	require.NotNil(t, identity)
	assert.Equal(t, auth.AuthModeJWT, identity.AuthMode)
	assert.Equal(t, auth.ActorTypeUser, identity.Actor)
	assert.Equal(t, uuid.MustParse(stack.NodeJS().UserID()), identity.ActorID)
	assert.Equal(t, uuid.MustParse(stack.NodeJS().OrgID()), identity.OrgID)
	// Verify user-specific fields are populated
	require.NotNil(t, identity.UserAuthInfo)
	assert.NotEmpty(t, identity.Email)
}

func TestValidateJWT_UserToken_Errors(t *testing.T) {
	tests := []struct {
		name        string
		token       func(t *testing.T) string
		assertError func(t *testing.T, err error)
	}{
		{
			name: "invalid signature",
			token: func(t *testing.T) string {
				return signUserJWT(t, "wrong-secret", nil)
			},
			assertError: func(t *testing.T, err error) {
				assertUnauthorized(t, err)
				assert.Contains(t, err.Error(), "Invalid JWT")
			},
		},
		{
			name: "expired token",
			token: func(t *testing.T) string {
				return signUserJWT(t, infra.AuthSecret, func(c *apiauth.UserJWTClaims) {
					c.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Hour))
				})
			},
			assertError: func(t *testing.T, err error) {
				assertUnauthorized(t, err)
				assert.Contains(t, err.Error(), "Invalid JWT")
			},
		},
		{
			name: "wrong auth token type",
			token: func(t *testing.T) string {
				return signUserJWT(t, infra.AuthSecret, func(c *apiauth.UserJWTClaims) {
					c.AuthTokenType = "wrong-type"
				})
			},
			assertError: func(t *testing.T, err error) {
				assertUnauthorized(t, err)
			},
		},
		{
			name: "session not found",
			token: func(t *testing.T) string {
				return signUserJWT(t, infra.AuthSecret, func(c *apiauth.UserJWTClaims) {
					c.TokenVersionID = uuid.New() // non-existent session
				})
			},
			assertError: func(t *testing.T, err error) {
				assertNotFound(t, err)
				assert.Contains(t, err.Error(), "Session not found")
			},
		},
		{
			name: "user not found",
			token: func(t *testing.T) string {
				return signUserJWT(t, infra.AuthSecret, func(c *apiauth.UserJWTClaims) {
					c.UserID = uuid.New() // non-existent user
				})
			},
			assertError: func(t *testing.T, err error) {
				assertNotFound(t, err)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token := tt.token(t)
			_, err := authenticator.ValidateJWT(context.Background(), token)
			tt.assertError(t, err)
		})
	}
}

func TestValidateJWT_UserToken_StaleAccessVersion(t *testing.T) {
	// This test requires DB manipulation to create a session with a different access version
	// We create a valid token but modify the session's access version in DB

	userID := uuid.MustParse(stack.NodeJS().UserID())
	sessionID := uuid.New()

	// Insert a session with access_version = 5
	_, err := stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO auth_token_sessions (id, "userId", "accessVersion", "refreshVersion", ip, "userAgent", "lastUsed", "createdAt", "updatedAt")
		VALUES (@sessionID, @userID, 5, 1, '127.0.0.1', 'test', NOW(), NOW(), NOW())
	`, pgx.NamedArgs{"sessionID": sessionID, "userID": userID})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM auth_token_sessions WHERE id = @sessionID`,
			pgx.NamedArgs{"sessionID": sessionID})
	})

	// Create token with access_version = 1 (stale)
	token := signUserJWT(t, infra.AuthSecret, func(c *apiauth.UserJWTClaims) {
		c.TokenVersionID = sessionID
		c.AccessVersion = 1 // Different from DB's 5
	})

	_, err = authenticator.ValidateJWT(context.Background(), token)

	assertUnauthorized(t, err)
	assertErrorName(t, err, "StaleSession")
	assert.Contains(t, err.Error(), "stale")
}

func TestValidateJWT_UserToken_UserLocked(t *testing.T) {
	// Create a user that is permanently locked
	lockedUserID := uuid.New()
	testEmail := "locked-" + uuid.New().String() + "@test.com"
	_, err := stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO users (id, email, username, "isAccepted", "isLocked", "createdAt", "updatedAt")
		VALUES (@userID, @email, @username, true, true, NOW(), NOW())
	`, pgx.NamedArgs{"userID": lockedUserID, "email": testEmail, "username": testEmail})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM users WHERE id = @userID`,
			pgx.NamedArgs{"userID": lockedUserID})
	})

	// Create a session for the locked user
	sessionID := uuid.New()
	_, err = stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO auth_token_sessions (id, "userId", "accessVersion", "refreshVersion", ip, "userAgent", "lastUsed", "createdAt", "updatedAt")
		VALUES (@sessionID, @userID, 1, 1, '127.0.0.1', 'test', NOW(), NOW(), NOW())
	`, pgx.NamedArgs{"sessionID": sessionID, "userID": lockedUserID})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM auth_token_sessions WHERE id = @sessionID`,
			pgx.NamedArgs{"sessionID": sessionID})
	})

	token := signUserJWT(t, infra.AuthSecret, func(c *apiauth.UserJWTClaims) {
		c.UserID = lockedUserID
		c.TokenVersionID = sessionID
		c.AccessVersion = 1
	})

	_, err = authenticator.ValidateJWT(context.Background(), token)

	assertUnauthorized(t, err)
	assert.Contains(t, err.Error(), "locked")
}

func TestValidateJWT_UserToken_UserTemporarilyLocked(t *testing.T) {
	// Create a user that is temporarily locked (lock expires in the future)
	tempLockedUserID := uuid.New()
	testEmail := "templocked-" + uuid.New().String() + "@test.com"
	lockEnd := time.Now().Add(time.Hour) // Locked for another hour
	_, err := stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO users (id, email, username, "isAccepted", "temporaryLockDateEnd", "createdAt", "updatedAt")
		VALUES (@userID, @email, @username, true, @lockEnd, NOW(), NOW())
	`, pgx.NamedArgs{"userID": tempLockedUserID, "email": testEmail, "username": testEmail, "lockEnd": lockEnd})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM users WHERE id = @userID`,
			pgx.NamedArgs{"userID": tempLockedUserID})
	})

	// Create a session for the temp-locked user
	sessionID := uuid.New()
	_, err = stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO auth_token_sessions (id, "userId", "accessVersion", "refreshVersion", ip, "userAgent", "lastUsed", "createdAt", "updatedAt")
		VALUES (@sessionID, @userID, 1, 1, '127.0.0.1', 'test', NOW(), NOW(), NOW())
	`, pgx.NamedArgs{"sessionID": sessionID, "userID": tempLockedUserID})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM auth_token_sessions WHERE id = @sessionID`,
			pgx.NamedArgs{"sessionID": sessionID})
	})

	token := signUserJWT(t, infra.AuthSecret, func(c *apiauth.UserJWTClaims) {
		c.UserID = tempLockedUserID
		c.TokenVersionID = sessionID
		c.AccessVersion = 1
	})

	_, err = authenticator.ValidateJWT(context.Background(), token)

	assertUnauthorized(t, err)
	assert.Contains(t, err.Error(), "locked")
}

func TestValidateJWT_UserToken_UserNotAccepted(t *testing.T) {
	// Create a user that has not accepted
	notAcceptedUserID := uuid.New()
	testEmail := "notaccepted-" + uuid.New().String() + "@test.com"
	_, err := stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO users (id, email, username, "isAccepted", "createdAt", "updatedAt")
		VALUES (@userID, @email, @username, false, NOW(), NOW())
	`, pgx.NamedArgs{"userID": notAcceptedUserID, "email": testEmail, "username": testEmail})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM users WHERE id = @userID`,
			pgx.NamedArgs{"userID": notAcceptedUserID})
	})

	// Create a session for the not-accepted user
	sessionID := uuid.New()
	_, err = stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO auth_token_sessions (id, "userId", "accessVersion", "refreshVersion", ip, "userAgent", "lastUsed", "createdAt", "updatedAt")
		VALUES (@sessionID, @userID, 1, 1, '127.0.0.1', 'test', NOW(), NOW(), NOW())
	`, pgx.NamedArgs{"sessionID": sessionID, "userID": notAcceptedUserID})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM auth_token_sessions WHERE id = @sessionID`,
			pgx.NamedArgs{"sessionID": sessionID})
	})

	token := signUserJWT(t, infra.AuthSecret, func(c *apiauth.UserJWTClaims) {
		c.UserID = notAcceptedUserID
		c.TokenVersionID = sessionID
		c.AccessVersion = 1
	})

	_, err = authenticator.ValidateJWT(context.Background(), token)

	assertNotFound(t, err)
}

// =============================================================================
// Identity Access Token Tests
// =============================================================================

func TestValidateIdentityAccessToken_Valid(t *testing.T) {
	token := stack.NodeJS().IdentityToken()

	identity, err := authenticator.ValidateIdentityAccessToken(context.Background(), token, "")

	require.NoError(t, err)
	require.NotNil(t, identity)
	assert.Equal(t, auth.AuthModeIdentityAccessToken, identity.AuthMode)
	assert.Equal(t, auth.ActorTypeIdentity, identity.Actor)
	assert.NotEqual(t, uuid.Nil, identity.ActorID)
	assert.Equal(t, uuid.MustParse(stack.NodeJS().OrgID()), identity.OrgID)
	// Verify identity-specific fields
	require.NotNil(t, identity.IdentityAuthInfo)
	assert.NotEqual(t, uuid.Nil, identity.IdentityAuthInfo.IdentityID)
}

func TestValidateIdentityAccessToken_Errors(t *testing.T) {
	tests := []struct {
		name        string
		token       func(t *testing.T) string
		assertError func(t *testing.T, err error)
	}{
		{
			name: "invalid signature",
			token: func(t *testing.T) string {
				return signIdentityJWT(t, "wrong-secret", nil)
			},
			assertError: func(t *testing.T, err error) {
				assertUnauthorized(t, err)
			},
		},
		{
			name: "expired token",
			token: func(t *testing.T) string {
				return signIdentityJWT(t, infra.AuthSecret, func(c *apiauth.IdentityJWTClaims) {
					c.ExpiresAt = jwt.NewNumericDate(time.Now().Add(-time.Hour))
				})
			},
			assertError: func(t *testing.T, err error) {
				assertUnauthorized(t, err)
			},
		},
		{
			name: "wrong auth token type",
			token: func(t *testing.T) string {
				return signIdentityJWT(t, infra.AuthSecret, func(c *apiauth.IdentityJWTClaims) {
					c.AuthTokenType = "wrong-type"
				})
			},
			assertError: func(t *testing.T, err error) {
				assertUnauthorized(t, err)
			},
		},
		{
			name: "token not found in DB (legacy path)",
			token: func(t *testing.T) string {
				return signIdentityJWT(t, infra.AuthSecret, func(c *apiauth.IdentityJWTClaims) {
					c.IdentityAccessTokenID = uuid.New().String()
				})
			},
			assertError: func(t *testing.T, err error) {
				assertUnauthorized(t, err)
				assert.Contains(t, err.Error(), "Cannot renew revoked or unknown access token")
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			token := tt.token(t)
			_, err := authenticator.ValidateIdentityAccessToken(context.Background(), token, "")
			tt.assertError(t, err)
		})
	}
}

func TestValidateIdentityAccessToken_CustomIdentity(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create unique project and identity for this test
	projName := "test-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "identity-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	token := nodejs.GetIdentityAccessToken(t, identity.ID)

	authIdentity, err := authenticator.ValidateIdentityAccessToken(context.Background(), token, "")

	require.NoError(t, err)
	require.NotNil(t, authIdentity)
	assert.Equal(t, auth.AuthModeIdentityAccessToken, authIdentity.AuthMode)
	assert.Equal(t, auth.ActorTypeIdentity, authIdentity.Actor)
	assert.Equal(t, uuid.MustParse(identity.ID), authIdentity.ActorID)
}

func TestValidateIdentityAccessToken_Revoked(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create identity and get token
	projName := "test-revoke-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "identity-revoke-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	token := nodejs.GetIdentityAccessToken(t, identity.ID)

	// Revoke the token via Node.js API
	nodejs.RevokeAccessToken(t, token)

	_, err := authenticator.ValidateIdentityAccessToken(context.Background(), token, "")

	assertUnauthorized(t, err)
	assert.Contains(t, err.Error(), "revoked")
}

func TestValidateIdentityAccessToken_IdentityDeleted(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create identity and get token
	projName := "test-idelete-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "identity-idelete-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	token := nodejs.GetIdentityAccessToken(t, identity.ID)

	// Delete the identity - this revokes all tokens for the identity
	nodejs.DeleteIdentity(t, identity.ID)

	_, err := authenticator.ValidateIdentityAccessToken(context.Background(), token, "")

	// Token should fail - either as revoked or identity not found
	require.Error(t, err)
}

// =============================================================================
// Service Token Tests
// =============================================================================

func TestValidateServiceToken_Errors(t *testing.T) {
	tests := []struct {
		name        string
		token       string
		assertError func(t *testing.T, err error)
	}{
		{
			name:  "not found",
			token: "st." + uuid.New().String() + ".fakesecret123",
			assertError: func(t *testing.T, err error) {
				assertNotFound(t, err)
			},
		},
		{
			name:  "invalid format - missing parts",
			token: "st.onlyonepart",
			assertError: func(t *testing.T, err error) {
				assertUnauthorized(t, err)
			},
		},
		{
			name:  "invalid format - wrong prefix",
			token: "wrong." + uuid.New().String() + ".secret",
			assertError: func(t *testing.T, err error) {
				assertUnauthorized(t, err)
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := authenticator.ValidateServiceToken(context.Background(), tt.token)
			tt.assertError(t, err)
		})
	}
}

func TestValidateServiceToken_Valid(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create a project with an environment
	projName := "test-st-valid-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	// Create a service token (no expiry)
	st := nodejs.CreateServiceToken(t, proj.ID, "dev", nil)
	t.Cleanup(func() {
		nodejs.DeleteServiceToken(t, st.ID)
	})

	identity, err := authenticator.ValidateServiceToken(context.Background(), st.Token)

	require.NoError(t, err)
	require.NotNil(t, identity)
	assert.Equal(t, auth.AuthModeServiceToken, identity.AuthMode)
	assert.Equal(t, auth.ActorTypeService, identity.Actor)
	assert.Equal(t, st.ID, identity.ActorID.String())
}

func TestValidateServiceToken_WrongSecret(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create a project and service token
	projName := "test-st-wrongsec-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	st := nodejs.CreateServiceToken(t, proj.ID, "dev", nil)
	t.Cleanup(func() {
		nodejs.DeleteServiceToken(t, st.ID)
	})

	// Extract the token ID and use a wrong secret
	// Token format: st.<id>.<secret>
	parts := strings.SplitN(st.Token, ".", 3)
	require.Len(t, parts, 3)
	wrongToken := "st." + parts[1] + ".wrong-secret-here"

	_, err := authenticator.ValidateServiceToken(context.Background(), wrongToken)

	assertUnauthorized(t, err)
	assert.Contains(t, err.Error(), "Invalid service token")
}

func TestValidateServiceToken_Expired(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create a project
	projName := "test-st-expired-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	// Create a service token that expires in 1 second
	expiresIn := 1
	st := nodejs.CreateServiceToken(t, proj.ID, "dev", &expiresIn)
	// No cleanup needed - token is auto-deleted when expired

	// Wait for expiration
	time.Sleep(2 * time.Second)

	_, err := authenticator.ValidateServiceToken(context.Background(), st.Token)

	// Should fail - token is expired (and possibly deleted)
	require.Error(t, err)
}

// =============================================================================
// Identity Token numUsesLimit Tests
// =============================================================================

func TestValidateIdentityAccessToken_NumUsesLimitExhausted(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create identity with numUsesLimit
	projName := "test-numlimit-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "identity-numlimit-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	// Get token - this creates universal auth with default settings (no limit)
	// We need to set up the limit in Redis manually since the token is already issued
	token := nodejs.GetIdentityAccessToken(t, identity.ID)

	// Parse to get token ID
	claims := &apiauth.IdentityJWTClaims{}
	_, _ = jwt.ParseWithClaims(token, claims, func(_ *jwt.Token) (any, error) {
		return []byte(infra.AuthSecret), nil
	})

	tokenID := claims.ID
	if tokenID == "" {
		tokenID = claims.IdentityAccessTokenID
	}

	// Set uses remaining to 0 in keystore (simulating exhausted limit)
	key := "identity-token-uses-remaining:" + identity.ID + ":" + tokenID
	err := memKeyStore.SetItem(context.Background(), key, "0")
	require.NoError(t, err)

	// Create a new authenticator that checks numUsesLimit
	// We need to sign a token WITH numUsesLimit claim
	tokenWithLimit := signIdentityJWT(t, infra.AuthSecret, func(c *apiauth.IdentityJWTClaims) {
		c.IdentityID = uuid.MustParse(identity.ID)
		c.OrgID = uuid.MustParse(stack.NodeJS().OrgID())
		c.RootOrgID = uuid.MustParse(stack.NodeJS().OrgID())
		c.ParentOrgID = uuid.MustParse(stack.NodeJS().OrgID())
		c.AuthMethod = "universal-auth"
		c.AccessTokenTTL = 3600
		c.NumUsesLimit = 5 // Has a limit
		c.ID = tokenID
	})

	_, err = authenticator.ValidateIdentityAccessToken(context.Background(), tokenWithLimit, "")

	assertUnauthorized(t, err)
	assert.Contains(t, err.Error(), "usage limit")
}

// =============================================================================
// JWT Algorithm Attack Tests
// =============================================================================

func TestValidateJWT_UserToken_AlgNoneAttack(t *testing.T) {
	// Create a token with alg=none - this should be rejected
	// JWT with alg:none has no signature
	header := base64URLEncode(`{"alg":"none","typ":"JWT"}`)
	payload := base64URLEncode(`{"authTokenType":"accessToken","userId":"` + stack.NodeJS().UserID() + `"}`)
	algNoneToken := header + "." + payload + "."

	_, err := authenticator.ValidateJWT(context.Background(), algNoneToken)

	assertUnauthorized(t, err)
}

func TestValidateJWT_UserToken_WrongAlgorithm(t *testing.T) {
	// Try to use RS256 when the server expects HS256
	// This tests that the server properly validates the algorithm
	token := jwt.NewWithClaims(jwt.SigningMethodHS384, &apiauth.UserJWTClaims{
		AuthTokenType:  auth.AuthTokenTypeAccessToken,
		UserID:         uuid.MustParse(stack.NodeJS().UserID()),
		TokenVersionID: uuid.New(),
		AccessVersion:  1,
		OrganizationID: uuid.MustParse(stack.NodeJS().OrgID()),
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	})
	// Sign with the correct secret but wrong algorithm
	tokenString, err := token.SignedString([]byte(infra.AuthSecret))
	require.NoError(t, err)

	_, err = authenticator.ValidateJWT(context.Background(), tokenString)

	// Should fail because algorithm doesn't match
	assertUnauthorized(t, err)
}

// =============================================================================
// Legacy Identity Token Tests
// =============================================================================

func TestValidateIdentityAccessToken_LegacyRevoked(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create identity
	projName := "test-legacy-rev-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "identity-legacy-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	// Create a legacy-style token (without full renew claims) that points to a DB row
	// Insert a revoked token row directly into DB
	tokenID := uuid.New()
	identityID := uuid.MustParse(identity.ID)

	_, err := stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO identity_access_tokens (
			id, "identityId", "isAccessTokenRevoked", "accessTokenTTL", "accessTokenMaxTTL",
			"accessTokenNumUses", "accessTokenNumUsesLimit", "authMethod", "createdAt", "updatedAt"
		) VALUES (
			@tokenID, @identityID, true, 3600, 7200, 0, 0, 'universal-auth', NOW(), NOW()
		)
	`, pgx.NamedArgs{"tokenID": tokenID, "identityID": identityID})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM identity_access_tokens WHERE id = @tokenID`,
			pgx.NamedArgs{"tokenID": tokenID})
	})

	// Create a legacy token (no full renew claims) pointing to this DB row
	legacyToken := signIdentityJWT(t, infra.AuthSecret, func(c *apiauth.IdentityJWTClaims) {
		c.IdentityID = identityID
		c.IdentityAccessTokenID = tokenID.String()
		// Don't set OrgID, RootOrgID, ParentOrgID, AuthMethod, AccessTokenTTL
		// This makes HasFullRenewClaims() return false, triggering legacy DB lookup
		c.OrgID = uuid.Nil
		c.RootOrgID = uuid.Nil
		c.ParentOrgID = uuid.Nil
		c.AuthMethod = ""
		c.AccessTokenTTL = 0
		c.AccessTokenMaxTTL = 0
		c.AccessTokenPeriod = 0
	})

	_, err = authenticator.ValidateIdentityAccessToken(context.Background(), legacyToken, "")

	assertUnauthorized(t, err)
	assert.Contains(t, err.Error(), "revoked")
}

// =============================================================================
// Helper Functions
// =============================================================================

func base64URLEncode(s string) string {
	encoded := base64.RawURLEncoding.EncodeToString([]byte(s))
	return encoded
}

// =============================================================================
// Malformed Token Tests
// =============================================================================

func TestValidateJWT_MalformedTokens(t *testing.T) {
	tests := []struct {
		name  string
		token string
	}{
		{"single dot", "."},
		{"two dots", ".."},
		{"three dots", "..."},
		{"only header", "eyJhbGciOiJIUzI1NiJ9"},
		{"header and dot", "eyJhbGciOiJIUzI1NiJ9."},
		{"random string", "not-a-token-at-all"},
		{"base64 garbage", "!!!.@@@.###"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := authenticator.ValidateJWT(context.Background(), tt.token)
			require.Error(t, err)
		})
	}
}

// =============================================================================
// TODO(go:akhilmhdh): Missing Edge Cases
// =============================================================================
//
// The following edge cases are not yet covered by tests. They require additional
// setup (EE features, complex fixtures) or test infrastructure not yet available.
//
// JWT/User Token:
// - TODO: Sub-organization scoping (claims.SubOrganizationID set) - requires EE sub-org feature
// - TODO: Sub-org doesn't belong to root org (forbidden case)
// - TODO: Org membership inactive
// - TODO: Group-based org membership (actorGroupId IN (...) branch)
// - TODO: SuperAdmin field propagation onto Identity
// - TODO: IsMfaVerified/MfaMethod field propagation onto Identity
// - TODO: AuthMethod field propagation onto Identity
//
// Identity Access Token:
// - TODO: IdentityAuth claims propagation (OIDC details)
// - TODO: IdentityAuth claims propagation (Kubernetes details)
// - TODO: IdentityAuth claims propagation (AWS details)
// - TODO: Sub-org scoping for identity tokens
// - TODO: Explicit test for new-format token path (HasFullRenewClaims=true)
// - TODO: Explicit test for legacy DB-lookup path (HasFullRenewClaims=false)
//
// Cross-cutting:
// - TODO: HTTPInfoMiddleware propagation (IPAddress/UserAgent onto Identity)
// - TODO: IP blocklist check (currently bypassed with empty string)
