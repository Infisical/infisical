package apiauth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"golang.org/x/crypto/bcrypt"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/keystore"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/assumeprivilege"
	"github.com/infisical/api/internal/services/auth"
)

// maxMachineIdentityTokenAge is the maximum TTL in seconds for identity access tokens.
// Used for usage counter expiry in Redis.
const maxMachineIdentityTokenAge = 86400 * 30 // 30 days

// AssumePrivilegeVerifier is the interface for verifying assume privilege tokens.
// Implemented by assumeprivilege.Service.
type AssumePrivilegeVerifier interface {
	VerifyAssumePrivilegeToken(ctx context.Context, opts *assumeprivilege.VerifyTokenOpts) (*auth.AssumedPrivilegeDetails, error)
}

// ErrorHandler handles HTTP error responses with proper logging.
// This interface matches shared.ErrorHandler to avoid import cycles.
type ErrorHandler interface {
	HandleError(w http.ResponseWriter, r *http.Request, statusCode int, err error)
}

// ApiAuthenticator performs token validation for various auth methods.
// It's an exact port of the Node.js inject-identity logic.
type ApiAuthenticator struct {
	logger          *slog.Logger
	db              pg.DB
	keyStore        keystore.KeyStore
	authSecret      []byte
	assumePrivilege AssumePrivilegeVerifier
	errorHandler    ErrorHandler
}

// NewApiAuthenticator creates an ApiAuthenticator with real validation backed by pg.DB.
// keyStore can be nil for tests that don't need Redis-backed features.
// assumePrivilege can be nil if assume privilege feature is not needed.
func NewApiAuthenticator(logger *slog.Logger, db pg.DB, authSecret string, keyStore keystore.KeyStore, assumePrivilege AssumePrivilegeVerifier, errorHandler ErrorHandler) *ApiAuthenticator {
	return &ApiAuthenticator{logger: logger, db: db, authSecret: []byte(authSecret), keyStore: keyStore, assumePrivilege: assumePrivilege, errorHandler: errorHandler}
}

// AssumePrivilege returns the assume privilege verifier.
func (a *ApiAuthenticator) AssumePrivilege() AssumePrivilegeVerifier {
	return a.assumePrivilege
}

// ValidateJWTToken parses a JWT once, routes based on authTokenType, and validates.
// This is the unified entry point for all JWT validation.
// Returns (identity, authMode, error) where authMode indicates the actual token type.
func (a *ApiAuthenticator) ValidateJWTToken(ctx context.Context, token, ipAddress string) (*auth.Identity, auth.AuthMode, error) {
	claims, err := parseJWT(token, a.authSecret)
	if err != nil {
		return nil, "", errutil.Unauthorized("Invalid JWT token").WithErrf("validateJWTToken: %w", err)
	}

	switch claims.AuthTokenType {
	case auth.AuthTokenTypeAccessToken:
		identity, err := a.validateUserTokenClaims(ctx, claims.ToUserClaims())
		return identity, auth.AuthModeJWT, err

	case auth.AuthTokenTypeIdentityAccessToken:
		identity, err := a.validateIdentityTokenClaims(ctx, claims.ToIdentityClaims(), ipAddress)
		return identity, auth.AuthModeIdentityAccessToken, err

	default:
		return nil, "", errutil.Unauthorized("Unsupported token type").WithErrf("validateJWTToken: unsupported authTokenType %s", claims.AuthTokenType)
	}
}

// ValidateJWT validates a user JWT token.
// For unified JWT handling that auto-routes based on token type, use ValidateJWTToken.
func (a *ApiAuthenticator) ValidateJWT(ctx context.Context, token string) (*auth.Identity, error) {
	claims, err := parseJWT(token, a.authSecret)
	if err != nil {
		return nil, errutil.Unauthorized("Invalid JWT token").WithErrf("validateJWT: %w", err)
	}

	if claims.AuthTokenType != auth.AuthTokenTypeAccessToken {
		return nil, errutil.Unauthorized("You are not allowed to access this resource").WithErrf("validateJWT: invalid authTokenType %s", claims.AuthTokenType)
	}

	return a.validateUserTokenClaims(ctx, claims.ToUserClaims())
}

