//go:build integration

package auth_test

import (
	"context"
	"encoding/base64"
	"errors"
	"log/slog"
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
	"github.com/infisical/api/tests/infra"
)

var (
	stack         *infra.Stack
	authenticator *apiauth.ApiAuthenticator
	memKeyStore   *keystore.MemoryKeyStore
)

func TestMain(m *testing.M) {
	stack = infra.New().
		WithPostgres().
		WithRedis().
		WithNodeJSApi().
		MustStart()

	memKeyStore = keystore.NewMemoryKeyStore()
	authenticator = apiauth.NewApiAuthenticator(slog.Default(), stack.DB(), infra.AuthSecret, memKeyStore, nil, infra.NewNopErrorHandler())

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
	tempLockedUserID := uuid.New()
	testEmail := "templocked-" + uuid.New().String() + "@test.com"
	lockEnd := time.Now().Add(time.Hour)
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

	projName := "test-revoke-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "identity-revoke-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	token := nodejs.GetIdentityAccessToken(t, identity.ID)

	nodejs.RevokeAccessToken(t, token)

	_, err := authenticator.ValidateIdentityAccessToken(context.Background(), token, "")

	assertUnauthorized(t, err)
	assert.Contains(t, err.Error(), "revoked")
}

func TestValidateIdentityAccessToken_IdentityDeleted(t *testing.T) {
	nodejs := stack.NodeJS()

	projName := "test-idelete-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "identity-idelete-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	token := nodejs.GetIdentityAccessToken(t, identity.ID)

	nodejs.DeleteIdentity(t, identity.ID)

	_, err := authenticator.ValidateIdentityAccessToken(context.Background(), token, "")

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

	projName := "test-st-valid-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	st := nodejs.CreateServiceToken(t, proj.ID, nil)
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

	projName := "test-st-wrongsec-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	st := nodejs.CreateServiceToken(t, proj.ID, nil)
	t.Cleanup(func() {
		nodejs.DeleteServiceToken(t, st.ID)
	})

	parts := strings.SplitN(st.Token, ".", 3)
	require.Len(t, parts, 3)
	wrongToken := "st." + parts[1] + ".wrong-secret-here"

	_, err := authenticator.ValidateServiceToken(context.Background(), wrongToken)

	assertUnauthorized(t, err)
	assert.Contains(t, err.Error(), "Invalid service token")
}

func TestValidateServiceToken_Expired(t *testing.T) {
	nodejs := stack.NodeJS()

	projName := "test-st-expired-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	expiresIn := 1
	st := nodejs.CreateServiceToken(t, proj.ID, &infra.CreateServiceTokenOpts{ExpiresIn: &expiresIn})

	time.Sleep(2 * time.Second)

	_, err := authenticator.ValidateServiceToken(context.Background(), st.Token)

	require.Error(t, err)
}

// =============================================================================
// Identity Token numUsesLimit Tests
// =============================================================================

