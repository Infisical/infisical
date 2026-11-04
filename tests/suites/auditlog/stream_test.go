package auditlog_test

import (
	"context"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/azure"
	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/fixture/secretmanager"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/id"
	"github.com/Infisical/infisical/tests/internal/spec"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

// A stream delivers about 5s after the log is written (the write queue's tick) plus
// a 5s flush debounce.
const streamDelivery = 30 * time.Second

func TestAuditLogStream_Create(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should refuse when the plan does not include streams", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().Without(license.AuditLogStreams)))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)

		// Action
		status, body := createCustomStream(t, tn.Admin, sink.URL)

		// Assert
		require.Equalf(t, http.StatusBadRequest, status, "%s", apierr.Body(body))
		require.Equal(t, "Failed to create Audit Log Stream: Plan restriction. Upgrade plan to continue.", apierr.Message(body))
		require.Empty(t, streams(t, tn))
	})

	t.Run("should refuse a stream past the plan's stream limit and keep the existing one", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t, harness.WithPlan(license.Enterprise().With(license.AuditLogStreamLimit, 1)))
		first := fixture.NewWebhookSink(t, tn, webhook.Service)
		second := fixture.NewWebhookSink(t, tn, webhook.Service)
		kept := newCustomStream(t, tn, first)

		// Action
		status, body := createCustomStream(t, tn.Admin, second.URL)

		// Assert
		require.Equalf(t, http.StatusBadRequest, status, "%s", apierr.Body(body))
		require.Equal(t, "Failed to create Audit Log Stream: Plan limit reached. Contact Infisical to increase quota.", apierr.Message(body))
		got := streams(t, tn)
		require.Len(t, got, 1)
		require.Equal(t, kept.String(), got[0]["id"])
	})

	t.Run("should refuse a URL nothing listens on and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)

		// Action
		status, body := createCustomStream(t, tn.Admin, "https://"+webhook.Service.Host()+":9/"+id.Short())

		// Assert
		require.Equalf(t, http.StatusBadRequest, status, "%s", apierr.Body(body))
		require.True(t, strings.HasPrefix(apierr.Message(body), "Failed to connect with upstream source"), apierr.Message(body))
		require.Empty(t, streams(t, tn))
	})

	t.Run("should refuse a URL whose test delivery fails and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		sink.Seed(t, webhook.Respond(http.StatusInternalServerError))

		// Action
		status, body := createCustomStream(t, tn.Admin, sink.URL)

		// Assert
		require.Equalf(t, http.StatusBadRequest, status, "%s", apierr.Body(body))
		require.True(t, strings.HasPrefix(apierr.Message(body), "Failed to connect with upstream source"), apierr.Message(body))
		require.Empty(t, streams(t, tn))
	})

	t.Run("should refuse a header value with CR or LF and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)

		// Action
		status, body := createCustomStream(t, tn.Admin, sink.URL, withHeader("X-Injected", "a\r\nX-Evil: b"))

		// Assert
		require.Equalf(t, http.StatusUnprocessableEntity, status, "%s", apierr.Body(body))
		require.Contains(t, string(body), "Header values cannot contain newlines or carriage returns")
		require.Empty(t, streams(t, tn))
		sink.ExpectNoEvent[webhook.DeliveryReceived](t, nil)
	})

	t.Run("should refuse a member without settings create and store nothing", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		member := tn.NewMachineIdentity(t, harness.OrgRole("member"))
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)

		// Action
		status, body := createCustomStream(t, member, sink.URL)

		// Assert
		require.Equalf(t, http.StatusForbidden, status, "%s", apierr.Body(body))
		require.Empty(t, streams(t, tn))
		sink.ExpectNoEvent[webhook.DeliveryReceived](t, nil)
	})
}

