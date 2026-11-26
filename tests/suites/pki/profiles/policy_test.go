package profiles_test

import (
	"fmt"
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fixture/pki"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/stretchr/testify/require"
)

func TestCertificatePolicy_Read(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list the policies created in the project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		first, second := pki.NewPolicy(t, proj, pki.AllowAll(t)), pki.NewPolicy(t, proj, pki.AllowAll(t))

		// Action
		res, err := tn.Admin.API.ListCertificatePoliciesWithResponse(t.Context(), nil)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "listing policies returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		var ids []string
		for _, p := range res.JSON200.CertificatePolicies {
			ids = append(ids, p.Id.String())
		}
		require.Subset(t, ids, []string{first.ID.String(), second.ID.String()})
	})

	t.Run("should return the policy's rules when read by id", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		policy := pki.NewPolicy(t, pki.CertManager(t, tn), pki.AllowAll(t))

		// Action
		res, err := tn.Admin.API.GetCertificatePolicyWithResponse(t.Context(), policy.ID, nil)

		// Assert
		require.NoError(t, err)
		require.NotNilf(t, res.JSON200, "reading the policy returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
		require.Equal(t, policy.ID, res.JSON200.CertificatePolicy.Id)
		require.Equal(t, new("365d"), res.JSON200.CertificatePolicy.Validity.Max)
	})
}

func TestCertificatePolicy_Delete(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should delete a policy no profile uses so it can no longer be read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		policy := pki.NewPolicy(t, pki.CertManager(t, tn), pki.AllowAll(t))

		// Action
		res, err := tn.Admin.API.DeleteCertificatePolicyWithResponse(t.Context(), policy.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "deleting the policy: %s", apierr.Body(res.Body))
		got, err := tn.Admin.API.GetCertificatePolicyWithResponse(t.Context(), policy.ID, nil)
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, got.StatusCode(), "reading the deleted policy: %s", apierr.Body(got.Body))
	})

	t.Run("should refuse to delete a policy a profile issues under and keep it", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, "[BUG?] a policy in use is a conflict, yet the server answers 403 Forbidden as if the caller lacked permission")

		// Setup
		tn := h.NewTenant(t)
		proj := pki.CertManager(t, tn)
		policy := pki.NewPolicy(t, proj, pki.AllowAll(t))
		profile := pki.NewProfile(t, proj, pki.NewInternalCA(t, proj), policy)
		name := policyName(t, tn, policy)

		// Action
		res, err := tn.Admin.API.DeleteCertificatePolicyWithResponse(t.Context(), policy.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusForbidden, res.StatusCode(), "deleting the policy: %s", apierr.Body(res.Body))
		require.Equal(t, fmt.Sprintf("Cannot delete policy '%s' as it is currently in use by the following certificate profiles: %s. Please remove this policy from these profiles before deleting it.", name, profile.Slug), apierr.Message(res.Body))
		require.Equal(t, name, policyName(t, tn, policy))
	})
}