func TestValidateIdentityAccessToken_NumUsesLimitExhausted(t *testing.T) {
	nodejs := stack.NodeJS()

	projName := "test-numlimit-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "identity-numlimit-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	token := nodejs.GetIdentityAccessToken(t, identity.ID)

	claims := &apiauth.IdentityJWTClaims{}
	_, _ = jwt.ParseWithClaims(token, claims, func(_ *jwt.Token) (any, error) {
		return []byte(infra.AuthSecret), nil
	})

	tokenID := claims.ID
	if tokenID == "" {
		tokenID = claims.IdentityAccessTokenID
	}

	key := "identity-token-uses-remaining:" + identity.ID + ":" + tokenID
	err := memKeyStore.SetItem(context.Background(), key, "0")
	require.NoError(t, err)

	tokenWithLimit := signIdentityJWT(t, infra.AuthSecret, func(c *apiauth.IdentityJWTClaims) {
		c.IdentityID = uuid.MustParse(identity.ID)
		c.OrgID = uuid.MustParse(stack.NodeJS().OrgID())
		c.RootOrgID = uuid.MustParse(stack.NodeJS().OrgID())
		c.ParentOrgID = uuid.MustParse(stack.NodeJS().OrgID())
		c.AuthMethod = "universal-auth"
		c.AccessTokenTTL = 3600
		c.NumUsesLimit = 5
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
	header := base64URLEncode(`{"alg":"none","typ":"JWT"}`)
	payload := base64URLEncode(`{"authTokenType":"accessToken","userId":"` + stack.NodeJS().UserID() + `"}`)
	algNoneToken := header + "." + payload + "."

	_, err := authenticator.ValidateJWT(context.Background(), algNoneToken)

	assertUnauthorized(t, err)
}

func TestValidateJWT_UserToken_WrongAlgorithm(t *testing.T) {
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
	tokenString, err := token.SignedString([]byte(infra.AuthSecret))
	require.NoError(t, err)

	_, err = authenticator.ValidateJWT(context.Background(), tokenString)

	assertUnauthorized(t, err)
}

// =============================================================================
// Legacy Identity Token Tests
// =============================================================================

func TestValidateIdentityAccessToken_LegacyRevoked(t *testing.T) {
	nodejs := stack.NodeJS()

	projName := "test-legacy-rev-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "identity-legacy-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

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

	legacyToken := signIdentityJWT(t, infra.AuthSecret, func(c *apiauth.IdentityJWTClaims) {
		c.IdentityID = identityID
		c.IdentityAccessTokenID = tokenID.String()
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
// ValidateJWTToken (Unified Entry Point) Tests
// =============================================================================

func TestValidateJWTToken_RoutesToUserToken(t *testing.T) {
	token := stack.NodeJS().UserToken()

	identity, authMode, err := authenticator.ValidateJWTToken(context.Background(), token, "")

	require.NoError(t, err)
	assert.Equal(t, auth.AuthModeJWT, authMode)
	assert.Equal(t, auth.ActorTypeUser, identity.Actor)
}

func TestValidateJWTToken_RoutesToIdentityToken(t *testing.T) {
	token := stack.NodeJS().IdentityToken()

	identity, authMode, err := authenticator.ValidateJWTToken(context.Background(), token, "")

	require.NoError(t, err)
	assert.Equal(t, auth.AuthModeIdentityAccessToken, authMode)
	assert.Equal(t, auth.ActorTypeIdentity, identity.Actor)
}

func TestValidateJWTToken_UnsupportedTokenType(t *testing.T) {
	token := signUserJWT(t, infra.AuthSecret, func(c *apiauth.UserJWTClaims) {
		c.AuthTokenType = "unsupported-type"
	})

	_, _, err := authenticator.ValidateJWTToken(context.Background(), token, "")

	assertUnauthorized(t, err)
	assert.Contains(t, err.Error(), "Unsupported token type")
}

// =============================================================================
// User Org Membership Tests
// =============================================================================

func TestValidateJWT_UserToken_NotMemberOfOrg(t *testing.T) {
	// Create a new user that is NOT a member of the org in the JWT claims
	newUserID := uuid.New()
	testEmail := "notmember-" + uuid.New().String() + "@test.com"
	_, err := stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO users (id, email, username, "isAccepted", "createdAt", "updatedAt")
		VALUES (@userID, @email, @username, true, NOW(), NOW())
	`, pgx.NamedArgs{"userID": newUserID, "email": testEmail, "username": testEmail})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM users WHERE id = @userID`,
			pgx.NamedArgs{"userID": newUserID})
	})

	sessionID := uuid.New()
	_, err = stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO auth_token_sessions (id, "userId", "accessVersion", "refreshVersion", ip, "userAgent", "lastUsed", "createdAt", "updatedAt")
		VALUES (@sessionID, @userID, 1, 1, '127.0.0.1', 'test', NOW(), NOW(), NOW())
	`, pgx.NamedArgs{"sessionID": sessionID, "userID": newUserID})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM auth_token_sessions WHERE id = @sessionID`,
			pgx.NamedArgs{"sessionID": sessionID})
	})

	// Create token with an org the user is not a member of
	token := signUserJWT(t, infra.AuthSecret, func(c *apiauth.UserJWTClaims) {
		c.UserID = newUserID
		c.TokenVersionID = sessionID
		c.AccessVersion = 1
		c.OrganizationID = uuid.MustParse(stack.NodeJS().OrgID()) // user is not a member
	})

	_, err = authenticator.ValidateJWT(context.Background(), token)

	require.Error(t, err)
	var appErr *errutil.Error
	require.ErrorAs(t, err, &appErr)
	assert.Equal(t, 403, appErr.Status)
	assert.Contains(t, err.Error(), "not member")
}