func TestAuditLogStream_Credentials(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should mask custom header values in every read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		secret := "hdr-" + id.Short() + id.Short()

		// Action
		created, err := tn.Admin.API.CreateCustomAuditLogStreamWithBodyWithResponse(t.Context(), "application/json",
			jsonBody(t, customStreamBody(sink.URL, withHeader("X-Stream-Token", secret))))
		require.NoError(t, err)
		require.NotNilf(t, created.JSON200, "creating a stream returned %d: %s", created.StatusCode(), apierr.Body(created.Body))
		got, err := tn.Admin.API.GetCustomAuditLogStreamWithResponse(t.Context(), created.JSON200.AuditLogStream.Id)
		require.NoError(t, err)
		require.NotNilf(t, got.JSON200, "reading the stream returned %d: %s", got.StatusCode(), apierr.Body(got.Body))
		listed := streams(t, tn)

		// Assert
		require.Equal(t, "******", created.JSON200.AuditLogStream.Credentials.Headers[0].Value)
		require.Equal(t, "******", got.JSON200.AuditLogStream.Credentials.Headers[0].Value)
		require.Len(t, listed, 1)
		for name, body := range map[string]string{
			"create": string(created.Body), "get": string(got.Body), "list": jsonString(t, listed),
		} {
			require.NotContainsf(t, body, secret, "%s revealed the header value", name)
			require.Containsf(t, body, "X-Stream-Token", "%s dropped the header key", name)
		}
	})

	t.Run("should omit a Datadog token in every read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		token := strings.Repeat("ab12", 8)

		// Action
		created, err := tn.Admin.API.CreateDatadogAuditLogStreamWithBodyWithResponse(t.Context(), "application/json",
			jsonBody(t, map[string]any{"credentials": map[string]any{"url": sink.URL, "token": token}}))
		require.NoError(t, err)
		require.NotNilf(t, created.JSON200, "creating a stream returned %d: %s", created.StatusCode(), apierr.Body(created.Body))
		got, err := tn.Admin.API.GetDatadogAuditLogStreamWithResponse(t.Context(), created.JSON200.AuditLogStream.Id)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, got.StatusCode(), "reading the stream: %s", apierr.Body(got.Body))
		listed := streams(t, tn)

		// Assert
		require.Equal(t, token, sink.ExpectEvent[webhook.DeliveryReceived](t, isPing).Header.Get("DD-API-KEY"),
			"the test delivery should carry the token")
		require.Len(t, listed, 1)
		for name, body := range map[string]string{
			"create": string(created.Body), "get": string(got.Body), "list": jsonString(t, listed),
		} {
			require.NotContainsf(t, body, token, "%s revealed the token", name)
			require.Containsf(t, body, sink.URL, "%s dropped the URL", name)
		}
	})

	t.Run("should omit a Cribl token in every read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		token := strings.Repeat("cd34", 8)

		// Action
		created, err := tn.Admin.API.CreateCriblAuditLogStreamWithBodyWithResponse(t.Context(), "application/json",
			jsonBody(t, map[string]any{"credentials": map[string]any{"url": sink.URL, "token": token}}))
		require.NoError(t, err)
		require.NotNilf(t, created.JSON200, "creating a stream returned %d: %s", created.StatusCode(), apierr.Body(created.Body))
		got, err := tn.Admin.API.GetCriblAuditLogStreamWithResponse(t.Context(), created.JSON200.AuditLogStream.Id)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, got.StatusCode(), "reading the stream: %s", apierr.Body(got.Body))
		listed := streams(t, tn)

		// Assert
		require.Equal(t, "Bearer "+token, sink.ExpectEvent[webhook.DeliveryReceived](t, isPing).Header.Get("Authorization"),
			"the test delivery should carry the token")
		require.Len(t, listed, 1)
		for name, body := range map[string]string{
			"create": string(created.Body), "get": string(got.Body), "list": jsonString(t, listed),
		} {
			require.NotContainsf(t, body, token, "%s revealed the token", name)
			require.Containsf(t, body, sink.URL, "%s dropped the URL", name)
		}
	})

	t.Run("should redact a Sumo Logic token in every read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		token := strings.Repeat("ef56", 8)

		// Action
		created, err := tn.Admin.API.CreateSumoLogicAuditLogStreamWithBodyWithResponse(t.Context(), "application/json",
			jsonBody(t, map[string]any{"credentials": map[string]any{"url": sink.URL, "token": token}}))
		require.NoError(t, err)
		require.NotNilf(t, created.JSON200, "creating a stream returned %d: %s", created.StatusCode(), apierr.Body(created.Body))
		got, err := tn.Admin.API.GetSumoLogicAuditLogStreamWithResponse(t.Context(), created.JSON200.AuditLogStream.Id)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, got.StatusCode(), "reading the stream: %s", apierr.Body(got.Body))
		listed := streams(t, tn)

		// Assert
		require.Equal(t, token, sink.ExpectEvent[webhook.DeliveryReceived](t, isPing).Header.Get("X-Sumo-Token"),
			"the test delivery should carry the token")
		require.Len(t, listed, 1)
		for name, body := range map[string]string{
			"create": string(created.Body), "get": string(got.Body), "list": jsonString(t, listed),
		} {
			require.NotContainsf(t, body, token, "%s revealed the token", name)
			require.Containsf(t, body, sink.URL, "%s dropped the URL", name)
		}
	})

	t.Run("should omit a Splunk HEC token in every read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sink := fixture.NewSplunkSink(t, tn)

		// Action
		created, err := tn.Admin.API.CreateSplunkAuditLogStreamWithBodyWithResponse(t.Context(), "application/json",
			jsonBody(t, map[string]any{"credentials": map[string]any{"hostname": webhook.Splunk.Host(), "port": 443, "token": sink.Token}}))
		require.NoError(t, err)
		require.NotNilf(t, created.JSON200, "creating a stream returned %d: %s", created.StatusCode(), apierr.Body(created.Body))
		got, err := tn.Admin.API.GetSplunkAuditLogStreamWithResponse(t.Context(), created.JSON200.AuditLogStream.Id)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, got.StatusCode(), "reading the stream: %s", apierr.Body(got.Body))
		listed := streams(t, tn)

		// Assert
		require.Equal(t, "Splunk "+sink.Token, sink.ExpectEvent[webhook.DeliveryReceived](t, isPing).Header.Get("Authorization"),
			"the test delivery should carry the token")
		require.Len(t, listed, 1)
		for name, body := range map[string]string{
			"create": string(created.Body), "get": string(got.Body), "list": jsonString(t, listed),
		} {
			require.NotContainsf(t, body, sink.Token, "%s revealed the token", name)
			require.Containsf(t, body, webhook.Splunk.Host(), "%s dropped the hostname", name)
		}
	})

	t.Run("should omit an Azure Monitor client secret in every read", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		tenantID, clientID := uuid.NewString(), uuid.NewString()
		entra := azure.Open(t, fixture.FakenetAdmin(t, tn), tenantID)
		secret := strings.Repeat("Az9~", 10)

		// Action
		created, err := tn.Admin.API.CreateAzureAuditLogStreamWithBodyWithResponse(t.Context(), "application/json",
			jsonBody(t, map[string]any{"credentials": map[string]any{
				"tenantId": tenantID, "clientId": clientID, "clientSecret": secret,
				"dceUrl": sink.URL, "dcrId": "dcr-" + strings.Repeat("0a", 16), "cltName": "Infisical",
			}}))
		require.NoError(t, err)
		require.NotNilf(t, created.JSON200, "creating a stream returned %d: %s", created.StatusCode(), apierr.Body(created.Body))
		got, err := tn.Admin.API.GetAzureAuditLogStreamWithResponse(t.Context(), created.JSON200.AuditLogStream.Id)
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, got.StatusCode(), "reading the stream: %s", apierr.Body(got.Body))
		listed := streams(t, tn)

		// Assert
		require.Equal(t, "Bearer azure-"+clientID, sink.ExpectEvent[webhook.DeliveryReceived](t, isPing).Header.Get("Authorization"),
			"the test delivery should carry the token Entra issued for the client secret")
		// Later deliveries (the tenant's own audit events) can fetch more tokens, so require the grant, not a count.
		require.Contains(t, entra.State(t).SecretGrants, azure.SecretGrant{ClientID: clientID, Scope: "https://monitor.azure.com/.default"})
		require.Len(t, listed, 1)
		for name, body := range map[string]string{
			"create": string(created.Body), "get": string(got.Body), "list": jsonString(t, listed),
		} {
			require.NotContainsf(t, body, secret, "%s revealed the client secret", name)
			require.Containsf(t, body, clientID, "%s dropped the client id", name)
		}
	})

	t.Run("should keep a masked header's stored value when it is sent back on update", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		secret := "hdr-" + id.Short() + id.Short()
		streamID := newCustomStream(t, tn, sink, withHeader("X-Stream-Token", secret))
		mark := sink.Mark(t)

		// Action
		res, err := tn.Admin.API.UpdateCustomAuditLogStreamWithBodyWithResponse(t.Context(), streamID, "application/json",
			jsonBody(t, customStreamBody(sink.URL, withHeader("X-Stream-Token", "******"))))

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		ping := sink.ExpectEvent[webhook.DeliveryReceived](t, isPing, fakenet.Since(mark))
		require.Equal(t, secret, ping.Header.Get("X-Stream-Token"))
		name := "after-update-" + id.Short()
		createGroup(t, tn.Admin, name)
		streamed := sink.ExpectEvent[webhook.DeliveryReceived](t, carries("create-group", "name", name), fakenet.Within(streamDelivery))
		require.Equal(t, secret, streamed.Header.Get("X-Stream-Token"))
	})
}

