package auth

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"goa.design/goa/v3/security"
	"golang.org/x/crypto/bcrypt"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/actor"
)

// AuthHandler implements the Goa-generated authorization interface (JWTAuth method).
// It performs real token validation — an exact port of the Node.js inject-identity logic.
type AuthHandler struct {
	dal        *DAL
	authSecret []byte
}

// NewAuthHandler creates an AuthHandler with real validation backed by a DAL.
func NewAuthHandler(dal *DAL, authSecret string) AuthHandler {
	return AuthHandler{dal: dal, authSecret: []byte(authSecret)}
}

// authFailKey is a context key used to propagate the authoritative auth error
// across Goa's fallback chain. When the token type matches a scheme but validation
// fails, we stash the real error so subsequent scheme attempts return it instead
// of a misleading "not supported" message.
type authFailKey struct{}

// JWTAuth implements the Goa security handler. Goa calls this for each scheme in order
// (jwt → identity_access_token → service_token) with the scheme name in sc.Name.
// We classify the token cheaply and only accept when the token type matches the scheme being tried.
func (h AuthHandler) JWTAuth(ctx context.Context, token string, sc *security.JWTScheme) (context.Context, error) {
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
		identity, err = h.validateJWT(ctx, token)
	case AuthModeIdentityAccessToken:
		// TODO(go): pass real IP address from HTTP layer instead of empty string
		// IP address needs to come from HTTP layer. For now pass empty string
		// (IP check is skipped when ipAddress is empty, matching Node.js: if (ipAddress && trustedIps)).
		identity, err = h.validateIdentityAccessToken(ctx, token, "")
	case AuthModeServiceToken:
		identity, err = h.validateServiceToken(ctx, token)
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

// validateJWT performs real JWT validation.
// Exact port of fnValidateJwtIdentity in auth-token-service.ts:212-285.
func (h AuthHandler) validateJWT(ctx context.Context, token string) (*Identity, error) {
	// 1. Parse and verify JWT signature (HS256).
	claims := &UserJWTClaims{}
	_, err := jwt.ParseWithClaims(token, claims, func(_ *jwt.Token) (any, error) {
		return h.authSecret, nil
	})

	if err != nil {
		return nil, errutil.Unauthorized("Invalid JWT token").WithErrf("validateJWT: %w", err)
	}

	// 2. Validate authTokenType.
	if claims.AuthTokenType != AuthTokenTypeAccessToken {
		return nil, errutil.Unauthorized("You are not allowed to access this resource").WithErrf("validateJWT: invalid authTokenType %s", claims.AuthTokenType)
	}

	// 3. Find session by tokenVersionId + userId.
	sessionID := parseUUID(claims.TokenVersionID)
	userID := parseUUID(claims.UserID)
	session, err := h.dal.FindSessionByIDAndUserID(ctx, sessionID, userID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to validate session").WithErrf("validateJWT(sessionId=%s, userId=%s): %w", sessionID, userID, err)
	}
	if session == nil {
		return nil, errutil.NotFound("Session not found").WithErrf("validateJWT(sessionId=%s, userId=%s): session is nil", sessionID, userID)
	}

	// 4. Check access version.
	if claims.AccessVersion != int(session.AccessVersion) {
		return nil, errutil.Unauthorized("User session is stale, please re-authenticate").WithName("StaleSession").WithErrf("validateJWT(sessionId=%s): access version mismatch claim=%d db=%d", sessionID, claims.AccessVersion, session.AccessVersion)
	}

	// 5. Find user.
	user, err := h.dal.FindUserByID(ctx, session.UserId)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find user").WithErrf("validateJWT(userId=%s): %w", session.UserId, err)
	}
	if user == nil || !user.IsAccepted.V {
		return nil, errutil.NotFound("User with ID '%s' not found", session.UserId).WithErrf("validateJWT: user not found or not accepted")
	}

	// 5a. Check user lock status.
	if user.IsLocked.Valid && user.IsLocked.V {
		return nil, errutil.Unauthorized("Account is locked").WithErrf("validateJWT(userId=%s): user is permanently locked", user.ID)
	}
	if user.TemporaryLockDateEnd.Valid && time.Now().Before(user.TemporaryLockDateEnd.Time) {
		return nil, errutil.Unauthorized("Account is locked").WithErrf("validateJWT(userId=%s): user is temporarily locked", user.ID)
	}

	// 6. Organization scoping.
	var orgID, rootOrgID, parentOrgID uuid.UUID
	var orgName string
	if claims.OrganizationID != "" {
		claimOrgUUID := parseUUID(claims.OrganizationID)
		if claims.SubOrganizationID != "" {
			// 6a. Sub-organization scope.
			subOrgUUID := parseUUID(claims.SubOrganizationID)
			subOrg, err := h.dal.FindOrgByID(ctx, subOrgUUID)
			if err != nil {
				return nil, errutil.DatabaseErr("Failed to find sub-organization").WithErrf("validateJWT(subOrgId=%s): %w", subOrgUUID, err)
			}
			if subOrg == nil {
				return nil, errutil.BadRequest("Sub organization %s not found", claims.SubOrganizationID).WithErrf("validateJWT: sub-organization not found")
			}

			// Verify the sub-org belongs to the token's root organization.
			var subRootOrgID uuid.UUID
			if nullUUIDValid(subOrg.RootOrgId) {
				subRootOrgID = subOrg.RootOrgId.V
			}
			if subRootOrgID != claimOrgUUID && subOrg.ID != claimOrgUUID {
				return nil, errutil.Forbidden("Sub-organization does not belong to the token's organization").WithErrf("validateJWT(subOrgId=%s, claimOrgId=%s): org mismatch", subOrg.ID, claimOrgUUID)
			}

			orgMembership, err := h.dal.FindEffectiveOrgMembership(ctx, actor.TypeUser, user.ID, subOrg.ID, "accepted")
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
			rootOrgID = claimOrgUUID
			if nullUUIDValid(subOrg.ParentOrgId) {
				parentOrgID = subOrg.ParentOrgId.V
			}
		} else {
			// 6b. Regular organization scope.
			org, err := h.dal.FindOrgByID(ctx, claimOrgUUID)
			if err != nil {
				return nil, errutil.DatabaseErr("Failed to find organization").WithErrf("validateJWT(orgId=%s): %w", claimOrgUUID, err)
			}

			orgMembership, err := h.dal.FindEffectiveOrgMembership(ctx, actor.TypeUser, user.ID, claimOrgUUID, "accepted")
			if err != nil {
				return nil, errutil.DatabaseErr("Failed to check org membership").WithErrf("validateJWT(userId=%s, orgId=%s): %w", user.ID, claimOrgUUID, err)
			}
			if orgMembership == nil {
				return nil, errutil.Forbidden("User not member of organization").WithErrf("validateJWT(userId=%s, orgId=%s): no membership found", user.ID, claimOrgUUID)
			}
			if !orgMembership.IsActive {
				return nil, errutil.Forbidden("User organization membership is inactive").WithErrf("validateJWT(userId=%s, orgId=%s): membership inactive", user.ID, claimOrgUUID)
			}

			orgID = claimOrgUUID
			orgName = org.Name
			rootOrgID = claimOrgUUID
			parentOrgID = claimOrgUUID
		}
	}

	// 7. Build identity.
	isSuperAdmin := user.SuperAdmin.Valid && user.SuperAdmin.V
	email := ""
	if user.Email.Valid {
		email = user.Email.String
	}

	username := ""
	if user.Username.Valid {
		username = user.Username.String
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
func (h AuthHandler) validateIdentityAccessToken(ctx context.Context, token, ipAddress string) (*Identity, error) {
	// 1. Parse and verify JWT signature (HS256).
	claims := &IdentityJWTClaims{}
	_, err := jwt.ParseWithClaims(token, claims, func(_ *jwt.Token) (any, error) {
		return h.authSecret, nil
	})
	if err != nil {
		return nil, errutil.Unauthorized("You are not allowed to access this resource").WithErrf("validateIdentityAccessToken: JWT parse failed: %w", err)
	}

	// 2. Validate authTokenType.
	if claims.AuthTokenType != AuthTokenTypeIdentityAccessToken {
		return nil, errutil.Unauthorized("You are not allowed to access this resource").WithErrf("validateIdentityAccessToken: invalid authTokenType %s", claims.AuthTokenType)
	}

	// 3. Find identity access token (joined with identities table).
	accessToken, err := h.dal.FindIdentityAccessTokenByID(ctx, claims.IdentityAccessTokenID)
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
		trustedIPs, err := h.dal.FindTrustedIpsByAuthMethod(ctx, accessToken.IdentityId, accessToken.AuthMethod)
		if err != nil {
			return nil, errutil.DatabaseErr("Failed to find trusted IPs").WithErrf("validateIdentityAccessToken(identityId=%s, authMethod=%s): %w", accessToken.IdentityId, accessToken.AuthMethod, err)
		}
		if trustedIPs != nil {
			if ipErr := checkIPAgainstBlocklist(ipAddress, trustedIPs); ipErr != nil {
				return nil, ipErr
			}
		}
	}

	// 6. Resolve scope org.
	var scopeOrgUUID uuid.UUID
	if nullUUIDValid(accessToken.SubOrganizationId) {
		scopeOrgUUID = accessToken.SubOrganizationId.V
	} else {
		scopeOrgUUID = accessToken.IdentityOrgID
	}

	// 7. Find org.
	org, err := h.dal.FindOrgByID(ctx, scopeOrgUUID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find organization").WithErrf("validateIdentityAccessToken(orgId=%s): %w", scopeOrgUUID, err)
	}
	if org == nil {
		return nil, errutil.NotFound("Organization not found for identity").WithErrf("validateIdentityAccessToken(orgId=%s): org not found", scopeOrgUUID)
	}

	// 8. Resolve org hierarchy.
	orgID, rootOrgID, parentOrgID, orgName := resolveOrgHierarchy(org)

	// 9. Check org membership.
	membership, err := h.dal.FindEffectiveOrgMembership(ctx, actor.TypeIdentity, accessToken.IdentityId, org.ID, "")
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to check org membership").WithErrf("validateIdentityAccessToken(identityId=%s, orgId=%s): %w", accessToken.IdentityId, org.ID, err)
	}
	if membership == nil {
		return nil, errutil.BadRequest("Identity does not belong to this organization").WithErrf("validateIdentityAccessToken(identityId=%s, orgId=%s): no membership found", accessToken.IdentityId, org.ID)
	}

	// 10. Validate usage limit.
	// TODO(go): accessTokenQueue.getIdentityTokenDetailsInCache — read cached usage count instead of DB value
	accessTokenNumUses := accessToken.AccessTokenNumUses
	if accessToken.AccessTokenNumUsesLimit > 0 && accessTokenNumUses > 0 && accessTokenNumUses >= accessToken.AccessTokenNumUsesLimit {
		_ = h.dal.DeleteIdentityAccessTokenByID(ctx, accessToken.ID)
		return nil, errutil.Unauthorized("Unable to renew because access token number of uses limit reached").WithErrf("validateIdentityAccessToken(tokenId=%s): usage limit %d reached", accessToken.ID, accessToken.AccessTokenNumUsesLimit)
	}

	// 11. Validate TTL.
	if accessToken.AccessTokenTTL > 0 {
		var base time.Time
		if accessToken.AccessTokenLastRenewedAt.Valid {
			base = accessToken.AccessTokenLastRenewedAt.Time
		} else if accessToken.CreatedAt.Valid {
			base = accessToken.CreatedAt.Time
		}
		expiry := base.Add(time.Duration(accessToken.AccessTokenTTL) * time.Second)
		if time.Now().After(expiry) {
			_ = h.dal.DeleteIdentityAccessTokenByID(ctx, accessToken.ID)
			return nil, errutil.Unauthorized("Failed to renew MI access token due to TTL expiration").WithErrf("validateIdentityAccessToken(tokenId=%s): TTL expired", accessToken.ID)
		}
	}

	// Validate Max TTL (for non-periodic tokens).
	if accessToken.AccessTokenMaxTTL > 0 && accessToken.AccessTokenPeriod == 0 {
		var createdAt time.Time
		if accessToken.CreatedAt.Valid {
			createdAt = accessToken.CreatedAt.Time
		}
		expirationDate := createdAt.Add(time.Duration(accessToken.AccessTokenMaxTTL) * time.Second)
		if time.Now().After(expirationDate) {
			_ = h.dal.DeleteIdentityAccessTokenByID(ctx, accessToken.ID)
			return nil, errutil.Unauthorized("Failed to renew MI access token due to Max TTL expiration").WithErrf("validateIdentityAccessToken(tokenId=%s): Max TTL expired", accessToken.ID)
		}

		extendToDate := time.Now().Add(time.Duration(accessToken.AccessTokenTTL) * time.Second)
		if extendToDate.After(expirationDate) {
			_ = h.dal.DeleteIdentityAccessTokenByID(ctx, accessToken.ID)
			return nil, errutil.Unauthorized("Failed to renew MI access token past its Max TTL expiration").WithErrf("validateIdentityAccessToken(tokenId=%s): would exceed Max TTL", accessToken.ID)
		}
	}

	// TODO(go): accessTokenQueue.updateIdentityAccessTokenStatus — increment usage counter

	// 12. Build identity auth info (for audit logging).
	identityAuthInfo := &IdentityAuthInfo{
		IdentityID:   accessToken.IdentityId,
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
		ActorID:          accessToken.IdentityId,
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
func (h AuthHandler) validateServiceToken(ctx context.Context, token string) (*Identity, error) {
	// 1. Split token: "st.<tokenID>.<tokenSecret>"
	parts := strings.SplitN(token, ".", 3)
	if len(parts) != 3 || parts[0] != "st" {
		return nil, errutil.Unauthorized("You are not allowed to access this resource").WithErrf("validateServiceToken: invalid token format")
	}
	tokenID := parts[1]
	tokenSecret := parts[2]

	// 2. Find service token.
	serviceToken, err := h.dal.FindServiceTokenByID(ctx, tokenID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find service token").WithErrf("validateServiceToken(tokenId=%s): %w", tokenID, err)
	}
	if serviceToken == nil {
		return nil, errutil.NotFound("Service token with ID '%s' not found", tokenID).WithErrf("validateServiceToken: token not found in DB")
	}

	// 3. Find project.
	project, err := h.dal.FindProjectByID(ctx, serviceToken.ProjectId)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find project").WithErrf("validateServiceToken(projectId=%s): %w", serviceToken.ProjectId, err)
	}
	if project == nil {
		return nil, errutil.NotFound("Project with ID '%s' not found", serviceToken.ProjectId).WithErrf("validateServiceToken: project not found")
	}

	// 4. Check expiration.
	if serviceToken.ExpiresAt.Valid && serviceToken.ExpiresAt.Time.Before(time.Now()) {
		_ = h.dal.DeleteServiceTokenByID(ctx, serviceToken.ID)
		return nil, errutil.Forbidden("Service token has expired").WithErrf("validateServiceToken(tokenId=%s): token expired", serviceToken.ID)
	}

	// 5. Verify secret hash (bcrypt).
	if err := bcrypt.CompareHashAndPassword([]byte(serviceToken.SecretHash), []byte(tokenSecret)); err != nil {
		return nil, errutil.Unauthorized("Invalid service token").WithErrf("validateServiceToken(tokenId=%s): secret hash mismatch", serviceToken.ID)
	}

	// TODO(go): accessTokenQueue.updateServiceTokenStatus — update lastUsed timestamp

	// 6. Find org.
	org, err := h.dal.FindOrgByID(ctx, project.OrgId)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find organization").WithErrf("validateServiceToken(orgId=%s): %w", project.OrgId, err)
	}
	if org == nil {
		return nil, errutil.NotFound("Organization not found for project").WithErrf("validateServiceToken(orgId=%s): org not found", project.OrgId)
	}

	// 7. Build identity.
	orgID, rootOrgID, parentOrgID, orgName := resolveOrgHierarchy(org)
	serviceTokenUUID := parseUUID(serviceToken.ID)
	return &Identity{
		AuthMode:    AuthModeServiceToken,
		Actor:       actor.TypeService,
		ActorID:     serviceTokenUUID,
		OrgID:       orgID,
		RootOrgID:   rootOrgID,
		ParentOrgID: parentOrgID,
		OrgName:     orgName,
		Name:        serviceToken.Name,
	}, nil
}

// resolveOrgHierarchy extracts orgID, rootOrgID, parentOrgID, and orgName from an OrgRow.
func resolveOrgHierarchy(org *OrgRow) (orgID, rootOrgID, parentOrgID uuid.UUID, orgName string) {
	orgID = org.ID
	orgName = org.Name
	rootOrgID = orgID
	parentOrgID = orgID
	if nullUUIDValid(org.RootOrgId) {
		rootOrgID = org.RootOrgId.V
	}
	if nullUUIDValid(org.ParentOrgId) {
		parentOrgID = org.ParentOrgId.V
	}
	return
}