// validateUserTokenClaims validates pre-parsed user JWT claims.
func (a *ApiAuthenticator) validateUserTokenClaims(ctx context.Context, claims *UserJWTClaims) (*auth.Identity, error) {
	// 1. Find session by tokenVersionId + userId.
	session, err := a.findSessionByIDAndUserID(ctx, claims.TokenVersionID, claims.UserID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to validate session").WithErrf("validateJWT(sessionId=%s, userId=%s): %w", claims.TokenVersionID, claims.UserID, err)
	}
	if session == nil {
		return nil, errutil.NotFound("Session not found").WithErrf("validateJWT(sessionId=%s, userId=%s): session is nil", claims.TokenVersionID, claims.UserID)
	}

	// 4. Check access version.
	if claims.AccessVersion != int(session.AccessVersion) {
		return nil, errutil.Unauthorized("User session is stale, please re-authenticate").WithName("StaleSession").WithErrf("validateJWT(sessionId=%s): access version mismatch claim=%d db=%d", claims.TokenVersionID, claims.AccessVersion, session.AccessVersion)
	}

	// 5. Find user.
	user, err := a.findUserByID(ctx, session.UserID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find user").WithErrf("validateJWT(userId=%s): %w", session.UserID, err)
	}
	if user == nil || !user.IsAccepted.V {
		return nil, errutil.NotFound("User with ID '%s' not found", session.UserID).WithErrf("validateJWT: user not found or not accepted")
	}

	// 5a. Check user lock status.
	if user.IsLocked.Valid && user.IsLocked.V {
		return nil, errutil.Unauthorized("Account is locked").WithErrf("validateJWT(userId=%s): user is permanently locked", user.ID)
	}
	if user.TemporaryLockDateEnd.Valid && time.Now().Before(user.TemporaryLockDateEnd.V) {
		return nil, errutil.Unauthorized("Account is locked").WithErrf("validateJWT(userId=%s): user is temporarily locked", user.ID)
	}

	// 6. Organization scoping.
	var orgID, rootOrgID, parentOrgID uuid.UUID
	var orgName string
	if claims.OrganizationID != uuid.Nil {
		if claims.SubOrganizationID != uuid.Nil {
			// 6a. Sub-organization scope.
			subOrg, err := a.findOrgByID(ctx, claims.SubOrganizationID)
			if err != nil {
				return nil, errutil.DatabaseErr("Failed to find sub-organization").WithErrf("validateJWT(subOrgId=%s): %w", claims.SubOrganizationID, err)
			}
			if subOrg == nil {
				return nil, errutil.BadRequest("Sub organization %s not found", claims.SubOrganizationID).WithErrf("validateJWT: sub-organization not found")
			}

			// Verify the sub-org belongs to the token's root organization.
			var subRootOrgID uuid.UUID
			if nullUUIDValid(subOrg.RootOrgID) {
				subRootOrgID = subOrg.RootOrgID.V
			}
			if subRootOrgID != claims.OrganizationID && subOrg.ID != claims.OrganizationID {
				return nil, errutil.Forbidden("Sub-organization does not belong to the token's organization").WithErrf("validateJWT(subOrgId=%s, claimOrgId=%s): org mismatch", subOrg.ID, claims.OrganizationID)
			}

			orgMembership, err := a.findEffectiveOrgMembership(ctx, auth.ActorTypeUser, user.ID, subOrg.ID, "accepted")
			if err != nil {
				return nil, errutil.DatabaseErr("Failed to check org membership").WithErrf("validateJWT(userId=%s, orgId=%s): %w", user.ID, subOrg.ID, err)
			}
			if orgMembership == nil {
				return nil, errutil.Forbidden("User not member of organization").WithErrf("validateJWT(userId=%s, subOrgId=%s): no membership found", user.ID, subOrg.ID)
			}
			if !orgMembership.IsActive {
				return nil, errutil.Forbidden("User organization membership is inactive").WithErrf("validateJWT(userId=%s, subOrgId=%s): membership inactive", user.ID, subOrg.ID)
			}

			orgID = subOrg.ID
			orgName = subOrg.Name
			rootOrgID = claims.OrganizationID
			if nullUUIDValid(subOrg.ParentOrgID) {
				parentOrgID = subOrg.ParentOrgID.V
			}
		} else {
			// 6b. Regular organization scope.
			org, err := a.findOrgByID(ctx, claims.OrganizationID)
			if err != nil {
				return nil, errutil.DatabaseErr("Failed to find organization").WithErrf("validateJWT(orgId=%s): %w", claims.OrganizationID, err)
			}
			if org == nil {
				// findOrgByID returns (nil, nil) on pgx.ErrNoRows. The org row can be
				// missing if it was deleted between JWT issue and validation; without
				// this guard `org.Name` below panics.
				return nil, errutil.NotFound("Organization %s not found", claims.OrganizationID).WithErrf("validateJWT(orgId=%s): organization not found", claims.OrganizationID)
			}

			orgMembership, err := a.findEffectiveOrgMembership(ctx, auth.ActorTypeUser, user.ID, claims.OrganizationID, "accepted")
			if err != nil {
				return nil, errutil.DatabaseErr("Failed to check org membership").WithErrf("validateJWT(userId=%s, orgId=%s): %w", user.ID, claims.OrganizationID, err)
			}
			if orgMembership == nil {
				return nil, errutil.Forbidden("User not member of organization").WithErrf("validateJWT(userId=%s, orgId=%s): no membership found", user.ID, claims.OrganizationID)
			}
			if !orgMembership.IsActive {
				return nil, errutil.Forbidden("User organization membership is inactive").WithErrf("validateJWT(userId=%s, orgId=%s): membership inactive", user.ID, claims.OrganizationID)
			}

			orgID = claims.OrganizationID
			orgName = org.Name
			rootOrgID = claims.OrganizationID
			parentOrgID = claims.OrganizationID
		}
	}

	// 7. Build identity.
	isSuperAdmin := user.SuperAdmin.Valid && user.SuperAdmin.V
	email := ""
	if user.Email.Valid {
		email = user.Email.V
	}

	username := ""
	if user.Username.Valid {
		username = user.Username.V
	}

	return &auth.Identity{
		AuthMode:       auth.AuthModeJWT,
		Actor:          auth.ActorTypeUser,
		ActorID:        user.ID,
		OrgID:          orgID,
		RootOrgID:      rootOrgID,
		ParentOrgID:    parentOrgID,
		OrgName:        orgName,
		AuthMethod:     auth.ActorAuthMethod(claims.AuthMethod),
		IsSuperAdmin:   isSuperAdmin,
		TokenVersionID: claims.TokenVersionID,
		IsMfaVerified:  claims.IsMfaVerified,
		MfaMethod:      claims.MfaMethod,
		UserAuthInfo: &auth.UserAuthInfo{
			UserID: user.ID,
			Email:  email,
		},
		Email:    email,
		Username: username,
	}, nil
}

