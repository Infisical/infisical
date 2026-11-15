package alert_test

import (
	"context"
	"crypto/rand"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/clients/api"
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

	t.Run("should list an unread notification naming the device when a user signs in from a new one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t, harness.WithName("alice"))
		ip := sourceIP()

		// Action
		signInFrom(t, tn, alice, ip, "new-laptop")

		// Assert
		got := waitForDeviceNotice(t, alice, ip)
		require.Equal(t, "login-from-new-device", got.Type)
		require.Equal(t, "Login From New Device", got.Title)
		require.Contains(t, got.Body, "new-laptop")
		require.False(t, got.IsRead)
	})

	t.Run("should mark every notification read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t, harness.WithName("alice"))
		first, second := sourceIP(), sourceIP()
		signInFrom(t, tn, alice, first, "laptop")
		signInFrom(t, tn, alice, second, "phone")
		waitForDeviceNotice(t, alice, first)
		waitForDeviceNotice(t, alice, second)

		// Action
		res, err := alice.API.MarkUserNotificationsAsReadWithResponse(t.Context())

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		got := notifications(t, alice)
		require.GreaterOrEqual(t, len(got), 2)
		for _, n := range got {
			require.Truef(t, n.IsRead, "%q is still unread", n.Body)
		}
	})

	t.Run("should mark one notification read and leave the others unread", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t, harness.WithName("alice"))
		first, second := sourceIP(), sourceIP()
		signInFrom(t, tn, alice, first, "laptop")
		signInFrom(t, tn, alice, second, "phone")
		read := waitForDeviceNotice(t, alice, first)
		unread := waitForDeviceNotice(t, alice, second)

		// Action
		res, err := alice.API.UpdateUserNotificationWithResponse(t.Context(), read.ID,
			api.UpdateUserNotificationJSONRequestBody{IsRead: true})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.True(t, waitForDeviceNotice(t, alice, first).IsRead)
		require.False(t, waitForDeviceNotice(t, alice, second).IsRead)
		require.Equal(t, unread.ID, waitForDeviceNotice(t, alice, second).ID)
	})

	t.Run("should answer 404 and change nothing when a user marks another user's notification read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t, harness.WithName("alice"))
		bob := tn.NewUser(t, harness.WithName("bob"))
		ip := sourceIP()
		signInFrom(t, tn, alice, ip, "laptop")
		theirs := waitForDeviceNotice(t, alice, ip)

		// Action
		res, err := bob.API.UpdateUserNotificationWithResponse(t.Context(), theirs.ID,
			api.UpdateUserNotificationJSONRequestBody{IsRead: true})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, "Notification not found", apierr.Message(res.Body))
		require.False(t, waitForDeviceNotice(t, alice, ip).IsRead)
	})

	t.Run("should answer 404 and keep it when a user deletes another user's notification", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		alice := tn.NewUser(t, harness.WithName("alice"))
		bob := tn.NewUser(t, harness.WithName("bob"))
		ip := sourceIP()
		signInFrom(t, tn, alice, ip, "laptop")
		theirs := waitForDeviceNotice(t, alice, ip)

		// Action
		res, err := bob.API.DeleteUserNotificationWithResponse(t.Context(), theirs.ID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusNotFound, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Equal(t, "Notification not found", apierr.Message(res.Body))
		require.Equal(t, theirs.ID, waitForDeviceNotice(t, alice, ip).ID)
	})
}

// signInFrom selects the org from an address and client the user has not used, which
// is what raises a new-device notification.
func signInFrom(t *testing.T, tn *harness.Tenant, user *harness.Principal, ip, userAgent string) {
	t.Helper()
	res, err := user.API.SelectOrganizationV3WithResponse(t.Context(),
		api.SelectOrganizationV3JSONRequestBody{OrganizationId: tn.OrgID.String()},
		func(_ context.Context, req *http.Request) error {
			req.Header.Set("X-Forwarded-For", ip)
			req.Header.Set("User-Agent", userAgent)
			return nil
		})
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "selecting the org: %s", apierr.Body(res.Body))
}

func sourceIP() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return fmt.Sprintf("10.%d.%d.%d", b[0], b[1], b[2])
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

// waitForDeviceNotice polls for the new-device notification naming an address.
// Notifications are written from a queue after the response.
func waitForDeviceNotice(t *testing.T, user *harness.Principal, ip string) notification {
	t.Helper()
	got, err := wait.For(t.Context(), func(ctx context.Context) (notification, bool, error) {
		got, err := listNotifications(ctx, user)
		for _, n := range got {
			if strings.Contains(n.Body, "**"+ip+"**") {
				return n, true, nil
			}
		}
		return notification{}, false, err
	})
	require.NoErrorf(t, err, "waiting for a new-device notification for %s from %s", user.Email, ip)
	return got
}

func deref[T any](p *T) T {
	var zero T
	if p == nil {
		return zero
	}
	return *p
}