func TestValidateJWT_UserToken_OrgMembershipInactive(t *testing.T) {
	// Create a user directly in DB with isAccepted=true
	userID := uuid.New()
	testEmail := "inactive-member-" + uuid.New().String()[:8] + "@test.com"
	_, err := stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO users (id, email, username, "isAccepted", "createdAt", "updatedAt")
		VALUES (@userID, @email, @username, true, NOW(), NOW())
	`, pgx.NamedArgs{"userID": userID, "email": testEmail, "username": testEmail})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM users WHERE id = @userID`,
			pgx.NamedArgs{"userID": userID})
	})

	// Create org membership with isActive=false
	orgID := uuid.MustParse(stack.NodeJS().OrgID())
	membershipID := uuid.New()
	_, err = stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO memberships (id, "actorUserId", scope, "scopeOrgId", "isActive", status, "createdAt", "updatedAt")
		VALUES (@membershipID, @userID, 'organization', @orgID, false, 'accepted', NOW(), NOW())
	`, pgx.NamedArgs{"membershipID": membershipID, "userID": userID, "orgID": orgID})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM memberships WHERE id = @membershipID`,
			pgx.NamedArgs{"membershipID": membershipID})
	})

	// Create session
	sessionID := uuid.New()
	_, err = stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO auth_token_sessions (id, "userId", "accessVersion", "refreshVersion", ip, "userAgent", "lastUsed", "createdAt", "updatedAt")
		VALUES (@sessionID, @userID, 1, 1, '127.0.0.1', 'test', NOW(), NOW(), NOW())
	`, pgx.NamedArgs{"sessionID": sessionID, "userID": userID})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM auth_token_sessions WHERE id = @sessionID`,
			pgx.NamedArgs{"sessionID": sessionID})
	})

	token := signUserJWT(t, infra.AuthSecret, func(c *apiauth.UserJWTClaims) {
		c.UserID = userID
		c.TokenVersionID = sessionID
		c.AccessVersion = 1
		c.OrganizationID = orgID
	})

	_, err = authenticator.ValidateJWT(context.Background(), token)

	require.Error(t, err)
	var appErr *errutil.Error
	require.ErrorAs(t, err, &appErr)
	assert.Equal(t, 403, appErr.Status)
	assert.Contains(t, err.Error(), "inactive")
}

// =============================================================================
// Identity Org Membership Tests
// =============================================================================

func TestValidateIdentityAccessToken_NotMemberOfOrg(t *testing.T) {
	nodejs := stack.NodeJS()

	// Create an identity but do NOT add it to any project
	identity := nodejs.CreateIdentity(t, "orphan-identity-"+uuid.New().String()[:8])

	// Get a token for this identity (this creates universal auth)
	token := nodejs.GetIdentityAccessToken(t, identity.ID)

	// Remove the identity from the org membership
	_, err := stack.DB().Primary().Exec(context.Background(), `
		DELETE FROM memberships
		WHERE "actorIdentityId" = @identityID
	`, pgx.NamedArgs{"identityID": uuid.MustParse(identity.ID)})
	require.NoError(t, err)

	_, err = authenticator.ValidateIdentityAccessToken(context.Background(), token, "")

	assertUnauthorized(t, err)
	assert.Contains(t, err.Error(), "not a member")
}