// ValidateIdentityAccessToken validates an identity access token.
// For unified JWT handling that auto-routes based on token type, use ValidateJWTToken.
func (a *ApiAuthenticator) ValidateIdentityAccessToken(ctx context.Context, token, ipAddress string) (*auth.Identity, error) {
	claims, err := parseJWT(token, a.authSecret)
	if err != nil {
		return nil, errutil.Unauthorized("You are not allowed to access this resource").WithErrf("validateIdentityAccessToken: JWT parse failed: %w", err)
	}

	if claims.AuthTokenType != auth.AuthTokenTypeIdentityAccessToken {
		return nil, errutil.Unauthorized("You are not allowed to access this resource").WithErrf("validateIdentityAccessToken: invalid authTokenType %s", claims.AuthTokenType)
	}

	return a.validateIdentityTokenClaims(ctx, claims.ToIdentityClaims(), ipAddress)
}

// validateIdentityTokenClaims validates pre-parsed identity JWT claims.
func (a *ApiAuthenticator) validateIdentityTokenClaims(ctx context.Context, claims *IdentityJWTClaims, ipAddress string) (*auth.Identity, error) {
	// 1. Resolve token source - new format uses JWT claims, legacy falls back to DB.
	var (
		identityID   = claims.IdentityID
		identityName string
		authMethod   auth.IdentityAuthMethod
		orgID        uuid.UUID
		rootOrgID    uuid.UUID
		parentOrgID  uuid.UUID
	)

	if claims.HasFullRenewClaims() {
		// New-format token: use claims directly (stateless validation)
		identityName = claims.IdentityName
		authMethod = auth.IdentityAuthMethod(claims.AuthMethod)
		orgID = claims.OrgID
		rootOrgID = claims.RootOrgID
		parentOrgID = claims.ParentOrgID
	} else {
		// Legacy token: fall back to DB lookup
		accessToken, err := a.findIdentityAccessTokenByID(ctx, claims.IdentityAccessTokenID)
		if err != nil {
			return nil, errutil.DatabaseErr("Failed to find identity access token").WithErrf("validateIdentityAccessToken(tokenId=%s): %w", claims.IdentityAccessTokenID, err)
		}
		if accessToken == nil || accessToken.IsAccessTokenRevoked {
			return nil, errutil.Unauthorized("Cannot renew revoked or unknown access token").WithErrf("validateIdentityAccessToken(tokenId=%s): token not found or revoked", claims.IdentityAccessTokenID)
		}

		// Validate DB-stored TTL, maxTTL, and usage limits for legacy tokens.
		if err := validateLegacyAccessTokenConstraints(accessToken, time.Now()); err != nil {
			return nil, err
		}

		identityName = accessToken.IdentityName
		authMethod = accessToken.AuthMethod

		// Resolve scope org from DB row
		var scopeOrgUUID uuid.UUID
		if nullUUIDValid(accessToken.SubOrganizationID) {
			scopeOrgUUID = accessToken.SubOrganizationID.V
		} else {
			scopeOrgUUID = accessToken.IdentityOrgID
		}

		org, err := a.findOrgByID(ctx, scopeOrgUUID)
		if err != nil {
			return nil, errutil.DatabaseErr("Failed to find organization").WithErrf("validateIdentityAccessToken(orgId=%s): %w", scopeOrgUUID, err)
		}
		if org == nil {
			return nil, errutil.NotFound("Organization not found for identity").WithErrf("validateIdentityAccessToken(orgId=%s): org not found", scopeOrgUUID)
		}

		orgID, rootOrgID, parentOrgID, _ = resolveOrgHierarchy(org)
	}

	// 4. IP check (applies to both new and legacy tokens).
	if ipAddress != "" {
		trustedIPs, err := a.findTrustedIPsByAuthMethod(ctx, identityID, authMethod)
		if err != nil {
			return nil, errutil.DatabaseErr("Failed to find trusted IPs").WithErrf("validateIdentityAccessToken(identityId=%s, authMethod=%s): %w", identityID, authMethod, err)
		}
		if trustedIPs != nil {
			if ipErr := checkIPAgainstBlocklist(ipAddress, trustedIPs); ipErr != nil {
				return nil, ipErr
			}
		}
	}

	// 5. Check org membership.
	membership, err := a.findEffectiveOrgMembership(ctx, auth.ActorTypeIdentity, identityID, orgID, "")
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to check org membership").WithErrf("validateIdentityAccessToken(identityId=%s, orgId=%s): %w", identityID, orgID, err)
	}
	if membership == nil {
		return nil, errutil.Unauthorized("Identity is not a member of the organization").WithErrf("validateIdentityAccessToken(identityId=%s, orgId=%s): no membership found", identityID, orgID)
	}
	if !membership.IsActive {
		return nil, errutil.Unauthorized("Identity organization membership is inactive").WithErrf("validateIdentityAccessToken(identityId=%s, orgId=%s): membership inactive", identityID, orgID)
	}

	// 5a. Revocation check (DB-based via identity_access_token_revocations table).
	tokenID := claims.ID // jti
	if tokenID == "" {
		tokenID = claims.IdentityAccessTokenID
	}
	issuedAtMs := int64(0)
	if claims.IssuedAt != nil {
		issuedAtMs = claims.IssuedAt.UnixMilli()
	}
	if err := a.assertTokenIsNotRevoked(ctx, tokenID, identityID, issuedAtMs); err != nil {
		return nil, err
	}

	// 5b. Usage tracking via keystore (numUsesLimit checks).
	numUsesLimit := claims.NumUsesLimit
	if numUsesLimit > 0 {
		if err := a.checkAndDecrementUsesRemaining(ctx, identityID, tokenID, numUsesLimit); err != nil {
			return nil, err
		}
	}

	// 6. Build identity auth info (for audit logging).
	identityAuthInfo := &auth.AuthInfo{
		IdentityID:   identityID,
		IdentityName: identityName,
		AuthMethod:   authMethod,
	}
	if claims.IdentityAuth != nil {
		if claims.IdentityAuth.OIDC != nil {
			identityAuthInfo.OIDC = claims.IdentityAuth.OIDC
		}
		if claims.IdentityAuth.Kubernetes != nil {
			identityAuthInfo.Kubernetes = claims.IdentityAuth.Kubernetes
		}
		if claims.IdentityAuth.AWS != nil {
			identityAuthInfo.AWS = claims.IdentityAuth.AWS
		}
	}

	// 7. Build identity.
	return &auth.Identity{
		AuthMode:         auth.AuthModeIdentityAccessToken,
		Actor:            auth.ActorTypeIdentity,
		ActorID:          identityID,
		OrgID:            orgID,
		RootOrgID:        rootOrgID,
		ParentOrgID:      parentOrgID,
		AuthMethod:       auth.ActorAuthMethod(authMethod),
		IdentityAuthInfo: identityAuthInfo,
		Name:             identityName,
	}, nil
}