func TestAuditLogStream_Delivery(t *testing.T) {
	t.Parallel()
	h := harness.From(t)

	t.Run("should deliver events in batches with the configured headers", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		newCustomStream(t, tn, sink, withHeader("X-Stream-Token", "configured"))
		first, second := "first-"+id.Short(), "second-"+id.Short()

		// Action
		createGroup(t, tn.Admin, first)
		createGroup(t, tn.Admin, second)

		// Assert
		got := waitForDelivered(t, sink, first, second)
		for _, d := range got {
			require.Equal(t, http.MethodPost, d.Method, deliveryOf(t, d))
			require.Equal(t, "configured", d.Header.Get("X-Stream-Token"), deliveryOf(t, d))
			require.Contains(t, d.Header.Get("Content-Type"), "application/json", deliveryOf(t, d))
			logs, _ := batch(d.Body)
			for _, l := range logs {
				require.Equal(t, tn.OrgID.String(), l.OrgID, deliveryOf(t, d))
			}
		}
	})

	t.Run("should deliver only the products in the filter", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		newCustomStream(t, tn, sink, withProducts("secret-manager"))
		proj := fixture.NewProject(t, tn, fixture.WithProjectType("secret-manager"))
		orgLevel := "org-level-" + id.Short()
		createGroup(t, tn.Admin, orgLevel)
		waitForEvent(t, tn.Admin, "create-group", func(e entry) bool { return e.Metadata["name"] == orgLevel })

		// Action
		secretmanager.CreateSecret(t, proj, "dev", "STREAMED", "v")

		// Assert
		sink.ExpectEvent[webhook.DeliveryReceived](t, carries("create-secret", "secretKey", "STREAMED"), fakenet.Within(streamDelivery))
		sink.ExpectNoEvent[webhook.DeliveryReceived](t, carries("create-group", "name", orgLevel))
	})

	t.Run("should retry a batch the receiver answered with 500 and deliver it once it recovers", func(t *testing.T) {
		t.Parallel()
		spec.Why(t, `One delivery attempt is four POSTs: the HTTP client itself retries a 5xx three
			times within about a second. Only once all four fail does the outbox schedule the
			batch again, after a 30s backoff plus up to 15s of jitter, and only a later flush
			picks it up, so the test keeps writing events to wake the stream.`)

		// Setup
		tn := h.NewTenant(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		newCustomStream(t, tn, sink)
		sink.Seed(t, webhook.Respond(http.StatusInternalServerError))
		name := "retried-" + id.Short()
		createGroup(t, tn.Admin, name)
		refused := func(d webhook.DeliveryReceived) bool {
			return d.Status == http.StatusInternalServerError && carries("create-group", "name", name)(d)
		}
		sink.ExpectEvent[webhook.DeliveryReceived](t, refused, fakenet.Within(streamDelivery))
		for range 3 {
			sink.ExpectEvent[webhook.DeliveryReceived](t, refused)
		}

		// Action
		sink.Seed(t, webhook.Respond(http.StatusOK))

		// Assert
		delivered, err := wait.For(t.Context(), func(ctx context.Context) (int, bool, error) {
			_, _, err := listLogs(ctx, tn.Admin.API, filter{EventType: new("view-audit-logs")})
			n := 0
			for _, d := range sink.Deliveries(t) {
				if d.Status == http.StatusOK && carries("create-group", "name", name)(webhook.DeliveryReceived{Delivery: d}) {
					n++
				}
			}
			return n, n > 0, err
		}, wait.Timeout(75*time.Second), wait.Interval(3*time.Second))
		require.NoError(t, err, "the failed batch was never delivered after the receiver recovered")
		require.Equal(t, 1, delivered, "the recovered batch was delivered more than once")
	})

	t.Run("should stop delivering once the stream is deleted", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		streamID := newCustomStream(t, tn, sink)
		before := "before-" + id.Short()
		createGroup(t, tn.Admin, before)
		sink.ExpectEvent[webhook.DeliveryReceived](t, carries("create-group", "name", before), fakenet.Within(streamDelivery))

		// Action
		res, err := tn.Admin.API.DeleteCustomAuditLogStreamWithResponse(t.Context(), streamID)

		// Assert
		require.NoError(t, err)
		require.Equalf(t, http.StatusOK, res.StatusCode(), "%s", apierr.Body(res.Body))
		require.Empty(t, streams(t, tn))
		after := "after-" + id.Short()
		createGroup(t, tn.Admin, after)
		waitForEvent(t, tn.Admin, "create-group", func(e entry) bool { return e.Metadata["name"] == after })
		sink.ExpectNoEvent[webhook.DeliveryReceived](t, carries("create-group", "name", after), fakenet.Within(12*time.Second))
	})

	t.Run("should never deliver another org's events", func(t *testing.T) {
		t.Parallel()

		// Setup
		tn := h.NewTenant(t)
		other := h.NewTenant(t)
		sink := fixture.NewWebhookSink(t, tn, webhook.Service)
		newCustomStream(t, tn, sink)
		theirs := "theirs-" + id.Short()
		createGroup(t, other.Admin, theirs)
		waitForEvent(t, other.Admin, "create-group", func(e entry) bool { return e.Metadata["name"] == theirs })

		// Action
		ours := "ours-" + id.Short()
		createGroup(t, tn.Admin, ours)

		// Assert
		sink.ExpectEvent[webhook.DeliveryReceived](t, carries("create-group", "name", ours), fakenet.Within(streamDelivery))
		sink.ExpectNoEvent[webhook.DeliveryReceived](t, func(d webhook.DeliveryReceived) bool {
			logs, _ := batch(d.Body)
			return strings.Contains(d.Body, theirs) || slices.ContainsFunc(logs, func(l streamedLog) bool {
				return l.OrgID == other.OrgID.String()
			})
		})
	})
}