func TestValidateIdentityAccessToken_OrgMembershipInactive(t *testing.T) {
	nodejs := stack.NodeJS()

	projName := "test-inactive-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "inactive-identity-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	token := nodejs.GetIdentityAccessToken(t, identity.ID)

	// Deactivate the org membership
	_, err := stack.DB().Primary().Exec(context.Background(), `
		UPDATE memberships
		SET "isActive" = false
		WHERE "actorIdentityId" = @identityID AND scope = 'organization'
	`, pgx.NamedArgs{"identityID": uuid.MustParse(identity.ID)})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`UPDATE memberships SET "isActive" = true WHERE "actorIdentityId" = @identityID`,
			pgx.NamedArgs{"identityID": uuid.MustParse(identity.ID)})
	})

	_, err = authenticator.ValidateIdentityAccessToken(context.Background(), token, "")

	assertUnauthorized(t, err)
	assert.Contains(t, err.Error(), "inactive")
}

func TestValidateIdentityAccessToken_NonAcceptedStatus(t *testing.T) {
	nodejs := stack.NodeJS()

	projName := "test-invited-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "invited-identity-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	token := nodejs.GetIdentityAccessToken(t, identity.ID)

	// Set the org membership status to a non-accepted, non-null value.
	_, err := stack.DB().Primary().Exec(context.Background(), `
		UPDATE memberships
		SET status = 'invited'
		WHERE "actorIdentityId" = @identityID AND scope = 'organization'
	`, pgx.NamedArgs{"identityID": uuid.MustParse(identity.ID)})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`UPDATE memberships SET status = NULL WHERE "actorIdentityId" = @identityID`,
			pgx.NamedArgs{"identityID": uuid.MustParse(identity.ID)})
	})

	_, err = authenticator.ValidateIdentityAccessToken(context.Background(), token, "")

	assertUnauthorized(t, err)
	assert.Contains(t, err.Error(), "not a member")
}

// =============================================================================
// Identity IP Blocklist Tests
// =============================================================================

func TestValidateIdentityAccessToken_IPBlocked(t *testing.T) {
	nodejs := stack.NodeJS()

	projName := "test-ipblock-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "ipblock-identity-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	// Get an access token (this creates universal auth with 0.0.0.0/0)
	token := nodejs.GetIdentityAccessToken(t, identity.ID)

	// Update the trusted IPs to only allow a specific IP (not 192.168.1.1)
	// Use proper JSON format matching what Infisical stores.
	// No "prefix" field means exact IP match; "prefix":0 would mean /0 (all IPs).
	_, err := stack.DB().Primary().Exec(context.Background(), `
		UPDATE identity_universal_auths
		SET "accessTokenTrustedIps" = '[{"ipAddress":"10.0.0.1","type":"ipv4"}]'::jsonb
		WHERE "identityId" = @identityID
	`, pgx.NamedArgs{"identityID": uuid.MustParse(identity.ID)})
	require.NoError(t, err)

	// Verify the update took effect
	var storedIPs string
	err = stack.DB().Primary().QueryRow(context.Background(), `
		SELECT "accessTokenTrustedIps"::text FROM identity_universal_auths WHERE "identityId" = @identityID
	`, pgx.NamedArgs{"identityID": uuid.MustParse(identity.ID)}).Scan(&storedIPs)
	require.NoError(t, err)
	require.Contains(t, storedIPs, "10.0.0.1", "DB should have the updated IP")

	// Try to validate with an IP not in the allowlist
	_, err = authenticator.ValidateIdentityAccessToken(context.Background(), token, "192.168.1.1")

	require.Error(t, err)
	var appErr *errutil.Error
	require.ErrorAs(t, err, &appErr)
	assert.Equal(t, 403, appErr.Status)
	assert.Contains(t, err.Error(), "IP address")
}