// ValidateServiceToken performs real service token validation.
// TODO(go): FIPS mode changes in bcrypt to the other one is needed
func (a *ApiAuthenticator) ValidateServiceToken(ctx context.Context, token string) (*auth.Identity, error) {
	// 1. Split token: "st.<tokenID>.<tokenSecret>[.<extra>]"
	// Legacy tokens may have a 4th segment that should be ignored.
	parts := strings.SplitN(token, ".", 4)
	if len(parts) < 3 || parts[0] != "st" {
		return nil, errutil.Unauthorized("You are not allowed to access this resource").WithErrf("validateServiceToken: invalid token format")
	}
	tokenID := parts[1]
	tokenSecret := parts[2]
	// 2. Find service token.
	serviceToken, err := a.findServiceTokenByID(ctx, tokenID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find service token").WithErrf("validateServiceToken(tokenId=%s): %w", tokenID, err)
	}
	if serviceToken == nil {
		return nil, errutil.NotFound("Service token with ID '%s' not found", tokenID).WithErrf("validateServiceToken: token not found in DB")
	}

	// 3. Find project.
	project, err := a.findProjectByID(ctx, serviceToken.ProjectID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find project").WithErrf("validateServiceToken(projectId=%s): %w", serviceToken.ProjectID, err)
	}
	if project == nil {
		return nil, errutil.NotFound("Project with ID '%s' not found", serviceToken.ProjectID).WithErrf("validateServiceToken: project not found")
	}

	// 4. Check expiration.
	if serviceToken.ExpiresAt.Valid && serviceToken.ExpiresAt.V.Before(time.Now()) {
		if err := a.deleteServiceTokenByID(ctx, serviceToken.ID); err != nil {
			a.logger.WarnContext(ctx, "failed to delete expired service token", slog.String("tokenID", serviceToken.ID.String()), slog.Any("error", err))
		}
		return nil, errutil.Forbidden("Service token has expired").WithErrf("validateServiceToken(tokenId=%s): token expired", serviceToken.ID)
	}

	// 5. Verify secret hash (bcrypt).
	if err := bcrypt.CompareHashAndPassword([]byte(serviceToken.SecretHash), []byte(tokenSecret)); err != nil {
		return nil, errutil.Unauthorized("Invalid service token").WithErrf("validateServiceToken(tokenId=%s): secret hash mismatch", serviceToken.ID)
	}

	// 6. Find org.
	org, err := a.findOrgByID(ctx, project.OrgID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find organization").WithErrf("validateServiceToken(orgId=%s): %w", project.OrgID, err)
	}
	if org == nil {
		return nil, errutil.NotFound("Organization not found for project").WithErrf("validateServiceToken(orgId=%s): org not found", project.OrgID)
	}

	// 7. Build identity.
	orgID, rootOrgID, parentOrgID, orgName := resolveOrgHierarchy(org)
	return &auth.Identity{
		AuthMode:    auth.AuthModeServiceToken,
		Actor:       auth.ActorTypeService,
		ActorID:     serviceToken.ID,
		OrgID:       orgID,
		RootOrgID:   rootOrgID,
		ParentOrgID: parentOrgID,
		OrgName:     orgName,
		Name:        serviceToken.Name,
	}, nil
}

