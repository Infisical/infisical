package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"goa.design/goa/v3/security"
	"golang.org/x/crypto/bcrypt"

	"github.com/infisical/api/internal/database/pg"
	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/actor"
)

// Authenticator implements the Goa-generated authorization interface (JWTAuth method).
// It performs real token validation — an exact port of the Node.js inject-identity logic.
type Authenticator struct {
	db         pg.DB
	authSecret []byte
}

// NewAuthenticator creates an Authenticator with real validation backed by pg.DB.
func NewAuthenticator(db pg.DB, authSecret string) Authenticator {
	return Authenticator{db: db, authSecret: []byte(authSecret)}
}

// authFailKey is a context key used to propagate the authoritative auth error
// across Goa's fallback chain. When the token type matches a scheme but validation
// fails, we stash the real error so subsequent scheme attempts return it instead
// of a misleading "not supported" message.
type authFailKey struct{}

// JWTAuth implements the Goa security handler. Goa calls this for each scheme in order
// (jwt → identity_access_token → service_token) with the scheme name in sc.Name.
// We classify the token cheaply and only accept when the token type matches the scheme being tried.
func (a Authenticator) JWTAuth(ctx context.Context, token string, sc *security.JWTScheme) (context.Context, error) {
	// If a previous scheme already matched the token and failed, return that error.
	if prevErr, ok := ctx.Value(authFailKey{}).(error); ok {
		return ctx, prevErr
	}

	if token == "" {
		return ctx, errutil.Unauthorized("Token missing").WithErrf("JWTAuth: token is empty")
	}

	tokenMode := ClassifyToken(token)
	if tokenMode == "" {
		return ctx, errutil.Unauthorized("You are not allowed to access this resource").WithErr(errors.New("token classification failed"))
	}

	// Map scheme name to expected auth mode.
	var expectedMode AuthMode
	switch sc.Name {
	case "jwt":
		expectedMode = AuthModeJWT
	case "identity_access_token":
		expectedMode = AuthModeIdentityAccessToken
	case "service_token":
		expectedMode = AuthModeServiceToken
	default:
		return ctx, errutil.Unauthorized("You are not allowed to access this resource").WithErr(errors.New("invalid token"))
	}

	// Fast reject: token type doesn't match the scheme being tried.
	if tokenMode != expectedMode {
		return ctx, errutil.Unauthorized("You are not allowed to access this resource").WithErrf("provider token %v not supported", tokenMode)
	}

	var (
		identity *Identity
		err      error
	)
	switch expectedMode {
	case AuthModeJWT:
		identity, err = a.validateJWT(ctx, token)
	case AuthModeIdentityAccessToken:
		// TODO(go): pass real IP address from HTTP layer instead of empty string
		// IP address needs to come from HTTP layer. For now pass empty string
		// (IP check is skipped when ipAddress is empty, matching Node.js: if (ipAddress && trustedIps)).
		identity, err = a.validateIdentityAccessToken(ctx, token, "")
	case AuthModeServiceToken:
		identity, err = a.validateServiceToken(ctx, token)
	}

	if err != nil {
		// Token matched this scheme but validation failed — this is the authoritative error.
		// Stash it in context so subsequent scheme attempts return it directly.
		ctx = context.WithValue(ctx, authFailKey{}, err)
		return ctx, err
	}

	// Populate HTTP layer fields from context (set by HTTPInfoMiddleware).
	if httpInfo := HTTPInfoFromContext(ctx); httpInfo != nil {
		identity.IPAddress = httpInfo.IPAddress
		identity.UserAgent = httpInfo.UserAgent
		identity.UserAgentType = httpInfo.UserAgentType
	}

	return WithIdentity(ctx, identity), nil
}