func TestValidateIdentityAccessToken_IPAllowed(t *testing.T) {
	nodejs := stack.NodeJS()

	projName := "test-ipallow-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "ipallow-identity-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	token := nodejs.GetIdentityAccessToken(t, identity.ID)

	// Update the trusted IPs to allow a specific CIDR
	_, err := stack.DB().Primary().Exec(context.Background(), `
		UPDATE identity_universal_auths
		SET "accessTokenTrustedIps" = '[{"ipAddress":"192.168.0.0","prefix":16}]'
		WHERE "identityId" = @identityID
	`, pgx.NamedArgs{"identityID": uuid.MustParse(identity.ID)})
	require.NoError(t, err)

	// Validate with an IP within the CIDR
	authIdentity, err := authenticator.ValidateIdentityAccessToken(context.Background(), token, "192.168.1.100")

	require.NoError(t, err)
	assert.Equal(t, uuid.MustParse(identity.ID), authIdentity.ActorID)
}

func TestValidateIdentityAccessToken_NoIPCheckWhenEmpty(t *testing.T) {
	nodejs := stack.NodeJS()

	projName := "test-noipcheck-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "noipcheck-identity-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	token := nodejs.GetIdentityAccessToken(t, identity.ID)

	// The default is 0.0.0.0/0 which allows all - validate works with any IP
	authIdentity, err := authenticator.ValidateIdentityAccessToken(context.Background(), token, "8.8.8.8")

	require.NoError(t, err)
	assert.Equal(t, uuid.MustParse(identity.ID), authIdentity.ActorID)
}

// =============================================================================
// Service Token Edge Cases
// =============================================================================

func TestValidateServiceToken_ProjectNotFound(t *testing.T) {
	nodejs := stack.NodeJS()

	projName := "test-st-projdel-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)

	st := nodejs.CreateServiceToken(t, proj.ID, nil)

	// Delete the project (this should cascade delete the service token too,
	// but let's manually delete just the project row to simulate orphaned token)
	_, err := stack.DB().Primary().Exec(context.Background(), `
		DELETE FROM projects WHERE id = @projectID
	`, pgx.NamedArgs{"projectID": proj.ID})
	require.NoError(t, err)

	_, err = authenticator.ValidateServiceToken(context.Background(), st.Token)

	// Either not found (token cascade deleted) or project not found
	require.Error(t, err)
}

// =============================================================================
// Legacy Identity Token Constraints (Integration)
// =============================================================================

func TestValidateIdentityAccessToken_LegacyTTLExpired(t *testing.T) {
	nodejs := stack.NodeJS()

	projName := "test-legacy-ttl-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "legacy-ttl-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	tokenID := uuid.New()
	identityID := uuid.MustParse(identity.ID)

	// Insert a legacy token with expired TTL (created 2 hours ago, TTL 1 hour)
	_, err := stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO identity_access_tokens (
			id, "identityId", "isAccessTokenRevoked", "accessTokenTTL", "accessTokenMaxTTL",
			"accessTokenNumUses", "accessTokenNumUsesLimit", "accessTokenLastRenewedAt",
			"authMethod", "createdAt", "updatedAt"
		) VALUES (
			@tokenID, @identityID, false, 3600, 0, 0, 0, @lastRenewed,
			'universal-auth', @createdAt, NOW()
		)
	`, pgx.NamedArgs{
		"tokenID":     tokenID,
		"identityID":  identityID,
		"lastRenewed": time.Now().Add(-2 * time.Hour),
		"createdAt":   time.Now().Add(-2 * time.Hour),
	})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM identity_access_tokens WHERE id = @tokenID`,
			pgx.NamedArgs{"tokenID": tokenID})
	})

	// Create a legacy token (without full renew claims)
	legacyToken := signIdentityJWT(t, infra.AuthSecret, func(c *apiauth.IdentityJWTClaims) {
		c.IdentityID = identityID
		c.IdentityAccessTokenID = tokenID.String()
		// No OrgID, AuthMethod, etc. - makes it a legacy token
		c.OrgID = uuid.Nil
		c.AuthMethod = ""
		c.AccessTokenTTL = 0
	})

	_, err = authenticator.ValidateIdentityAccessToken(context.Background(), legacyToken, "")

	assertUnauthorized(t, err)
	assert.Contains(t, err.Error(), "TTL expired")
}

