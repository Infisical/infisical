package auth

import (
	"context"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"goa.design/goa/v3/security"
	"golang.org/x/crypto/bcrypt"

	"github.com/infisical/api/internal/libs/errutil"
	"github.com/infisical/api/internal/services/shared/permission"
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

// JWTAuth implements the Goa security handler. Goa calls this for each scheme in order
// (jwt → identity_access_token → service_token) with the scheme name in sc.Name.
// We classify the token cheaply and only accept when the token type matches the scheme being tried.
func (h AuthHandler) JWTAuth(ctx context.Context, token string, sc *security.JWTScheme) (context.Context, error) {
	if token == "" {
		return ctx, errutil.Unauthorized("Token missing")
	}

	tokenMode := ClassifyToken(token)
	if tokenMode == "" {
		return ctx, errutil.Unauthorized("You are not allowed to access this resource")
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
		return ctx, errutil.Unauthorized("You are not allowed to access this resource")
	}

	// Fast reject: token type doesn't match the scheme being tried.
	if tokenMode != expectedMode {
		return ctx, errutil.Unauthorized("You are not allowed to access this resource")
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
		return ctx, err
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
		return nil, errutil.Unauthorized("Invalid JWT token")
	}

	// 2. Validate authTokenType.
	if claims.AuthTokenType != "AccessToken" {
		return nil, errutil.Unauthorized("You are not allowed to access this resource")
	}

	// 3. Find session by tokenVersionId + userId.
	sessionID := parseUUID(claims.TokenVersionID)
	userID := parseUUID(claims.UserID)
	session, err := h.dal.FindSessionByIDAndUserID(ctx, sessionID, userID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to validate session").WithErr(err)
	}
	if session == nil {
		return nil, errutil.NotFound("Session not found")
	}

	// 4. Check access version.
	if claims.AccessVersion != int(session.AccessVersion) {
		return nil, errutil.Unauthorized("User session is stale, please re-authenticate").WithName("StaleSession")
	}

	// 5. Find user.
	user, err := h.dal.FindUserByID(ctx, session.UserId)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find user").WithErr(err)
	}
	if user == nil || !user.IsAccepted.V {
		return nil, errutil.NotFound("User with ID '%s' not found", session.UserId)
	}

	// 6. Organization scoping.
	var orgID, rootOrgID, parentOrgID string
	if claims.OrganizationID != "" {
		if claims.SubOrganizationID != "" {
			// 6a. Sub-organization scope.
			subOrgUUID := parseUUID(claims.SubOrganizationID)
			subOrg, err := h.dal.FindOrgByID(ctx, subOrgUUID)
			if err != nil {
				return nil, errutil.DatabaseErr("Failed to find sub-organization").WithErr(err)
			}
			if subOrg == nil {
				return nil, errutil.BadRequest("Sub organization %s not found", claims.SubOrganizationID)
			}

			// Verify the sub-org belongs to the token's root organization.
			subRootOrgID := ""
			if nullUUIDValid(subOrg.RootOrgId) {
				subRootOrgID = subOrg.RootOrgId.V.String()
			}
			if subRootOrgID != claims.OrganizationID && subOrg.ID.String() != claims.OrganizationID {
				return nil, errutil.Forbidden("Sub-organization does not belong to the token's organization")
			}

			orgMembership, err := h.dal.FindEffectiveOrgMembership(ctx, permission.ActorTypeUser, user.ID, subOrg.ID, "accepted")
			if err != nil {
				return nil, errutil.DatabaseErr("Failed to check org membership").WithErr(err)
			}
			if orgMembership == nil {
				return nil, errutil.Forbidden("User not member of organization")
			}
			if !orgMembership.IsActive {
				return nil, errutil.Forbidden("User organization membership is inactive")
			}

			orgID = subOrg.ID.String()
			rootOrgID = claims.OrganizationID
			if nullUUIDValid(subOrg.ParentOrgId) {
				parentOrgID = subOrg.ParentOrgId.V.String()
			}
		} else {
			// 6b. Regular organization scope.
			claimOrgUUID := parseUUID(claims.OrganizationID)
			_, err := h.dal.FindOrgByID(ctx, claimOrgUUID)
			if err != nil {
				return nil, errutil.DatabaseErr("Failed to find organization").WithErr(err)
			}

			orgMembership, err := h.dal.FindEffectiveOrgMembership(ctx, permission.ActorTypeUser, user.ID, claimOrgUUID, "accepted")
			if err != nil {
				return nil, errutil.DatabaseErr("Failed to check org membership").WithErr(err)
			}
			if orgMembership == nil {
				return nil, errutil.Forbidden("User not member of organization")
			}
			if !orgMembership.IsActive {
				return nil, errutil.Forbidden("User organization membership is inactive")
			}

			orgID = claims.OrganizationID
			rootOrgID = claims.OrganizationID
			parentOrgID = claims.OrganizationID
		}
	}

	// 7. Build identity.
	isSuperAdmin := user.SuperAdmin.Valid && user.SuperAdmin.V
	email := ""
	if user.Email.Valid {
		email = user.Email.String
	}

	return &Identity{
		AuthMode:     AuthModeJWT,
		Actor:        permission.ActorTypeUser,
		ActorID:      user.ID.String(),
		OrgID:        orgID,
		RootOrgID:    rootOrgID,
		ParentOrgID:  parentOrgID,
		AuthMethod:   permission.ActorAuthMethod(claims.AuthMethod),
		IsSuperAdmin: isSuperAdmin,
		UserAuthInfo: &UserAuthInfo{
			UserID: user.ID.String(),
			Email:  email,
		},
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
		return nil, errutil.Unauthorized("You are not allowed to access this resource")
	}

	// 2. Validate authTokenType.
	if claims.AuthTokenType != "IdentityAccessToken" {
		return nil, errutil.Unauthorized("You are not allowed to access this resource")
	}

	// 3. Find identity access token (joined with identities table).
	accessToken, err := h.dal.FindIdentityAccessTokenByID(ctx, claims.IdentityAccessTokenID)
	if err != nil {
		return nil, errutil.DatabaseErr("Failed to find identity access token").WithErr(err)
	}
	if accessToken == nil {
		return nil, errutil.Unauthorized("No identity access token found")
	}

	// 4. Belt-and-suspenders revocation check.
	if accessToken.IsAccessTokenRevoked {
		return nil, errutil.Unauthorized("Failed to authorize revoked access token, access token is revoked")
	}

	// 5. IP check.
	// TODO(go): this requires passing the real IP address from the HTTP layer. For now, IP check is skipped when ipAddress is empty, matching Node.js: if (ipAddress && trustedIps).
	if ipAddress != "" {
		trustedIPs, err := h.dal.FindTrustedIpsByAuthMethod(ctx, accessToken.IdentityId, accessToken.AuthMethod)
		if err != nil {
			return nil, errutil.InternalServer("Failed to find trusted IPs")
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
		return nil, errutil.DatabaseErr("Failed to find organization").WithErr(err)
	}
	if org == nil {
		return nil, errutil.InternalServer("Organization not found for identity")
	}

	// 8. Resolve org hierarchy.
	orgID, rootOrgID, parentOrgID := resolveOrgHierarchy(org)

	// 9. Check org membership.
	membership, err := h.dal.FindEffectiveOrgMembership(ctx, permission.ActorTypeIdentity, accessToken.IdentityId, org.ID, "")
	if err != nil {
		return nil, errutil.InternalServer("Failed to check org membership")
	}
	if membership == nil {
		return nil, errutil.BadRequest("Identity does not belong to this organization")
	}

	// 10. Validate usage limit.
	// TODO(go): accessTokenQueue.getIdentityTokenDetailsInCache — read cached usage count instead of DB value
	accessTokenNumUses := accessToken.AccessTokenNumUses
	if accessToken.AccessTokenNumUsesLimit > 0 && accessTokenNumUses > 0 && accessTokenNumUses >= accessToken.AccessTokenNumUsesLimit {
		_ = h.dal.DeleteIdentityAccessTokenByID(ctx, accessToken.ID)
		return nil, errutil.Unauthorized("Unable to renew because access token number of uses limit reached")
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
			return nil, errutil.Unauthorized("Failed to renew MI access token due to TTL expiration")
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
			return nil, errutil.Unauthorized("Failed to renew MI access token due to Max TTL expiration")
		}

		extendToDate := time.Now().Add(time.Duration(accessToken.AccessTokenTTL) * time.Second)
		if extendToDate.After(expirationDate) {
			_ = h.dal.DeleteIdentityAccessTokenByID(ctx, accessToken.ID)
			return nil, errutil.Unauthorized("Failed to renew MI access token past its Max TTL expiration")
		}
	}

	// TODO(go): accessTokenQueue.updateIdentityAccessTokenStatus — increment usage counter

	// 12. Build identity auth info (for audit logging).
	identityAuthInfo := &IdentityAuthInfo{
		IdentityID:   accessToken.IdentityId.String(),
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
		Actor:            permission.ActorTypeIdentity,
		ActorID:          accessToken.IdentityId.String(),
		OrgID:            orgID,
		RootOrgID:        rootOrgID,
		ParentOrgID:      parentOrgID,
		AuthMethod:       permission.ActorAuthMethod(accessToken.AuthMethod),
		IdentityAuthInfo: identityAuthInfo,
	}, nil
}