// resolveOrgHierarchy extracts orgID, rootOrgID, parentOrgID, and orgName from an orgRow.
func resolveOrgHierarchy(org *orgRow) (orgID, rootOrgID, parentOrgID uuid.UUID, orgName string) {
	orgID = org.ID
	orgName = org.Name
	rootOrgID = orgID
	parentOrgID = orgID
	if nullUUIDValid(org.RootOrgID) {
		rootOrgID = org.RootOrgID.V
	}
	if nullUUIDValid(org.ParentOrgID) {
		parentOrgID = org.ParentOrgID.V
	}
	return
}

// --- Row types ---

// sessionRow holds the subset of auth_token_sessions used by the authenticator.
type sessionRow struct {
	AccessVersion int32     `db:"access_version"`
	UserID        uuid.UUID `db:"user_id"`
}

// userRow holds the subset of users used by the authenticator.
type userRow struct {
	ID                   uuid.UUID           `db:"id"`
	Email                sql.Null[string]    `db:"email"`
	Username             sql.Null[string]    `db:"username"`
	IsAccepted           sql.Null[bool]      `db:"is_accepted"`
	SuperAdmin           sql.Null[bool]      `db:"super_admin"`
	IsLocked             sql.Null[bool]      `db:"is_locked"`
	TemporaryLockDateEnd sql.Null[time.Time] `db:"temporary_lock_date_end"`
}

// orgRow holds the subset of organizations used by the authenticator.
type orgRow struct {
	ID          uuid.UUID           `db:"id"`
	Name        string              `db:"name"`
	RootOrgID   sql.Null[uuid.UUID] `db:"root_org_id"`
	ParentOrgID sql.Null[uuid.UUID] `db:"parent_org_id"`
}

// projectRow holds the subset of projects used by the authenticator.
type projectRow struct {
	OrgID uuid.UUID `db:"org_id"`
}

// identityAccessTokenRow holds the identity_access_tokens columns + joined identity fields.
type identityAccessTokenRow struct {
	ID                       uuid.UUID               `db:"id"`
	AccessTokenTTL           int64                   `db:"access_token_ttl"`
	AccessTokenMaxTTL        int64                   `db:"access_token_max_ttl"`
	AccessTokenNumUses       int64                   `db:"access_token_num_uses"`
	AccessTokenNumUsesLimit  int64                   `db:"access_token_num_uses_limit"`
	AccessTokenLastRenewedAt sql.Null[time.Time]     `db:"access_token_last_renewed_at"`
	IsAccessTokenRevoked     bool                    `db:"is_access_token_revoked"`
	IdentityID               uuid.UUID               `db:"identity_id"`
	CreatedAt                sql.Null[time.Time]     `db:"created_at"`
	AuthMethod               auth.IdentityAuthMethod `db:"auth_method"`
	AccessTokenPeriod        int64                   `db:"access_token_period"`
	SubOrganizationID        sql.Null[uuid.UUID]     `db:"sub_organization_id"`
	IdentityOrgID            uuid.UUID               `db:"identity_org_id"`
	IdentityName             string                  `db:"identity_name"`
}

// serviceTokenRow holds the subset of service_tokens used by the authenticator.
type serviceTokenRow struct {
	ID         uuid.UUID           `db:"id"`
	Name       string              `db:"name"`
	ProjectID  string              `db:"project_id"`
	ExpiresAt  sql.Null[time.Time] `db:"expires_at"`
	SecretHash string              `db:"secret_hash"`
}

// membershipRow holds the subset of memberships used by the authenticator.
type membershipRow struct {
	IsActive bool `db:"is_active"`
}

// --- Query methods ---