// TODO(gov0): Missing test
// validateJWT performs real JWT validation.
// Exact port of fnValidateJwtIdentity in auth-token-service.ts:212-285.
func (a Authenticator) validateJWT(ctx context.Context, token string) (*Identity, error) {
	// 1. Parse and verify JWT signature (HS256).
	claims := &UserJWTClaims{}
	_, err := jwt.ParseWithClaims(token, claims, func(_ *jwt.Token) (any, error) {
		return a.authSecret, nil
	})

	if err != nil {
		return nil, errutil.Unauthorized("Invalid JWT token").WithErrf("validateJWT: %w", err)
	}

	// 2. Validate authTokenType.
	if claims.AuthTokenType != AuthTokenTypeAccessToken {
		return nil, errutil.Unauthorized("You are not allowed to access this resource").WithErrf("validateJWT: invalid authTokenType %s", claims.AuthTokenType)
	}

	// 3. Find session by tokenVersionId + userId.
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

			orgMembership, err := a.findEffectiveOrgMembership(ctx, actor.TypeUser, user.ID, subOrg.ID, "accepted")
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

			orgMembership, err := a.findEffectiveOrgMembership(ctx, actor.TypeUser, user.ID, claims.OrganizationID, "accepted")
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

	return &Identity{
		AuthMode:      AuthModeJWT,
		Actor:         actor.TypeUser,
		ActorID:       user.ID,
		OrgID:         orgID,
		RootOrgID:     rootOrgID,
		ParentOrgID:   parentOrgID,
		OrgName:       orgName,
		AuthMethod:    actor.AuthMethod(claims.AuthMethod),
		IsSuperAdmin:  isSuperAdmin,
		IsMfaVerified: claims.IsMfaVerified,
		MfaMethod:     claims.MfaMethod,
		UserAuthInfo: &UserAuthInfo{
			UserID: user.ID,
			Email:  email,
		},
		Email:    email,
		Username: username,
	}, nil
}

