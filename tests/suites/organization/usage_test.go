package organization_test

import (
	"net/http"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

// Reports sit behind a 5s debounce, so waits need extra room on top of the default.
const reportWithin = 30 * time.Second

func TestUsageReport_Send(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should report the member count when a machine identity is created, and again when a member is removed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		root := license.Open(t, fixture.FakenetAdmin(t, tn), tn.OrgID.String())
		awaitFirstReport(t, root)
		alice := tn.NewUser(t)
		tn.NewMachineIdentity(t)
		spec.Why(t, "an invite sends no report; creating an identity syncs the seats, and the admin, in only the implicit PAM project, is not a billable seat")
		expectSnapshot(t, root, "user_identities", 1)
		membership := fixture.MembershipOf(t, tn, alice.Email)
		spec.Why(t, "the first report already sent user_identities 0, so only a report after the removal counts")
		mark := root.Mark(t)

		// Action
		res, err := tn.Admin.API.DeleteOrgMembershipWithResponse(t.Context(), tn.OrgID.String(), membership.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		expectSnapshot(t, root, "user_identities", 0, fakenet.Since(mark))
	})

	t.Run("should refetch the plan when a member is removed", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		root := license.Open(t, fixture.FakenetAdmin(t, tn), tn.OrgID.String())
		alice := tn.NewUser(t)
		membership := fixture.MembershipOf(t, tn, alice.Email)
		fixture.Plan(t, tn.Admin.API, tn.OrgID.String(), false)
		before := len(root.State(t).EntitlementFetches)

		// Action
		res, err := tn.Admin.API.DeleteOrgMembershipWithResponse(t.Context(), tn.OrgID.String(), membership.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		require.Equal(t, before+1, len(root.State(t).EntitlementFetches))
	})

	t.Run("should report the identity count when a machine identity is created", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		root := license.Open(t, fixture.FakenetAdmin(t, tn), tn.OrgID.String())

		// Action
		tn.NewMachineIdentity(t)

		// Assert
		expectSnapshot(t, root, "identities", 1)
	})

	t.Run("should report a secret manager identity when an identity joins a secret manager project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		root := license.Open(t, fixture.FakenetAdmin(t, tn), tn.OrgID.String())
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		proj.NewMachineIdentity(t)

		// Assert
		spec.Why(t, "the admin who created the project is its first member")
		expectSnapshot(t, root, "secret_identities", 2)
	})

	t.Run("should report an agent vault identity when an identity joins an agent vault project", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		root := license.Open(t, fixture.FakenetAdmin(t, tn), tn.OrgID.String())
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("agent-vault"))

		// Action
		proj.NewMachineIdentity(t)

		// Assert
		expectSnapshot(t, root, "agent_vault_identities", 2)
	})

	t.Run("should report nothing for an org on the free plan", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Free))
		root := license.Open(t, fixture.FakenetAdmin(t, tn), tn.OrgID.String())
		alice := tn.NewUser(t)
		membership := fixture.MembershipOf(t, tn, alice.Email)

		// Action
		res, err := tn.Admin.API.DeleteOrgMembershipWithResponse(t.Context(), tn.OrgID.String(), membership.ID.String())

		// Assert
		require.NoError(t, err)
		requireStatus(t, http.StatusOK, res.StatusCode(), res.Body)
		root.ExpectNoEvent[license.SnapshotReceived](t, nil, fakenet.Within(15*time.Second))
	})

	t.Run("should not report a member count the server already has", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		root := license.Open(t, fixture.FakenetAdmin(t, tn), tn.OrgID.String())
		awaitFirstReport(t, root)
		tn.NewUser(t)
		tn.NewMachineIdentity(t)
		expectSnapshot(t, root, "user_identities", 1)
		mark := root.Mark(t)

		// Action: a second identity syncs the seats again, unchanged
		tn.NewMachineIdentity(t)

		// Assert
		root.ExpectNoEvent[license.SnapshotReceived](t, func(e license.SnapshotReceived) bool {
			return e.Dimension == "user_identities"
		}, fakenet.Since(mark), fakenet.Within(12*time.Second))
	})

	t.Run("should retry a report the server failed with a 500", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		root := license.Open(t, fixture.FakenetAdmin(t, tn), tn.OrgID.String())
		awaitFirstReport(t, root)
		root.Fail(t, http.MethodPost, "/v1/organizations/"+tn.OrgID.String()+"/usage-snapshots", http.StatusInternalServerError, fakenet.Times(1))
		tn.NewUser(t)

		// Action: creating an identity syncs the seats
		tn.NewMachineIdentity(t)

		// Assert
		expectSnapshot(t, root, "user_identities", 1)
	})

	t.Run("should send a count again when the server refused it as not priced", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		root := license.Open(t, fixture.FakenetAdmin(t, tn), tn.OrgID.String())
		snapshots := "/v1/organizations/" + tn.OrgID.String() + "/usage-snapshots"
		awaitFirstReport(t, root)
		root.Fail(t, http.MethodPost, snapshots, http.StatusUnprocessableEntity,
			fakenet.Times(1), fakenet.Body(`{"message":"dimension user_identities is not priced by any active product on this license"}`))
		tn.NewUser(t)
		tn.NewMachineIdentity(t)
		wait.Until(t, "the License Server refused a snapshot", func() bool { return refused(t, root, snapshots) }, wait.Timeout(reportWithin))

		// Action: a second identity syncs the seats again
		tn.NewMachineIdentity(t)

		// Assert
		spec.Why(t, "a refused value is not recorded as reported, so the next send carries it")
		expectSnapshot(t, root, "user_identities", 1)
	})
}

// A new paid org reports this many dimensions once, on its first plan read.
const meteredDimensions = 8

// Wait for the initial reports so an injected failure hits the one the test triggers.
func awaitFirstReport(t *testing.T, sc *fakenet.Scope[license.State]) {
	t.Helper()
	wait.Until(t, "the first report of every dimension", func() bool {
		return len(sc.State(t).Snapshots) >= meteredDimensions
	}, wait.Timeout(reportWithin))
}

func refused(t *testing.T, sc *fakenet.Scope[license.State], path string) bool {
	t.Helper()
	for _, c := range sc.Calls(t) {
		if c.Path == path && c.Status >= 400 {
			return true
		}
	}
	return false
}

func expectSnapshot(t *testing.T, sc *fakenet.Scope[license.State], dimension string, value float64, opts ...fakenet.WaitOption) {
	t.Helper()
	sc.ExpectEvent[license.SnapshotReceived](t, func(e license.SnapshotReceived) bool {
		return e.Dimension == dimension && e.Value == value
	}, append([]fakenet.WaitOption{fakenet.Within(reportWithin)}, opts...)...)
}
