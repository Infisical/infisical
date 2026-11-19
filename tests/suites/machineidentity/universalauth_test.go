package machineidentity_test

import (
	"context"
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/harness/infisical"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

func TestUniversalAuth_Login(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an unknown client id and a wrong secret with the same invalid credentials answer", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{})
		anon := tn.Anonymous(t)

		// Action
		unknown := uaLogin(t, anon, uuid.NewString(), ua.ClientSecret, tn.OrgSlug)
		wrong := uaLogin(t, anon, ua.ClientID, "not-the-secret", tn.OrgSlug)

		// Assert
		requireStatus(t, http.StatusUnauthorized, unknown.StatusCode(), unknown.Body)
		requireStatus(t, http.StatusUnauthorized, wrong.StatusCode(), wrong.Body)
		require.Equal(t, "Invalid credentials", apierr.Message(unknown.Body))
		require.Equal(t, "Invalid credentials", apierr.Message(wrong.Body))
	})

	t.Run("should refuse a login from outside the client secret trusted IPs and issue no token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		trusted := sourceIP()
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{ClientSecretTrustedIps: ips(trusted + "/32")})

		// Action
		res := uaLogin(t, tn.Anonymous(t, infisical.ForwardedFor(sourceIP())), ua.ClientID, ua.ClientSecret, tn.OrgSlug)

		// Assert
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Nil(t, res.JSON200)
		require.Zero(t, secretUses(t, tn, ua.ID, ua.SecretID))
		inside := uaLogin(t, tn.Anonymous(t, infisical.ForwardedFor(trusted)), ua.ClientID, ua.ClientSecret, tn.OrgSlug)
		requireStatus(t, http.StatusOK, inside.StatusCode(), inside.Body)
	})

	t.Run("should log into a sub-org the identity is a direct member of", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{})
		sub.LinkIdentity(t, ua.ID, "member")

		// Action
		res := uaLogin(t, tn.Anonymous(t), ua.ClientID, ua.ClientSecret, sub.Slug)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, sub.ID.String(), claims(t, res.JSON200.AccessToken)["orgId"])
		requireReadsMembers(t, tn.Client(t, res.JSON200.AccessToken), sub.ID.String())
	})

	t.Run("should log into a sub-org the identity reaches through a root group", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		identity := tn.NewMachineIdentity(t)
		ua := uaFor(t, tn, identity.ID)
		group := fixture.NewGroup(t, tn)
		group.AddIdentity(t, identity)
		linked, err := sub.Admin.API.CreateOrganizationGroupMembershipWithBodyWithResponse(t.Context(), group.ID,
			"application/json", jsonBody(t, permanentRoles("member")))
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, linked.StatusCode(), linked.Body)

		// Action
		res := uaLogin(t, tn.Anonymous(t), ua.ClientID, ua.ClientSecret, sub.Slug)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, sub.ID.String(), claims(t, res.JSON200.AccessToken)["orgId"])
		requireReadsMembers(t, tn.Client(t, res.JSON200.AccessToken), sub.ID.String())
	})

	t.Run("should refuse a login into a sub-org the identity does not reach", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sub := fixture.NewSubOrg(t, tn)
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{})

		// Action
		res := uaLogin(t, tn.Anonymous(t), ua.ClientID, ua.ClientSecret, sub.Slug)

		// Assert
		requireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Identity not authorized to access sub organization "+sub.Slug)
		require.Nil(t, res.JSON200)
	})
}

