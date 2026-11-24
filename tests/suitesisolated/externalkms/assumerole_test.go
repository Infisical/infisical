package externalkms_test

import (
	"net/http"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/aws"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/stretchr/testify/require"
)

// Every organization assumes customers' roles with the same Infisical credential, so a
// role's trust policy can only tell organizations apart by the external ID. These pin that
// Infisical sends its own organization's ID and nothing a caller chooses, so one
// organization cannot reach a role another organization's customer set up.
func TestExternalKMS_AssumeRoleExternalID(t *testing.T) {
	h := harness.From(t)

	t.Run("should send the organization ID as the external ID when none is given", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		roleArn, keyID := customerRole(t, tn, tn.OrgID.String())
		sts := infisicalSTS(t, tn)

		// Action
		res := createAWSKMS(t, tn.Admin, roleArn, "", keyID)

		// Assert
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, tn.OrgID.String(), storedAssumeRole(t, tn.Admin, kmsID(t, res.Body)).ExternalID)
		sts.ExpectEvent(t, func(e aws.RoleAssumed) bool {
			return e.RoleArn == roleArn && e.ExternalID == tn.OrgID.String()
		})
	})

	t.Run("should refuse a project ID of its own organization as the external ID", func(t *testing.T) {
		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		roleArn, keyID := customerRole(t, tn, proj.ID)
		sts := infisicalSTS(t, tn)

		// Action
		res := createAWSKMS(t, tn.Admin, roleArn, proj.ID, keyID)

		// Assert
		requireOrgIDRequired(t, tn, res.StatusCode(), res.Body)
		require.Zero(t, externalKMSCount(t, tn.Admin))
		sts.ExpectNoEvent(t, func(e aws.RoleAssumed) bool { return e.RoleArn == roleArn })
	})

	t.Run("should refuse another organization's project ID as the external ID and never assume its role", func(t *testing.T) {
		// Setup
		victim := h.NewTenant(t)
		victimProj := fixture.NewProject(t, victim, fixture.WithProjectType("secret-manager"))
		victimRole, victimKey := customerRole(t, victim, victimProj.ID)
		attacker := h.NewTenant(t)
		sts := infisicalSTS(t, attacker)

		// Action
		res := createAWSKMS(t, attacker.Admin, victimRole, victimProj.ID, victimKey)

		// Assert
		requireOrgIDRequired(t, attacker, res.StatusCode(), res.Body)
		require.Zero(t, externalKMSCount(t, attacker.Admin))
		sts.ExpectNoEvent(t, func(e aws.RoleAssumed) bool { return e.RoleArn == victimRole })
	})

	t.Run("should refuse another organization's ID as the external ID and never assume its role", func(t *testing.T) {
		// Setup
		victim := h.NewTenant(t)
		victimRole, victimKey := customerRole(t, victim, victim.OrgID.String())
		attacker := h.NewTenant(t)
		sts := infisicalSTS(t, attacker)

		// Action
		res := createAWSKMS(t, attacker.Admin, victimRole, victim.OrgID.String(), victimKey)

		// Assert
		requireOrgIDRequired(t, attacker, res.StatusCode(), res.Body)
		require.Zero(t, externalKMSCount(t, attacker.Admin))
		sts.ExpectNoEvent(t, func(e aws.RoleAssumed) bool { return e.RoleArn == victimRole })
	})

	t.Run("should refuse an update to another organization's project ID and keep the stored role and external ID", func(t *testing.T) {
		// Setup
		victim := h.NewTenant(t)
		victimProj := fixture.NewProject(t, victim, fixture.WithProjectType("secret-manager"))
		victimRole, _ := customerRole(t, victim, victimProj.ID)
		attacker := h.NewTenant(t)
		ownRole, ownKey := customerRole(t, attacker, attacker.OrgID.String())
		created := createAWSKMS(t, attacker.Admin, ownRole, attacker.OrgID.String(), ownKey)
		requireStatus(t, http.StatusOK, created.StatusCode(), created.Body)
		kms := kmsID(t, created.Body)
		sts := infisicalSTS(t, attacker)

		// Action
		res, err := attacker.Admin.API.UpdateAwsExternalKmsWithBodyWithResponse(t.Context(), kms, "application/json", jsonBody(t, map[string]any{
			"configuration": map[string]any{"credential": assumeRoleCredential(victimRole, victimProj.ID)},
		}))
		require.NoError(t, err)

		// Assert
		requireOrgIDRequired(t, attacker, res.StatusCode(), res.Body)
		require.Equal(t, assumeRole{RoleArn: ownRole, ExternalID: attacker.OrgID.String()}, storedAssumeRole(t, attacker.Admin, kms))
		sts.ExpectNoEvent(t, func(e aws.RoleAssumed) bool { return e.RoleArn == victimRole })
	})
}
