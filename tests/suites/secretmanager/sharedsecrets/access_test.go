package sharedsecrets_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

func TestSharedSecret_Access(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse an organization-access share without a token", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		id := share(t, tn.Admin.API, api.CreateSharedSecretJSONRequestBody{SecretValue: "org-only", MaxViews: new(float32(1))})

		// Action
		res := access(t, tn.Anonymous(t), id, nil)

		// Assert
		require.Equal(t, http.StatusUnauthorized, res.StatusCode())
		require.NotContains(t, string(res.Body), "org-only")
		require.Equal(t, "org-only", revealed(t, access(t, tn.Admin.API, id, nil)), "the refused access used up the only view")
	})

	t.Run("should refuse a member of another organization and reveal nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		mine, theirs := h.NewTenant(t), h.NewTenant(t)
		id := share(t, theirs.Admin.API, api.CreateSharedSecretJSONRequestBody{SecretValue: "org-only", MaxViews: new(float32(1))})

		// Action
		res := access(t, mine.Admin.API, id, nil)

		// Assert
		require.Truef(t, res.StatusCode() >= http.StatusBadRequest && res.StatusCode() < http.StatusInternalServerError,
			"tenant %s reading tenant %s's organization share returned %d, not a refusal: %s",
			mine.OrgSlug, theirs.OrgSlug, res.StatusCode(), apierr.Body(res.Body))
		require.NotContains(t, string(res.Body), "org-only")
		require.Equal(t, "org-only", revealed(t, access(t, theirs.Admin.API, id, nil)), "the refused access used up the only view")
	})

	t.Run("should refuse a member who is not on the email list and reveal to one who is", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		listed := tn.NewUser(t, harness.WithName("listed"))
		unlisted := tn.NewUser(t, harness.WithName("unlisted"))
		id := share(t, tn.Admin.API, api.CreateSharedSecretJSONRequestBody{
			SecretValue:      "for-listed",
			AuthorizedEmails: emails(listed.Email),
		})

		// Action
		res := access(t, unlisted.API, id, nil)

		// Assert
		require.Equal(t, http.StatusForbidden, res.StatusCode())
		require.Equal(t, "You are not authorized to view this secret", res.JSON403.Message)
		require.Equal(t, "for-listed", revealed(t, access(t, listed.API, id, nil)))
	})

	t.Run("should require the password and refuse a wrong one without using up a view", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		id := share(t, tn.Admin.API, api.CreateSharedSecretJSONRequestBody{
			SecretValue: "guarded",
			AccessType:  anyoneAccess(),
			Password:    new("correct horse"),
			MaxViews:    new(float32(1)),
		})
		anon := tn.Anonymous(t)

		// Action
		missing := access(t, anon, id, nil)
		wrong := access(t, anon, id, new("wrong"))

		// Assert
		require.Equal(t, http.StatusUnauthorized, missing.StatusCode())
		require.Equal(t, "Password is required to access this secret", missing.JSON401.Message)
		require.Equal(t, http.StatusUnauthorized, wrong.StatusCode())
		require.Equal(t, "Invalid credentials", wrong.JSON401.Message)
		require.NotContains(t, string(wrong.Body), "guarded")
		require.Equal(t, "guarded", revealed(t, access(t, anon, id, new("correct horse"))),
			"a refused password used up the only view")
	})

	t.Run("should return the value once and then refuse with the view-limit message when maxViews is 1", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		id := share(t, tn.Admin.API, api.CreateSharedSecretJSONRequestBody{
			SecretValue: "once",
			AccessType:  anyoneAccess(),
			MaxViews:    new(float32(1)),
		})
		anon := tn.Anonymous(t)

		// Action
		first := access(t, anon, id, nil)
		second := access(t, anon, id, nil)

		// Assert
		require.Equal(t, "once", revealed(t, first))
		require.Equal(t, http.StatusNotFound, second.StatusCode())
		require.Equal(t, "The shared secret has reached its view limit", second.JSON404.Message)
	})

	t.Run("should create a share with access forced to anyone through the public route even when organization access is asked for", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		anon := tn.Anonymous(t)
		body, err := json.Marshal(map[string]any{
			"secretValue": "public",
			"expiresIn":   "1h",
			"accessType":  "organization",
		})
		require.NoError(t, err)

		// Action
		created, err := anon.CreatePublicSharedSecretWithBodyWithResponse(t.Context(), "application/json", bytes.NewReader(body))
		require.NoError(t, err)
		require.NotNilf(t, created.JSON200, "sharing publicly returned %d: %s", created.StatusCode(), apierr.Body(created.Body))

		// Assert
		got, err := anon.GetSharedSecretByIdWithResponse(t.Context(), created.JSON200.Id)
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading the share returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		require.NotNil(t, got.JSON200.AccessType)
		require.Equal(t, "anyone", *got.JSON200.AccessType)
		require.Equal(t, "public", revealed(t, access(t, anon, created.JSON200.Id, nil)))
	})
}