// validateServiceToken performs real service token validation.
// Exact port of fnValidateServiceToken in service-token-service.ts:172-199.
func (h AuthHandler) validateServiceToken(ctx context.Context, token string) (*Identity, error) {
	// 1. Split token: "st.<tokenID>.<tokenSecret>"
	parts := strings.SplitN(token, ".", 3)
	if len(parts) != 3 || parts[0] != "st" {
		return nil, errutil.Unauthorized("You are not allowed to access this resource")
	}
	tokenID := parts[1]
	tokenSecret := parts[2]

	// 2. Find service token.
	serviceToken, err := h.dal.FindServiceTokenByID(ctx, tokenID)
	if err != nil {
		return nil, errutil.InternalServer("Failed to find service token")
	}
	if serviceToken == nil {
		return nil, errutil.NotFound("Service token with ID '%s' not found", tokenID)
	}

	// 3. Find project.
	project, err := h.dal.FindProjectByID(ctx, serviceToken.ProjectId)
	if err != nil {
		return nil, errutil.InternalServer("Failed to find project")
	}
	if project == nil {
		return nil, errutil.NotFound("Project with ID '%s' not found", serviceToken.ProjectId)
	}

	// 4. Check expiration.
	if serviceToken.ExpiresAt.Valid && serviceToken.ExpiresAt.Time.Before(time.Now()) {
		_ = h.dal.DeleteServiceTokenByID(ctx, serviceToken.ID)
		return nil, errutil.Forbidden("Service token has expired")
	}

	// 5. Verify secret hash (bcrypt).
	if err := bcrypt.CompareHashAndPassword([]byte(serviceToken.SecretHash), []byte(tokenSecret)); err != nil {
		return nil, errutil.Unauthorized("Invalid service token")
	}

	// TODO(go): accessTokenQueue.updateServiceTokenStatus — update lastUsed timestamp

	// 6. Find org.
	org, err := h.dal.FindOrgByID(ctx, project.OrgId)
	if err != nil {
		return nil, errutil.InternalServer("Failed to find organization")
	}
	if org == nil {
		return nil, errutil.InternalServer("Organization not found for project")
	}

	// 7. Build identity.
	orgID, rootOrgID, parentOrgID := resolveOrgHierarchy(org)
	return &Identity{
		AuthMode:    AuthModeServiceToken,
		Actor:       permission.ActorTypeService,
		ActorID:     serviceToken.ID,
		OrgID:       orgID,
		RootOrgID:   rootOrgID,
		ParentOrgID: parentOrgID,
	}, nil
}

// resolveOrgHierarchy extracts orgID, rootOrgID, and parentOrgID from an OrgRow.
func resolveOrgHierarchy(org *OrgRow) (orgID, rootOrgID, parentOrgID string) {
	orgID = org.ID.String()
	rootOrgID = orgID
	parentOrgID = orgID
	if nullUUIDValid(org.RootOrgId) {
		rootOrgID = org.RootOrgId.V.String()
	}
	if nullUUIDValid(org.ParentOrgId) {
		parentOrgID = org.ParentOrgId.V.String()
	}
	return
}