// findSessionByIDAndUserID returns the session matching id + userId, or nil if not found.
func (a *ApiAuthenticator) findSessionByIDAndUserID(ctx context.Context, sessionID, userID uuid.UUID) (*sessionRow, error) {
	query := `
		SELECT "accessVersion", "userId"
		FROM auth_token_sessions
		WHERE id = @sessionID AND "userId" = @userID
	`
	args := pgx.NamedArgs{"sessionID": sessionID, "userID": userID}

	row := a.db.Replica().QueryRow(ctx, query, args)
	var session sessionRow
	err := row.Scan(&session.AccessVersion, &session.UserID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &session, nil
}

// findUserByID returns the user matching id, or nil if not found.
func (a *ApiAuthenticator) findUserByID(ctx context.Context, id uuid.UUID) (*userRow, error) {
	query := `
		SELECT id, email, username, "isAccepted", "superAdmin", "isLocked", "temporaryLockDateEnd"
		FROM users
		WHERE id = @id
	`
	args := pgx.NamedArgs{"id": id}

	row := a.db.Replica().QueryRow(ctx, query, args)
	var user userRow
	err := row.Scan(&user.ID, &user.Email, &user.Username, &user.IsAccepted, &user.SuperAdmin, &user.IsLocked, &user.TemporaryLockDateEnd)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &user, nil
}

// findOrgByID returns the organization matching id, or nil if not found.
func (a *ApiAuthenticator) findOrgByID(ctx context.Context, id uuid.UUID) (*orgRow, error) {
	query := `
		SELECT id, name, "rootOrgId", "parentOrgId"
		FROM organizations
		WHERE id = @id
	`
	args := pgx.NamedArgs{"id": id}

	row := a.db.Replica().QueryRow(ctx, query, args)
	var org orgRow
	err := row.Scan(&org.ID, &org.Name, &org.RootOrgID, &org.ParentOrgID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &org, nil
}

// findProjectByID returns the project matching id, or nil if not found.
func (a *ApiAuthenticator) findProjectByID(ctx context.Context, id string) (*projectRow, error) {
	query := `
		SELECT "orgId"
		FROM projects
		WHERE id = @id
	`
	args := pgx.NamedArgs{"id": id}

	row := a.db.Replica().QueryRow(ctx, query, args)
	var project projectRow
	err := row.Scan(&project.OrgID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &project, nil
}

// findIdentityAccessTokenByID returns the token (joined with identity), or nil if not found.
func (a *ApiAuthenticator) findIdentityAccessTokenByID(ctx context.Context, id string) (*identityAccessTokenRow, error) {
	query := `
		SELECT
			token.id,
			token."accessTokenTTL",
			token."accessTokenMaxTTL",
			token."accessTokenNumUses",
			token."accessTokenNumUsesLimit",
			token."accessTokenLastRenewedAt",
			token."isAccessTokenRevoked",
			token."identityId",
			token."createdAt",
			token."authMethod",
			token."accessTokenPeriod",
			token."subOrganizationId",
			identity."orgId" AS identity_org_id,
			identity.name AS identity_name
		FROM identity_access_tokens token
		INNER JOIN identities identity ON token."identityId" = identity.id
		WHERE token.id = @id
	`
	args := pgx.NamedArgs{"id": id}

	row := a.db.Replica().QueryRow(ctx, query, args)
	var token identityAccessTokenRow
	err := row.Scan(
		&token.ID,
		&token.AccessTokenTTL,
		&token.AccessTokenMaxTTL,
		&token.AccessTokenNumUses,
		&token.AccessTokenNumUsesLimit,
		&token.AccessTokenLastRenewedAt,
		&token.IsAccessTokenRevoked,
		&token.IdentityID,
		&token.CreatedAt,
		&token.AuthMethod,
		&token.AccessTokenPeriod,
		&token.SubOrganizationID,
		&token.IdentityOrgID,
		&token.IdentityName,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &token, nil
}

// findServiceTokenByID returns the service token matching id, or nil.
func (a *ApiAuthenticator) findServiceTokenByID(ctx context.Context, id string) (*serviceTokenRow, error) {
	query := `
		SELECT id, name, "projectId", "expiresAt", "secretHash"
		FROM service_tokens
		WHERE id = @id
	`
	args := pgx.NamedArgs{"id": id}

	row := a.db.Replica().QueryRow(ctx, query, args)
	var token serviceTokenRow
	err := row.Scan(&token.ID, &token.Name, &token.ProjectID, &token.ExpiresAt, &token.SecretHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &token, nil
}

// deleteServiceTokenByID deletes the service token on primary. Used for expired tokens.
func (a *ApiAuthenticator) deleteServiceTokenByID(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM service_tokens WHERE id = @id`
	args := pgx.NamedArgs{"id": id}
	_, err := a.db.Primary().Exec(ctx, query, args)
	return err
}

// findEffectiveOrgMembership returns the first effective org membership for an actor (user or identity),
// including direct membership and membership via groups.
// Exact port of Node.js orgDAL.findEffectiveOrgMembership.
func (a *ApiAuthenticator) findEffectiveOrgMembership(ctx context.Context, actorType auth.ActorType, actorID, orgID uuid.UUID, filterStatus string) (*membershipRow, error) {
	var actorCondition string
	if actorType == auth.ActorTypeUser {
		actorCondition = `(
			membership."actorUserId" = @actorID
			OR membership."actorGroupId" IN (
				SELECT grp.id FROM groups grp
				INNER JOIN user_group_membership ugm ON ugm."groupId" = grp.id
				WHERE ugm."userId" = @actorID
			)
		)`
	} else {
		actorCondition = `(
			membership."actorIdentityId" = @actorID
			OR membership."actorGroupId" IN (
				SELECT grp.id FROM groups grp
				INNER JOIN identity_group_membership igm ON igm."groupId" = grp.id
				WHERE igm."identityId" = @actorID
			)
		)`
	}

	statusFilter := "accepted"
	if filterStatus != "" {
		statusFilter = filterStatus
	}

	query := fmt.Sprintf(`
		SELECT membership."isActive"
		FROM memberships membership
		WHERE membership.scope = 'organization'
		  AND membership."scopeOrgId" = @orgID
		  AND %s
		  AND (membership.status = @status OR membership.status IS NULL)
		LIMIT 1
	`, actorCondition)

	args := pgx.NamedArgs{
		"actorID": actorID,
		"orgID":   orgID,
		"status":  statusFilter,
	}

	row := a.db.Replica().QueryRow(ctx, query, args)
	var membership membershipRow
	err := row.Scan(&membership.IsActive)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &membership, nil
}

// findTrustedIPsByAuthMethod returns the parsed trusted IPs for an identity's auth method.
// Exact port of Node.js identityDAL.getTrustedIpsByAuthMethod.
func (a *ApiAuthenticator) findTrustedIPsByAuthMethod(ctx context.Context, identityID uuid.UUID, authMethod auth.IdentityAuthMethod) ([]TrustedIP, error) {
	var tableName string
	switch authMethod {
	case auth.IdentityAuthMethodUniversal:
		tableName = "identity_universal_auths"
	case auth.IdentityAuthMethodKubernetes:
		tableName = "identity_kubernetes_auths"
	case auth.IdentityAuthMethodGCP:
		tableName = "identity_gcp_auths"
	case auth.IdentityAuthMethodAliCloud:
		tableName = "identity_alicloud_auths"
	case auth.IdentityAuthMethodAWS:
		tableName = "identity_aws_auths"
	case auth.IdentityAuthMethodAzure:
		tableName = "identity_azure_auths"
	case auth.IdentityAuthMethodToken:
		tableName = "identity_token_auths"
	case auth.IdentityAuthMethodTLSCert:
		tableName = "identity_tls_cert_auths"
	case auth.IdentityAuthMethodOCI:
		tableName = "identity_oci_auths"
	case auth.IdentityAuthMethodOIDC:
		tableName = "identity_oidc_auths"
	case auth.IdentityAuthMethodJWT:
		tableName = "identity_jwt_auths"
	case auth.IdentityAuthMethodLDAP:
		tableName = "identity_ldap_auths"
	case auth.IdentityAuthMethodSPIFFE:
		tableName = "identity_spiffe_auths"
	default:
		return nil, nil
	}

	query := fmt.Sprintf(`
		SELECT "accessTokenTrustedIps"
		FROM %s
		WHERE "identityId" = @identityID
		LIMIT 1
	`, tableName)

	args := pgx.NamedArgs{"identityID": identityID}

	row := a.db.Replica().QueryRow(ctx, query, args)
	var trustedIPsJSON string
	err := row.Scan(&trustedIPsJSON)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return parseTrustedIPs(trustedIPsJSON)
}

// --- Revocation and Usage Tracking ---

// revocationRow holds the subset of identity_access_token_revocations used by the authenticator.
type revocationRow struct {
	ID        string              `db:"id"`
	RevokedAt sql.Null[time.Time] `db:"revoked_at"`
	CreatedAt time.Time           `db:"created_at"`
}

// assertTokenIsNotRevoked checks if the token or identity has been revoked.
// Port of assertTokenIsNotRevoked in identity-access-token-service.ts:92-120.
func (a *ApiAuthenticator) assertTokenIsNotRevoked(ctx context.Context, tokenID string, identityID uuid.UUID, issuedAtMs int64) error {
	revocations, err := a.findActiveRevocationsForToken(ctx, tokenID, identityID)
	if err != nil {
		return errutil.DatabaseErr("Failed to check token revocation").WithErrf("assertTokenIsNotRevoked(tokenId=%s, identityId=%s): %w", tokenID, identityID, err)
	}

	for _, revocation := range revocations {
		if revocation.ID == tokenID {
			return errutil.Unauthorized("Failed to authorize: token has been revoked").WithErrf("assertTokenIsNotRevoked(tokenId=%s): token revoked", tokenID)
		}

		if revocation.ID == identityID.String() {
			var revokedAtMs int64
			if revocation.RevokedAt.Valid {
				revokedAtMs = revocation.RevokedAt.V.UnixMilli()
			} else {
				revokedAtMs = revocation.CreatedAt.UnixMilli()
			}
			if issuedAtMs < revokedAtMs {
				return errutil.Unauthorized("Failed to authorize: identity tokens have been revoked").WithErrf("assertTokenIsNotRevoked(identityId=%s): identity tokens revoked", identityID)
			}
		}
	}

	return nil
}

// findActiveRevocationsForToken returns active revocations for the token or identity.
// Port of findActiveRevocationsForToken in identity-access-token-revocation-dal.ts:36-56.
func (a *ApiAuthenticator) findActiveRevocationsForToken(ctx context.Context, tokenID string, identityID uuid.UUID) ([]revocationRow, error) {
	query := `
		SELECT id, "revokedAt", "createdAt"
		FROM identity_access_token_revocations
		WHERE "expiresAt" > NOW()
		  AND "identityId" = @identityID
		  AND id IN (@tokenID, @identityIDStr)
	`
	args := pgx.NamedArgs{
		"identityID":    identityID,
		"tokenID":       tokenID,
		"identityIDStr": identityID.String(),
	}

	rows, err := a.db.Replica().Query(ctx, query, args)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var revocations []revocationRow
	for rows.Next() {
		var r revocationRow
		if err := rows.Scan(&r.ID, &r.RevokedAt, &r.CreatedAt); err != nil {
			return nil, err
		}
		revocations = append(revocations, r)
	}
	return revocations, rows.Err()
}

// checkAndDecrementUsesRemaining checks and decrements the usage counter for the token.
// Port of usage tracking logic in fnValidateIdentityAccessTokenFast.
func (a *ApiAuthenticator) checkAndDecrementUsesRemaining(ctx context.Context, identityID uuid.UUID, tokenID string, numUsesLimit int64) error {
	key := identityTokenUsesRemainingKey(identityID.String(), tokenID)

	// Get current usage counter
	usesRemainingRaw, err := a.keyStore.GetItem(ctx, key)
	if err != nil {
		return errutil.DatabaseErr("Failed to check token usage").WithErrf("checkAndDecrementUsesRemaining(identityId=%s, tokenId=%s): %w", identityID, tokenID, err)
	}

	remainingFromState := parseUsesRemaining(usesRemainingRaw)

	// null means unlimited or the Redis counter was lost; <= 0 means exhausted.
	if remainingFromState != nil && *remainingFromState <= 0 {
		return errutil.Unauthorized("Failed to authorize: token usage limit reached").WithErrf("checkAndDecrementUsesRemaining(tokenId=%s): usage limit exhausted", tokenID)
	}

	if remainingFromState == nil {
		// Counter was lost (Redis flush). Re-seed from the JWT's numUsesLimit claim
		// and allow this request; subsequent requests decrement the live counter.
		ttl := time.Duration(maxMachineIdentityTokenAge) * time.Second
		if err := a.keyStore.SetItemWithExpiry(ctx, key, ttl, strconv.FormatInt(numUsesLimit-1, 10)); err != nil {
			return errutil.DatabaseErr("Failed to set token usage counter").WithErrf("checkAndDecrementUsesRemaining(tokenId=%s): %w", tokenID, err)
		}
	} else {
		remaining, err := a.keyStore.IncrementBy(ctx, key, -1)
		if err != nil {
			return errutil.DatabaseErr("Failed to decrement token usage").WithErrf("checkAndDecrementUsesRemaining(tokenId=%s): %w", tokenID, err)
		}
		if remaining < 0 {
			return errutil.Unauthorized("Failed to authorize: token usage limit reached").WithErrf("checkAndDecrementUsesRemaining(tokenId=%s): usage limit exhausted after decrement", tokenID)
		}
	}

	return nil
}

// parseUsesRemaining parses the per-token uses-remaining value from Redis.
// Returns nil when absent or unparseable (treated as "no constraint").
func parseUsesRemaining(raw string) *int64 {
	if raw == "" {
		return nil
	}
	parsed, err := strconv.ParseInt(raw, 10, 64)
	if err != nil {
		return nil
	}
	return &parsed
}

// identityTokenUsesRemainingKey returns the Redis key for tracking token uses.
// Matches Node.js KeyStorePrefixes.IdentityTokenUsesRemaining.
func identityTokenUsesRemainingKey(identityID, tokenID string) string {
	return fmt.Sprintf("identity-token-uses-remaining:%s:%s", identityID, tokenID)
}

// --- Helpers ---

// nullUUIDValid returns true when the nullable UUID is present and non-nil.
func nullUUIDValid(n sql.Null[uuid.UUID]) bool {
	return n.Valid && n.V != uuid.Nil
}

// validateLegacyAccessTokenConstraints checks DB-stored TTL, maxTTL, and usage limits
// for legacy identity access tokens that don't carry these claims in the JWT.
func validateLegacyAccessTokenConstraints(accessToken *identityAccessTokenRow, now time.Time) error {
	// Determine reference time for TTL check: use lastRenewedAt if available, else createdAt.
	referenceTime := accessToken.CreatedAt.V
	if accessToken.AccessTokenLastRenewedAt.Valid {
		referenceTime = accessToken.AccessTokenLastRenewedAt.V
	}

	// Check TTL expiration (time since last renewal/creation).
	if accessToken.AccessTokenTTL > 0 {
		expiresAt := referenceTime.Add(time.Duration(accessToken.AccessTokenTTL) * time.Second)
		if expiresAt.Before(now) {
			return errutil.Unauthorized("Access token TTL expired")
		}
	}

	// Check maxTTL expiration (absolute time since creation).
	if accessToken.AccessTokenMaxTTL > 0 && accessToken.CreatedAt.Valid {
		maxExpiresAt := accessToken.CreatedAt.V.Add(time.Duration(accessToken.AccessTokenMaxTTL) * time.Second)
		if maxExpiresAt.Before(now) {
			return errutil.Unauthorized("Access token max TTL expired")
		}
	}

	// Check usage limit.
	if accessToken.AccessTokenNumUsesLimit > 0 && accessToken.AccessTokenNumUses >= accessToken.AccessTokenNumUsesLimit {
		return errutil.Unauthorized("Access token usage limit reached")
	}

	return nil
}