func TestValidateIdentityAccessToken_LegacyMaxTTLExpired(t *testing.T) {
	nodejs := stack.NodeJS()

	projName := "test-legacy-maxttl-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "legacy-maxttl-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	tokenID := uuid.New()
	identityID := uuid.MustParse(identity.ID)

	// Insert a legacy token with expired maxTTL (created 3 hours ago, maxTTL 2 hours)
	_, err := stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO identity_access_tokens (
			id, "identityId", "isAccessTokenRevoked", "accessTokenTTL", "accessTokenMaxTTL",
			"accessTokenNumUses", "accessTokenNumUsesLimit", "accessTokenLastRenewedAt",
			"authMethod", "createdAt", "updatedAt"
		) VALUES (
			@tokenID, @identityID, false, 86400, 7200, 0, 0, @lastRenewed,
			'universal-auth', @createdAt, NOW()
		)
	`, pgx.NamedArgs{
		"tokenID":     tokenID,
		"identityID":  identityID,
		"lastRenewed": time.Now().Add(-1 * time.Minute), // recently renewed (TTL ok)
		"createdAt":   time.Now().Add(-3 * time.Hour),   // but created too long ago (maxTTL expired)
	})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM identity_access_tokens WHERE id = @tokenID`,
			pgx.NamedArgs{"tokenID": tokenID})
	})

	legacyToken := signIdentityJWT(t, infra.AuthSecret, func(c *apiauth.IdentityJWTClaims) {
		c.IdentityID = identityID
		c.IdentityAccessTokenID = tokenID.String()
		c.OrgID = uuid.Nil
		c.AuthMethod = ""
		c.AccessTokenTTL = 0
	})

	_, err = authenticator.ValidateIdentityAccessToken(context.Background(), legacyToken, "")

	assertUnauthorized(t, err)
	assert.Contains(t, err.Error(), "max TTL expired")
}

func TestValidateIdentityAccessToken_LegacyUsageLimitReached(t *testing.T) {
	nodejs := stack.NodeJS()

	projName := "test-legacy-usage-" + uuid.New().String()[:8]
	proj := nodejs.CreateProject(t, projName)
	t.Cleanup(func() {
		nodejs.DeleteProject(t, proj.ID)
	})

	identity := nodejs.CreateIdentity(t, "legacy-usage-"+uuid.New().String()[:8])
	nodejs.AddIdentityToProject(t, proj.ID, identity.ID, infra.Role("admin"))

	tokenID := uuid.New()
	identityID := uuid.MustParse(identity.ID)

	// Insert a legacy token with usage limit reached
	_, err := stack.DB().Primary().Exec(context.Background(), `
		INSERT INTO identity_access_tokens (
			id, "identityId", "isAccessTokenRevoked", "accessTokenTTL", "accessTokenMaxTTL",
			"accessTokenNumUses", "accessTokenNumUsesLimit", "authMethod", "createdAt", "updatedAt"
		) VALUES (
			@tokenID, @identityID, false, 0, 0, 5, 5,
			'universal-auth', NOW(), NOW()
		)
	`, pgx.NamedArgs{
		"tokenID":    tokenID,
		"identityID": identityID,
	})
	require.NoError(t, err)
	t.Cleanup(func() {
		_, _ = stack.DB().Primary().Exec(context.Background(),
			`DELETE FROM identity_access_tokens WHERE id = @tokenID`,
			pgx.NamedArgs{"tokenID": tokenID})
	})

	legacyToken := signIdentityJWT(t, infra.AuthSecret, func(c *apiauth.IdentityJWTClaims) {
		c.IdentityID = identityID
		c.IdentityAccessTokenID = tokenID.String()
		c.OrgID = uuid.Nil
		c.AuthMethod = ""
		c.AccessTokenTTL = 0
	})

	_, err = authenticator.ValidateIdentityAccessToken(context.Background(), legacyToken, "")

	assertUnauthorized(t, err)
	assert.Contains(t, err.Error(), "usage limit")
}
