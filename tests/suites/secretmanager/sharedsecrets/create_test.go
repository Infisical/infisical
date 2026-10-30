package sharedsecrets_test

import (
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fakes/smtp"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

func TestSharedSecret_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse and create nothing when the expiry is under 5 minutes, over 30 days, or in the past", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		cases := map[string]string{
			"4m":  "Expiration time cannot be less than 5 minutes",
			"31d": "Expiration time cannot exceed 30 days",
			"-1h": "Expiration time cannot be less than 5 minutes",
		}

		for expiresIn, message := range cases {
			// Action
			res, err := tn.Admin.API.CreateSharedSecretWithResponse(t.Context(), api.CreateSharedSecretJSONRequestBody{
				SecretValue: "value",
				ExpiresIn:   new(expiresIn),
			})

			// Assert
			require.NoError(t, err)
			require.Equalf(t, http.StatusUnprocessableEntity, res.StatusCode(), "expiresIn %s: %s", expiresIn, res.Body)
			require.Containsf(t, string(res.Body), message, "expiresIn %s", expiresIn)
		}
		_, total := shareNames(t, tn.Admin, nil)
		require.Zero(t, total)
	})

	t.Run("should refuse and create nothing when the value, the name or the view limit is out of bounds", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		cases := map[string]api.CreateSharedSecretJSONRequestBody{
			"value over 10,000 characters": {SecretValue: strings.Repeat("v", 10_001)},
			"name over 50 characters":      {SecretValue: "value", Name: new(strings.Repeat("n", 51))},
			"maxViews under 1":             {SecretValue: "value", MaxViews: new(float32(0))},
		}

		for name, body := range cases {
			// Action
			res, err := tn.Admin.API.CreateSharedSecretWithResponse(t.Context(), body)

			// Assert
			require.NoError(t, err)
			require.Equalf(t, http.StatusUnprocessableEntity, res.StatusCode(), "%s: %s", name, res.Body)
		}
		_, total := shareNames(t, tn.Admin, nil)
		require.Zero(t, total)
	})

	t.Run("should refuse anyone-access when the organization does not allow sharing outside it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		updateOrg(t, tn, api.UpdateOrganizationJSONRequestBody{AllowSecretSharingOutsideOrganization: new(false)})

		// Action
		res, err := tn.Admin.API.CreateSharedSecretWithResponse(t.Context(), api.CreateSharedSecretJSONRequestBody{
			SecretValue: "value",
			AccessType:  anyoneAccess(),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Organization does not allow sharing secrets to members outside of this organization", res.JSON400.Message)
		_, total := shareNames(t, tn.Admin, nil)
		require.Zero(t, total)
	})

	t.Run("should refuse a lifetime over the organization limit", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		updateOrg(t, tn, api.UpdateOrganizationJSONRequestBody{MaxSharedSecretLifetime: new(float32(3600))})

		// Action
		res, err := tn.Admin.API.CreateSharedSecretWithResponse(t.Context(), api.CreateSharedSecretJSONRequestBody{
			SecretValue: "value",
			ExpiresIn:   new("2h"),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "Secret lifetime exceeds organization limit", res.JSON400.Message)
		_, total := shareNames(t, tn.Admin, nil)
		require.Zero(t, total)
	})

	t.Run("should refuse a share with no maxViews as over the view limit when the organization sets one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		updateOrg(t, tn, api.UpdateOrganizationJSONRequestBody{MaxSharedSecretViewLimit: new(float32(5))})

		// Action
		unset, err := tn.Admin.API.CreateSharedSecretWithResponse(t.Context(), api.CreateSharedSecretJSONRequestBody{
			SecretValue: "value",
		})
		require.NoError(t, err)
		over, err := tn.Admin.API.CreateSharedSecretWithResponse(t.Context(), api.CreateSharedSecretJSONRequestBody{
			SecretValue: "value",
			MaxViews:    new(float32(6)),
		})
		require.NoError(t, err)

		// Assert
		require.Equal(t, http.StatusBadRequest, unset.StatusCode())
		require.Equal(t, "Secret max views parameter exceeds organization limit", unset.JSON400.Message)
		require.Equal(t, http.StatusBadRequest, over.StatusCode())
		require.Equal(t, "Secret max views parameter exceeds organization limit", over.JSON400.Message)
		_, total := shareNames(t, tn.Admin, nil)
		require.Zero(t, total)
	})

	t.Run("should refuse external emails without a password", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		res, err := tn.Admin.API.CreateSharedSecretWithResponse(t.Context(), api.CreateSharedSecretJSONRequestBody{
			SecretValue:         "value",
			AccessType:          anyoneAccess(),
			AuthorizedEmails:    emails(tn.Email("outsider")),
			AllowExternalEmails: new(true),
		})

		// Assert
		require.NoError(t, err)
		require.Equal(t, http.StatusBadRequest, res.StatusCode())
		require.Equal(t, "A password is required when sharing secrets with users outside of Infisical", res.JSON400.Message)
		_, total := shareNames(t, tn.Admin, nil)
		require.Zero(t, total)
	})

	t.Run("should mail each listed address with the link, naming the sender only to an organization member", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewUser(t, harness.WithName("member"))
		outsider := tn.Email("outsider")

		// Action
		id := share(t, tn.Admin.API, api.CreateSharedSecretJSONRequestBody{
			SecretValue:      "value",
			Name:             new("db-password"),
			AccessType:       anyoneAccess(),
			AuthorizedEmails: emails(member.Email, outsider),
		})

		// Assert
		toMember := tn.Mail(t).Expect(t, member.Email, smtp.Subject("A secret has been shared with you"))
		toOutsider := tn.Mail(t).Expect(t, outsider, smtp.Subject("A secret has been shared with you"))
		require.Contains(t, toMember.Body, "/shared/secret/"+id)
		require.Contains(t, toOutsider.Body, "/shared/secret/"+id)
		require.Contains(t, toMember.Body, tn.Admin.Email)
		require.NotContains(t, toOutsider.Body, tn.Admin.Email)
		require.Contains(t, toOutsider.Body, "Someone")
	})
}