func TestUniversalAuth_ClientSecret(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return the secret once and list only its prefix", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{})

		// Action
		res, err := tn.Admin.API.ListUniversalAuthClientSecretsWithResponse(t.Context(), ua.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Len(t, res.JSON200.ClientSecretData, 1)
		require.Equal(t, ua.ClientSecret[:4], res.JSON200.ClientSecretData[0].ClientSecretPrefix)
		require.NotContains(t, string(res.Body), ua.ClientSecret)
		one, err := tn.Admin.API.GetUniversalAuthClientSecretWithResponse(t.Context(), ua.ID.String(), res.JSON200.ClientSecretData[0].Id)
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, one.StatusCode(), one.Body)
		require.Contains(t, string(one.Body), ua.ClientSecret[:4])
		require.NotContains(t, string(one.Body), ua.ClientSecret)
	})

	t.Run("should refuse new logins with a revoked secret and cut off the tokens it issued", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{})
		issued := tn.Client(t, ua.login(t, tn))
		requireWorks(t, issued)

		// Action
		res, err := tn.Admin.API.RevokeUniversalAuthClientSecretWithResponse(t.Context(), ua.ID.String(), ua.SecretID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		login := uaLogin(t, tn.Anonymous(t), ua.ClientID, ua.ClientSecret, tn.OrgSlug)
		requireStatus(t, http.StatusUnauthorized, login.StatusCode(), login.Body)
		body := waitForStatus(t, http.StatusUnauthorized, func() (int, []byte) { return whoami(t, issued) })
		require.Contains(t, string(body), "client secret has been revoked")
	})

	t.Run("should keep other secrets and their tokens working when one is revoked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{})
		kept, _ := addClientSecret(t, tn, ua.ID, api.CreateUniversalAuthClientSecretJSONRequestBody{})
		keptLogin := uaLogin(t, tn.Anonymous(t), ua.ClientID, kept, tn.OrgSlug)
		requireStatus(t, http.StatusOK, keptLogin.StatusCode(), keptLogin.Body)
		revokedToken := tn.Client(t, ua.login(t, tn))

		// Action
		res, err := tn.Admin.API.RevokeUniversalAuthClientSecretWithResponse(t.Context(), ua.ID.String(), ua.SecretID)

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		waitForStatus(t, http.StatusUnauthorized, func() (int, []byte) { return whoami(t, revokedToken) })
		requireWorks(t, tn.Client(t, keptLogin.JSON200.AccessToken))
		again := uaLogin(t, tn.Anonymous(t), ua.ClientID, kept, tn.OrgSlug)
		requireStatus(t, http.StatusOK, again.StatusCode(), again.Body)
	})

	t.Run("should accept N logins with numUsesLimit N, refuse the next, and revoke the secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{})
		secret, secretID := addClientSecret(t, tn, ua.ID, api.CreateUniversalAuthClientSecretJSONRequestBody{NumUsesLimit: new(float32(2))})
		for range 2 {
			res := uaLogin(t, tn.Anonymous(t), ua.ClientID, secret, tn.OrgSlug)
			requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		}

		// Action
		res := uaLogin(t, tn.Anonymous(t), ua.ClientID, secret, tn.OrgSlug)

		// Assert
		requireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Access denied due to client secret usage limit reached")
		require.True(t, secretRevoked(t, tn, ua.ID, secretID))
	})

	t.Run("should refuse and revoke an expired secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{})
		secret, secretID := addClientSecret(t, tn, ua.ID, api.CreateUniversalAuthClientSecretJSONRequestBody{Ttl: new(float32(1))})

		// Action
		refused, err := wait.For(t.Context(), func(context.Context) (*api.LoginWithUniversalAuthResponse, bool, error) {
			res := uaLogin(t, tn.Anonymous(t), ua.ClientID, secret, tn.OrgSlug)
			return res, res.StatusCode() != http.StatusOK, nil
		})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusUnauthorized, refused.StatusCode(), refused.Body)
		require.Contains(t, string(refused.Body), "Access denied due to expired client secret")
		require.True(t, secretRevoked(t, tn, ua.ID, secretID))
	})

	t.Run("should refuse creating a secret without create-token permission and create none", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{})
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))

		// Action
		res, err := member.API.CreateUniversalAuthClientSecretWithResponse(t.Context(), ua.ID.String(),
			api.CreateUniversalAuthClientSecretJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		listed, err := tn.Admin.API.ListUniversalAuthClientSecretsWithResponse(t.Context(), ua.ID.String())
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, listed.StatusCode(), listed.Body)
		require.Len(t, listed.JSON200.ClientSecretData, 1)
	})
}

func TestUniversalAuth_Lockout(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	lockable := api.AttachUniversalAuthJSONRequestBody{
		LockoutEnabled:         new(true),
		LockoutThreshold:       new(float32(2)),
		LockoutDurationSeconds: new(float32(300)),
	}

	t.Run("should lock after the threshold of wrong secrets and refuse even the right secret", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ua := newUA(t, tn, lockable)

		// Action
		failWrong(t, tn, ua, 2)

		// Assert
		res := uaLogin(t, tn.Anonymous(t), ua.ClientID, ua.ClientSecret, tn.OrgSlug)
		requireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "This identity auth method is temporarily locked")
	})

	t.Run("should accept the identity again after clear-lockouts", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ua := newUA(t, tn, lockable)
		failWrong(t, tn, ua, 2)
		require.Equal(t, []string{"universal-auth"}, getIdentity(t, tn, ua.ID).JSON200.Identity.Identity.ActiveLockoutAuthMethods)

		// Action
		res, err := tn.Admin.API.ClearUniversalAuthLockoutsWithResponse(t.Context(), ua.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		login := uaLogin(t, tn.Anonymous(t), ua.ClientID, ua.ClientSecret, tn.OrgSlug)
		requireStatus(t, http.StatusOK, login.StatusCode(), login.Body)
	})

	t.Run("should not lock when lockout is disabled", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{LockoutEnabled: new(false), LockoutThreshold: new(float32(2))})

		// Action
		failWrong(t, tn, ua, 4)

		// Assert
		res := uaLogin(t, tn.Anonymous(t), ua.ClientID, ua.ClientSecret, tn.OrgSlug)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Empty(t, getIdentity(t, tn, ua.ID).JSON200.Identity.Identity.ActiveLockoutAuthMethods)
	})

	t.Run("should show the method in activeLockoutAuthMethods while locked", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ua := newUA(t, tn, lockable)
		require.Empty(t, getIdentity(t, tn, ua.ID).JSON200.Identity.Identity.ActiveLockoutAuthMethods)

		// Action
		failWrong(t, tn, ua, 2)

		// Assert
		require.Equal(t, []string{"universal-auth"}, getIdentity(t, tn, ua.ID).JSON200.Identity.Identity.ActiveLockoutAuthMethods)
	})
}

