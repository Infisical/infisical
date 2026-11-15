package auditlog_test

import (
	"net/http"
	"slices"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/clients/api"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/stretchr/testify/require"
)

func TestAuditLog_OrgFilter(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should return only the events of the requested actor type", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		bot := tn.NewMachineIdentity(t, harness.OrgRole("admin"))
		byUser := createGroup(t, tn.Admin, "by-user-"+id.Short())
		byBot := createGroup(t, bot, "by-bot-"+id.Short())
		waitForEvents(t, tn.Admin, filter{EventType: new("create-group")}, 2)

		// Action
		got := events(t, tn.Admin, filter{
			EventType: new("create-group"),
			ActorType: new(api.ListOrganizationAuditLogsParamsActorTypeIdentity),
		})

		// Assert
		require.Equal(t, []any{byBot}, metadataValues(got, "groupId"))
		require.NotContains(t, metadataValues(got, "groupId"), byUser)
	})

	t.Run("should return only the events of the requested user agent type", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		fromTerraform := createGroup(t, tn.Admin, "tf-"+id.Short(), userAgent("terraform"))
		createGroup(t, tn.Admin, "other-"+id.Short())
		waitForEvents(t, tn.Admin, filter{EventType: new("create-group")}, 2)

		// Action
		got := events(t, tn.Admin, filter{
			EventType:     new("create-group"),
			UserAgentType: new(api.ListOrganizationAuditLogsParamsUserAgentTypeTerraform),
		})

		// Assert
		require.Equal(t, []any{fromTerraform}, metadataValues(got, "groupId"))
		require.Equal(t, "terraform", got[0].UserAgentType)
	})

	t.Run("should return only the events of the requested event class", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		tn.NewMachineIdentity(t)
		createGroup(t, tn.Admin, "g-"+id.Short())
		waitForEvents(t, tn.Admin, filter{EventType: new("login-identity-universal-auth")}, 1)
		waitForEvents(t, tn.Admin, filter{EventType: new("create-group")}, 1)

		// Action
		got := events(t, tn.Admin, filter{EventClass: new("authentication")})

		// Assert
		require.NotEmpty(t, got)
		types := make([]string, 0, len(got))
		for _, e := range got {
			require.Equalf(t, "authentication", e.Class, "%s is not an authentication event", e.Type)
			types = append(types, e.Type)
		}
		require.Contains(t, types, "login-identity-universal-auth")
		require.NotContains(t, types, "create-group")
	})

	t.Run("should return only the events whose metadata matches", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		wanted := "wanted-" + id.Short()
		wantedID := createGroup(t, tn.Admin, wanted)
		createGroup(t, tn.Admin, "other-"+id.Short())
		waitForEvents(t, tn.Admin, filter{EventType: new("create-group")}, 2)

		// Action
		got := events(t, tn.Admin, filter{EventType: new("create-group"), EventMetadata: new("name=" + wanted)})

		// Assert
		require.Equal(t, []any{wantedID}, metadataValues(got, "groupId"))
	})

	t.Run("should return only the events in the date range", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		first := createGroup(t, tn.Admin, "first-"+id.Short())
		earlier := waitForEvents(t, tn.Admin, filter{EventType: new("create-group")}, 1)[0]
		second := createGroup(t, tn.Admin, "second-"+id.Short())
		waitForEvents(t, tn.Admin, filter{EventType: new("create-group")}, 2)
		// createdAt comes back in milliseconds; the stored value can be up to 1ms later.
		cut := earlier.CreatedAt.UTC().Add(time.Millisecond)

		// Action
		before := events(t, tn.Admin, filter{EventType: new("create-group"), EndDate: &cut})
		after := events(t, tn.Admin, filter{EventType: new("create-group"), StartDate: &cut})

		// Assert
		require.Equal(t, []any{first}, metadataValues(before, "groupId"))
		require.Equal(t, []any{second}, metadataValues(after, "groupId"))
	})

	t.Run("should refuse a range that ends before it starts", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		start := time.Now().UTC().Truncate(time.Second)
		end := start.Add(-time.Hour)

		// Action
		res, err := tn.Admin.API.ListOrganizationAuditLogsWithResponse(t.Context(),
			&api.ListOrganizationAuditLogsParams{StartDate: &start, EndDate: &end})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusUnprocessableEntity, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "End date cannot be before start date")
	})

	t.Run("should refuse a range longer than 3 months", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		end := time.Now().UTC().Truncate(time.Second)
		start := end.AddDate(0, -3, -1)

		// Action
		res, err := tn.Admin.API.ListOrganizationAuditLogsWithResponse(t.Context(),
			&api.ListOrganizationAuditLogsParams{StartDate: &start, EndDate: &end})

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusUnprocessableEntity, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Contains(t, string(res.Body), "Dates must be within 3 months")
	})

	t.Run("should page with offset and limit without duplicates or gaps", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		for i := range 5 {
			createGroup(t, tn.Admin, "page-"+id.Short()+"-"+string(rune('a'+i)))
		}
		all := waitForEvents(t, tn.Admin, filter{EventType: new("create-group")}, 5)
		require.Len(t, all, 5)

		// Action
		var paged []entry
		for _, offset := range []float32{0, 2, 4, 6} {
			paged = append(paged, events(t, tn.Admin, filter{
				EventType: new("create-group"),
				Offset:    new(offset),
				Limit:     new(float32(2)),
			})...)
		}

		// Assert
		pagedIDs := ids(paged)
		require.Equal(t, ids(all), pagedIDs)
		slices.Sort(pagedIDs)
		require.Len(t, slices.Compact(pagedIDs), 5)
	})
}