// validateIdentityAccessToken performs real identity access token validation.
// Exact port of fnValidateIdentityAccessToken in identity-access-token-service.ts:185-239.
func (a Authenticator) validateIdentityAccessToken(ctx context.Context, token, ipAddress string) (*Identity, error) {
	// 1. Parse and verify JWT signature (HS256).
	claims := &IdentityJWTClaims{}
	_, err := jwt.ParseWithClaims(token, claims, func(_ *jwt.Token) (any, error) {
		return a.authSecret, nil
	})
	if err != nil {
		return nil, errutil.Unauthorized("You are not allowed to access this resource").WithErrf("validateIdentityAccessToken: JWT parse failed: %w", err)
	}

	// 2. Validate authTokenType.
	if claims.AuthTokenType != AuthTokenTypeIdentityAccessToken {
		return nil, errutil.Unauthorized("You are not allowed to access this resource").WithErrf("validateIdentityAccessToken: invalid authTokenType %s", claims.AuthTokenType)
	}

	// 3. Find identity access token (joined with identities table).
	accessToken, err := a.findIdentityAccessTokenByID(ctx, claims.IdentityAccessTokenID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find identity access token").WithErrf("validateIdentityAccessToken(tokenId=%s): %w", claims.IdentityAccessTokenID, err)
	}
	if accessToken == nil {
		return nil, errutil.Unauthorized("No identity access token found").WithErrf("validateIdentityAccessToken(tokenId=%s): token not found in DB", claims.IdentityAccessTokenID)
	}

	// 4. Belt-and-suspenders revocation check.
	if accessToken.IsAccessTokenRevoked {
		return nil, errutil.Unauthorized("Failed to authorize revoked access token, access token is revoked").WithErrf("validateIdentityAccessToken(tokenId=%s): token is revoked", accessToken.ID)
	}

	// 5. IP check.
	// TODO(go): this requires passing the real IP address from the HTTP layer. For now, IP check is skipped when ipAddress is empty, matching Node.js: if (ipAddress && trustedIps).
	if ipAddress != "" {
		trustedIPs, err := a.findTrustedIPsByAuthMethod(ctx, accessToken.IdentityID, accessToken.AuthMethod)
		if err != nil {
			return nil, errutil.DatabaseErr("Failed to find trusted IPs").WithErrf("validateIdentityAccessToken(identityId=%s, authMethod=%s): %w", accessToken.IdentityID, accessToken.AuthMethod, err)
		}
		if trustedIPs != nil {
			if ipErr := checkIPAgainstBlocklist(ipAddress, trustedIPs); ipErr != nil {
				return nil, ipErr
			}
		}
	}

	// 6. Resolve scope org.
	var scopeOrgUUID uuid.UUID
	if nullUUIDValid(accessToken.SubOrganizationID) {
		scopeOrgUUID = accessToken.SubOrganizationID.V
	} else {
		scopeOrgUUID = accessToken.IdentityOrgID
	}

	// 7. Find org.
	org, err := a.findOrgByID(ctx, scopeOrgUUID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find organization").WithErrf("validateIdentityAccessToken(orgId=%s): %w", scopeOrgUUID, err)
	}
	if org == nil {
		return nil, errutil.NotFound("Organization not found for identity").WithErrf("validateIdentityAccessToken(orgId=%s): org not found", scopeOrgUUID)
	}

	// 8. Resolve org hierarchy.
	orgID, rootOrgID, parentOrgID, orgName := resolveOrgHierarchy(org)

	// 9. Check org membership.
	membership, err := a.findEffectiveOrgMembership(ctx, actor.TypeIdentity, accessToken.IdentityID, org.ID, "")
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to check org membership").WithErrf("validateIdentityAccessToken(identityId=%s, orgId=%s): %w", accessToken.IdentityID, org.ID, err)
	}
	if membership == nil {
		return nil, errutil.BadRequest("Identity does not belong to this organization").WithErrf("validateIdentityAccessToken(identityId=%s, orgId=%s): no membership found", accessToken.IdentityID, org.ID)
	}

	// 10. Validate usage limit.
	// TODO(go): accessTokenQueue.getIdentityTokenDetailsInCache — read cached usage count instead of DB value
	accessTokenNumUses := accessToken.AccessTokenNumUses
	if accessToken.AccessTokenNumUsesLimit > 0 && accessTokenNumUses > 0 && accessTokenNumUses >= accessToken.AccessTokenNumUsesLimit {
		_ = a.deleteIdentityAccessTokenByID(ctx, accessToken.ID)
		return nil, errutil.Unauthorized("Unable to renew because access token number of uses limit reached").WithErrf("validateIdentityAccessToken(tokenId=%s): usage limit %d reached", accessToken.ID, accessToken.AccessTokenNumUsesLimit)
	}

	// 11. Validate TTL.
	if accessToken.AccessTokenTTL > 0 {
		var base time.Time
		if accessToken.AccessTokenLastRenewedAt.Valid {
			base = accessToken.AccessTokenLastRenewedAt.V
		} else if accessToken.CreatedAt.Valid {
			base = accessToken.CreatedAt.V
		}
		expiry := base.Add(time.Duration(accessToken.AccessTokenTTL) * time.Second)
		if time.Now().After(expiry) {
			_ = a.deleteIdentityAccessTokenByID(ctx, accessToken.ID)
			return nil, errutil.Unauthorized("Failed to renew MI access token due to TTL expiration").WithErrf("validateIdentityAccessToken(tokenId=%s): TTL expired", accessToken.ID)
		}
	}

	// Validate Max TTL (for non-periodic tokens).
	if accessToken.AccessTokenMaxTTL > 0 && accessToken.AccessTokenPeriod == 0 {
		var createdAt time.Time
		if accessToken.CreatedAt.Valid {
			createdAt = accessToken.CreatedAt.V
		}
		expirationDate := createdAt.Add(time.Duration(accessToken.AccessTokenMaxTTL) * time.Second)
		if time.Now().After(expirationDate) {
			_ = a.deleteIdentityAccessTokenByID(ctx, accessToken.ID)
			return nil, errutil.Unauthorized("Failed to renew MI access token due to Max TTL expiration").WithErrf("validateIdentityAccessToken(tokenId=%s): Max TTL expired", accessToken.ID)
		}

		extendToDate := time.Now().Add(time.Duration(accessToken.AccessTokenTTL) * time.Second)
		if extendToDate.After(expirationDate) {
			_ = a.deleteIdentityAccessTokenByID(ctx, accessToken.ID)
			return nil, errutil.Unauthorized("Failed to renew MI access token past its Max TTL expiration").WithErrf("validateIdentityAccessToken(tokenId=%s): would exceed Max TTL", accessToken.ID)
		}
	}

	// TODO(go): accessTokenQueue.updateIdentityAccessTokenStatus — increment usage counter

	// 12. Build identity auth info (for audit logging).
	identityAuthInfo := &IdentityAuthInfo{
		IdentityID:   accessToken.IdentityID,
		IdentityName: accessToken.IdentityName,
		AuthMethod:   accessToken.AuthMethod,
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

	// 13. Build identity.
	return &Identity{
		AuthMode:         AuthModeIdentityAccessToken,
		Actor:            actor.TypeIdentity,
		ActorID:          accessToken.IdentityID,
		OrgID:            orgID,
		RootOrgID:        rootOrgID,
		ParentOrgID:      parentOrgID,
		OrgName:          orgName,
		AuthMethod:       actor.AuthMethod(accessToken.AuthMethod),
		IdentityAuthInfo: identityAuthInfo,
		Name:             accessToken.IdentityName,
	}, nil
}