func TestUniversalAuth_Configure(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse a TTL greater than the max TTL and keep the old config", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{AccessTokenTTL: new(60), AccessTokenMaxTTL: new(120)})

		// Action
		res, err := tn.Admin.API.UpdateUniversalAuthWithResponse(t.Context(), ua.ID.String(),
			api.UpdateUniversalAuthJSONRequestBody{AccessTokenTTL: new(121)})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Access token TTL cannot be greater than max TTL")
		require.EqualValues(t, 60, *getUA(t, tn, ua.ID).JSON200.IdentityUniversalAuth.AccessTokenTTL)
	})

	t.Run("should refuse attaching twice", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		ua := newUA(t, tn, api.AttachUniversalAuthJSONRequestBody{})

		// Action
		res, err := tn.Admin.API.AttachUniversalAuthWithResponse(t.Context(), ua.ID.String(), api.AttachUniversalAuthJSONRequestBody{})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusBadRequest, res.StatusCode(), res.Body)
		require.Contains(t, string(res.Body), "Failed to add universal auth to already configured identity")
		require.Equal(t, ua.ClientID, getUA(t, tn, ua.ID).JSON200.IdentityUniversalAuth.ClientId)
	})

	t.Run("should refuse configuring an identity when the actor lacks edit-auth, and keep the config", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		target := tn.NewMachineIdentity(t, harness.OrgRole("admin"))
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))
		before := getUA(t, tn, target.ID).JSON200.IdentityUniversalAuth.AccessTokenTTL

		// Action
		res, err := member.API.UpdateUniversalAuthWithResponse(t.Context(), target.ID.String(),
			api.UpdateUniversalAuthJSONRequestBody{AccessTokenTTL: new(1)})

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusForbidden, res.StatusCode(), res.Body)
		require.Equal(t, before, getUA(t, tn, target.ID).JSON200.IdentityUniversalAuth.AccessTokenTTL)
	})

	t.Run("should refuse tokens from a removed method and keep tokens from other methods working", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		identity := tn.NewMachineIdentity(t)
		attachTokenAuth(t, tn, identity.ID, api.AttachTokenAuthJSONRequestBody{})
		other := tn.Client(t, newTokenAuthToken(t, tn.Admin.API, identity.ID).JSON200.AccessToken)

		// Action
		res, err := tn.Admin.API.DeleteUniversalAuthWithResponse(t.Context(), identity.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		body := waitForStatus(t, http.StatusUnauthorized, func() (int, []byte) { return whoami(t, identity.API) })
		require.Contains(t, string(body), "auth method has been revoked")
		requireWorks(t, other)
	})
}

// uaFor attaches universal auth and a client secret to an existing identity.
func uaFor(t *testing.T, tn *harness.Tenant, identityID uuid.UUID) *uaIdentity {
	t.Helper()
	res := getUA(t, tn, identityID)
	secret, secretID := addClientSecret(t, tn, identityID, api.CreateUniversalAuthClientSecretJSONRequestBody{})
	return &uaIdentity{ID: identityID, ClientID: res.JSON200.IdentityUniversalAuth.ClientId, ClientSecret: secret, SecretID: secretID}
}

// failWrong sends n logins with a wrong secret, each refused as invalid credentials.
func failWrong(t *testing.T, tn *harness.Tenant, ua *uaIdentity, n int) {
	t.Helper()
	for i := range n {
		res := uaLogin(t, tn.Anonymous(t), ua.ClientID, fmt.Sprintf("wrong-secret-%d", i), tn.OrgSlug)
		requireStatus(t, http.StatusUnauthorized, res.StatusCode(), res.Body)
	}
}

func readSecret(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, secretID string) *api.GetUniversalAuthClientSecretResponse {
	t.Helper()
	res, err := tn.Admin.API.GetUniversalAuthClientSecretWithResponse(t.Context(), identityID.String(), secretID)
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "reading client secret returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res
}

func secretRevoked(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, secretID string) bool {
	t.Helper()
	revoked := readSecret(t, tn, identityID, secretID).JSON200.ClientSecretData.IsClientSecretRevoked
	return revoked != nil && *revoked
}

func secretUses(t *testing.T, tn *harness.Tenant, identityID uuid.UUID, secretID string) float32 {
	t.Helper()
	uses := readSecret(t, tn, identityID, secretID).JSON200.ClientSecretData.ClientSecretNumUses
	if uses == nil {
		return 0
	}
	return *uses
}

// requireReadsMembers proves a token acts inside an organization: org members can list
// its memberships, and nobody else can.
func requireReadsMembers(t *testing.T, c *api.ClientWithResponses, orgID string) {
	t.Helper()
	res, err := c.ListOrgMembershipsWithResponse(t.Context(), orgID)
	require.NoError(t, err)
	requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
}
