package alert_test

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/stretchr/testify/require"
)

type notification struct {
	ID     string
	Type   string
	Title  string
	Body   string
	IsRead bool
}

func TestUserNotification(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should list an unread notification naming the project when a user is added to it", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))

		// Action
		alice := proj.NewUser(t, fixture.WithPrincipalName("alice"))

		// Assert
		got := waitForInvitation(t, alice)
		require.Equal(t, "Project Invitation", got.Title)
		require.Contains(t, got.Body, proj.Name)
		require.False(t, got.IsRead)
	})

	t.Run("should mark every notification read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		first := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		second := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		alice := first.NewUser(t, fixture.WithPrincipalName("alice"))
		second.Grant(t, alice)
		waitForNotifications(t, alice, 2)

		// Action
		res, err := alice.API.MarkUserNotificationsAsReadWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		got := notifications(t, alice)
		require.Len(t, got, 2)
		for _, n := range got {
			require.Truef(t, n.IsRead, "%q is still unread", n.Title)
		}
	})

	t.Run("should mark one notification read and leave the others unread", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		first := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		second := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		alice := first.NewUser(t, fixture.WithPrincipalName("alice"))
		second.Grant(t, alice)
		all := waitForNotifications(t, alice, 2)

		// Action
		res, err := alice.API.UpdateUserNotificationWithResponse(t.Context(), all[0].ID,
			api.UpdateUserNotificationJSONRequestBody{IsRead: true})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		read := map[string]bool{}
		for _, n := range notifications(t, alice) {
			read[n.ID] = n.IsRead
		}
		require.Equal(t, map[string]bool{all[0].ID: true, all[1].ID: false}, read)
	})

	t.Run("should answer 404 and change nothing when a user marks another user's notification read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		alice := proj.NewUser(t, fixture.WithPrincipalName("alice"))
		bob := tn.NewUser(t, harness.WithName("bob"))
		theirs := waitForInvitation(t, alice)

		// Action
		res, err := bob.API.UpdateUserNotificationWithResponse(t.Context(), theirs.ID,
			api.UpdateUserNotificationJSONRequestBody{IsRead: true})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, "Notification not found", apierr.Message(res.Body))
		require.False(t, waitForInvitation(t, alice).IsRead)
	})

	t.Run("should answer 404 and keep it when a user deletes another user's notification", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		alice := proj.NewUser(t, fixture.WithPrincipalName("alice"))
		bob := tn.NewUser(t, harness.WithName("bob"))
		theirs := waitForInvitation(t, alice)

		// Action
		res, err := bob.API.DeleteUserNotificationWithResponse(t.Context(), theirs.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, "Notification not found", apierr.Message(res.Body))
		require.Equal(t, theirs.ID, waitForInvitation(t, alice).ID)
	})
}

func listNotifications(ctx context.Context, user *harness.Principal) ([]notification, error) {
	res, err := user.API.ListUserNotificationsWithResponse(ctx)
	if err != nil {
		return nil, err
	}
	if res.JSON200 == nil {
		return nil, fmt.Errorf("listing notifications returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	}
	out := make([]notification, 0, len(res.JSON200.Notifications))
	for _, n := range res.JSON200.Notifications {
		out = append(out, notification{
			ID:     n.Id.String(),
			Type:   n.Type,
			Title:  n.Title,
			Body:   deref(n.Body),
			IsRead: deref(n.IsRead),
		})
	}
	return out, nil
}

func notifications(t *testing.T, user *harness.Principal) []notification {
	t.Helper()
	got, err := listNotifications(t.Context(), user)
	require.NoError(t, err)
	return got
}

// waitForNotifications polls until the user holds n notifications. They are written
// from a queue after the response.
func waitForNotifications(t *testing.T, user *harness.Principal, n int) []notification {
	t.Helper()
	got, err := wait.For(t.Context(), func(ctx context.Context) ([]notification, bool, error) {
		got, err := listNotifications(ctx, user)
		return got, len(got) >= n, err
	})
	require.NoErrorf(t, err, "waiting for %d notifications for %s", n, user.Email)
	return got
}

func waitForInvitation(t *testing.T, user *harness.Principal) notification {
	t.Helper()
	got, err := wait.For(t.Context(), func(ctx context.Context) (notification, bool, error) {
		got, err := listNotifications(ctx, user)
		for _, n := range got {
			if n.Type == "project-invitation" && strings.Contains(n.Body, "project") {
				return n, true, nil
			}
		}
		return notification{}, false, err
	})
	require.NoErrorf(t, err, "waiting for a project invitation notification for %s", user.Email)
	return got
}

func deref[T any](p *T) T {
	var zero T
	if p == nil {
		return zero
	}
	return *p
}