// validateServiceToken performs real service token validation.
// Exact port of fnValidateServiceToken in service-token-service.ts:172-199.
func (a Authenticator) validateServiceToken(ctx context.Context, token string) (*Identity, error) {
	// 1. Split token: "st.<tokenID>.<tokenSecret>"
	parts := strings.SplitN(token, ".", 3)
	if len(parts) != 3 || parts[0] != "st" {
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
		_ = a.deleteServiceTokenByID(ctx, serviceToken.ID)
		return nil, errutil.Forbidden("Service token has expired").WithErrf("validateServiceToken(tokenId=%s): token expired", serviceToken.ID)
	}

	// 5. Verify secret hash (bcrypt).
	if err := bcrypt.CompareHashAndPassword([]byte(serviceToken.SecretHash), []byte(tokenSecret)); err != nil {
		return nil, errutil.Unauthorized("Invalid service token").WithErrf("validateServiceToken(tokenId=%s): secret hash mismatch", serviceToken.ID)
	}

	// TODO(go): accessTokenQueue.updateServiceTokenStatus — update lastUsed timestamp

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
	return &Identity{
		AuthMode:    AuthModeServiceToken,
		Actor:       actor.TypeService,
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
	ID                       uuid.UUID                `db:"id"`
	AccessTokenTTL           int64                    `db:"access_token_ttl"`
	AccessTokenMaxTTL        int64                    `db:"access_token_max_ttl"`
	AccessTokenNumUses       int64                    `db:"access_token_num_uses"`
	AccessTokenNumUsesLimit  int64                    `db:"access_token_num_uses_limit"`
	AccessTokenLastRenewedAt sql.Null[time.Time]      `db:"access_token_last_renewed_at"`
	IsAccessTokenRevoked     bool                     `db:"is_access_token_revoked"`
	IdentityID               uuid.UUID                `db:"identity_id"`
	CreatedAt                sql.Null[time.Time]      `db:"created_at"`
	AuthMethod               actor.IdentityAuthMethod `db:"auth_method"`
	AccessTokenPeriod        int64                    `db:"access_token_period"`
	SubOrganizationID        sql.Null[uuid.UUID]      `db:"sub_organization_id"`
	IdentityOrgID            uuid.UUID                `db:"identity_org_id"`
	IdentityName             string                   `db:"identity_name"`
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
func (a Authenticator) findSessionByIDAndUserID(ctx context.Context, sessionID, userID uuid.UUID) (*sessionRow, error) {
	query := `
		SELECT access_version, user_id
		FROM auth_token_sessions
		WHERE id = @sessionID AND user_id = @userID
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
func (a Authenticator) findUserByID(ctx context.Context, id uuid.UUID) (*userRow, error) {
	query := `
		SELECT id, email, username, is_accepted, super_admin, is_locked, temporary_lock_date_end
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
func (a Authenticator) findOrgByID(ctx context.Context, id uuid.UUID) (*orgRow, error) {
	query := `
		SELECT id, name, root_org_id, parent_org_id
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
func (a Authenticator) findProjectByID(ctx context.Context, id string) (*projectRow, error) {
	query := `
		SELECT org_id
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

// findIdentityAccessTokenByID returns the token (joined with identity) if not revoked, or nil.
func (a Authenticator) findIdentityAccessTokenByID(ctx context.Context, id string) (*identityAccessTokenRow, error) {
	query := `
		SELECT
			iat.id,
			iat.access_token_ttl,
			iat.access_token_max_ttl,
			iat.access_token_num_uses,
			iat.access_token_num_uses_limit,
			iat.access_token_last_renewed_at,
			iat.is_access_token_revoked,
			iat.identity_id,
			iat.created_at,
			iat.auth_method,
			iat.access_token_period,
			iat.sub_organization_id,
			i.org_id AS identity_org_id,
			i.name AS identity_name
		FROM identity_access_tokens iat
		INNER JOIN identities i ON iat.identity_id = i.id
		WHERE iat.id = @id AND iat.is_access_token_revoked = false
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

// deleteIdentityAccessTokenByID deletes the token on primary. Used for expired/exceeded tokens.
func (a Authenticator) deleteIdentityAccessTokenByID(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM identity_access_tokens WHERE id = @id`
	args := pgx.NamedArgs{"id": id}
	_, err := a.db.Primary().Exec(ctx, query, args)
	return err
}

// findServiceTokenByID returns the service token matching id, or nil.
func (a Authenticator) findServiceTokenByID(ctx context.Context, id string) (*serviceTokenRow, error) {
	query := `
		SELECT id, name, project_id, expires_at, secret_hash
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
func (a Authenticator) deleteServiceTokenByID(ctx context.Context, id uuid.UUID) error {
	query := `DELETE FROM service_tokens WHERE id = @id`
	args := pgx.NamedArgs{"id": id}
	_, err := a.db.Primary().Exec(ctx, query, args)
	return err
}

// findEffectiveOrgMembership returns the first effective org membership for an actor (user or identity),
// including direct membership and membership via groups.
// Exact port of Node.js orgDAL.findEffectiveOrgMembership.
func (a Authenticator) findEffectiveOrgMembership(ctx context.Context, actorType actor.Type, actorID, orgID uuid.UUID, filterStatus string) (*membershipRow, error) {
	var actorCondition string
	if actorType == actor.TypeUser {
		actorCondition = `(
			m.actor_user_id = @actorID
			OR m.actor_group_id IN (
				SELECT g.id FROM groups g
				INNER JOIN user_group_membership ugm ON ugm.group_id = g.id
				WHERE ugm.user_id = @actorID
			)
		)`
	} else {
		actorCondition = `(
			m.actor_identity_id = @actorID
			OR m.actor_group_id IN (
				SELECT g.id FROM groups g
				INNER JOIN identity_group_membership igm ON igm.group_id = g.id
				WHERE igm.identity_id = @actorID
			)
		)`
	}

	statusFilter := "accepted"
	if filterStatus != "" {
		statusFilter = filterStatus
	}

	query := fmt.Sprintf(`
		SELECT m.is_active
		FROM memberships m
		WHERE m.scope = 'organization'
		  AND m.scope_org_id = @orgID
		  AND %s
		  AND (m.status = @status OR m.status IS NULL)
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
func (a Authenticator) findTrustedIPsByAuthMethod(ctx context.Context, identityID uuid.UUID, authMethod actor.IdentityAuthMethod) ([]TrustedIP, error) {
	var tableName string
	switch authMethod {
	case actor.IdentityAuthMethodUniversal:
		tableName = "identity_universal_auths"
	case actor.IdentityAuthMethodKubernetes:
		tableName = "identity_kubernetes_auths"
	case actor.IdentityAuthMethodGCP:
		tableName = "identity_gcp_auths"
	case actor.IdentityAuthMethodAliCloud:
		tableName = "identity_alicloud_auths"
	case actor.IdentityAuthMethodAWS:
		tableName = "identity_aws_auths"
	case actor.IdentityAuthMethodAzure:
		tableName = "identity_azure_auths"
	case actor.IdentityAuthMethodToken:
		tableName = "identity_token_auths"
	case actor.IdentityAuthMethodTLSCert:
		tableName = "identity_tls_cert_auths"
	case actor.IdentityAuthMethodOCI:
		tableName = "identity_oci_auths"
	case actor.IdentityAuthMethodOIDC:
		tableName = "identity_oidc_auths"
	case actor.IdentityAuthMethodJWT:
		tableName = "identity_jwt_auths"
	case actor.IdentityAuthMethodLDAP:
		tableName = "identity_ldap_auths"
	case actor.IdentityAuthMethodSPIFFE:
		tableName = "identity_spiffe_auths"
	default:
		return nil, nil
	}

	query := fmt.Sprintf(`
		SELECT access_token_trusted_ips
		FROM %s
		WHERE identity_id = @identityID
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

// --- Helpers ---

// parseUUID parses a string to uuid.UUID. Returns uuid.Nil on failure.
func parseUUID(s string) uuid.UUID {
	id, _ := uuid.Parse(s)
	return id
}

// nullUUIDValid returns true when the nullable UUID is present and non-nil.
func nullUUIDValid(n sql.Null[uuid.UUID]) bool {
	return n.Valid && n.V != uuid.Nil
}
