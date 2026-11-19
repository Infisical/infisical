package webhook_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

// stack is fakenet in-process: the fake-serving handler and its control API.
type stack struct {
	fakes *httptest.Server
	admin string
}

func newStack(t *testing.T) stack {
	t.Helper()
	srv := fakenet.New(webhook.Service, webhook.Slack)
	fakes := httptest.NewServer(srv)
	t.Cleanup(fakes.Close)
	admin := httptest.NewServer(srv.Admin(nil))
	t.Cleanup(admin.Close)
	require.NoError(t, fakenet.Listen(t.Context(), admin.URL, ""))
	return stack{fakes: fakes, admin: admin.URL}
}

// open tracks a nonce on a sink and returns its control plane, the way the fixture
// does before a URL reaches Infisical.
func (s stack) open(t *testing.T, sink webhook.Sink, nonce string) *webhook.ControlPlane {
	t.Helper()
	fakenet.Track(t, s.admin, sink.Host(), nonce)
	return webhook.Open(t, s.admin, sink, nonce)
}

// post sends a delivery to a sink URL through the in-process server, keeping the
// sink's hostname as the Host header the way DNS interception does.
func (s stack) post(t *testing.T, sinkURL, body string, header map[string]string) (int, string) {
	t.Helper()
	u, err := url.Parse(sinkURL)
	require.NoError(t, err)
	req, err := http.NewRequestWithContext(t.Context(), http.MethodPost, s.fakes.URL+u.Path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = u.Host
	for k, v := range header {
		req.Header.Set(k, v)
	}
	res, err := s.fakes.Client().Do(req)
	require.NoError(t, err)
	defer func() { _ = res.Body.Close() }()
	out, err := io.ReadAll(res.Body)
	require.NoError(t, err)
	return res.StatusCode, string(out)
}

func TestWebhookFake_Deliveries(t *testing.T) {
	t.Run("should keep a delivery and answer 200 when a generic sink receives one", func(t *testing.T) {
		// Setup
		s := newStack(t)
		sink := s.open(t, webhook.Service, "nonce-a")

		// Action
		code, _ := s.post(t, webhook.Service.URL("nonce-a"), `{"event":"test"}`,
			map[string]string{"Content-Type": "application/json", "X-Infisical-Signature": "t=1;abc"})

		// Assert
		require.Equal(t, http.StatusOK, code)
		got := sink.Deliveries(t)
		require.Len(t, got, 1)
		require.Equal(t, http.MethodPost, got[0].Method)
		require.Equal(t, "/nonce-a", got[0].Path)
		require.Equal(t, `{"event":"test"}`, got[0].Body)
		require.Equal(t, "t=1;abc", got[0].Header.Get("X-Infisical-Signature"))
	})

	t.Run("should publish a delivery-received event carrying the method, path, headers and body", func(t *testing.T) {
		// Setup
		s := newStack(t)
		sink := s.open(t, webhook.Service, "nonce-a")

		// Action
		s.post(t, webhook.Service.URL("nonce-a")+"/deep/path", `{"n":1}`, map[string]string{"X-Trace": "abc"})

		// Assert
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, nil)
		require.Equal(t, http.MethodPost, got.Method)
		require.Equal(t, "/nonce-a/deep/path", got.Path)
		require.Equal(t, "abc", got.Header.Get("X-Trace"))
		require.Equal(t, `{"n":1}`, got.Body)
		require.Equal(t, http.StatusOK, got.Status)
	})

	t.Run("should answer the seeded status and still keep the delivery", func(t *testing.T) {
		// Setup
		s := newStack(t)
		sink := s.open(t, webhook.Service, "nonce-a")
		sink.Seed(t, webhook.Respond(http.StatusInternalServerError))

		// Action
		code, _ := s.post(t, webhook.Service.URL("nonce-a"), `{}`, nil)

		// Assert
		require.Equal(t, http.StatusInternalServerError, code)
		got := sink.ExpectEvent[webhook.DeliveryReceived](t, nil)
		require.Equal(t, http.StatusInternalServerError, got.Status)
		require.Len(t, sink.Deliveries(t), 1)
	})

	t.Run("should keep endpoints apart when two nonces share the host", func(t *testing.T) {
		// Setup
		s := newStack(t)
		a := s.open(t, webhook.Service, "nonce-a")
		b := s.open(t, webhook.Service, "nonce-b")

		// Action
		s.post(t, webhook.Service.URL("nonce-a"), `{}`, nil)

		// Assert
		require.Len(t, a.Deliveries(t), 1)
		require.Empty(t, b.Deliveries(t), "nonce b received nonce a's delivery")
	})

	t.Run("should refuse a delivery when the path carries no nonce", func(t *testing.T) {
		// Setup
		s := newStack(t)

		// Action
		code, body := s.post(t, "https://"+webhook.Service.Host()+"/", `{}`, nil)

		// Assert
		require.Equalf(t, http.StatusNotImplemented, code, "%s", body)
	})
}

func TestWebhookFake_Slack(t *testing.T) {
	t.Run("should answer ok when the body has text", func(t *testing.T) {
		// Setup
		s := newStack(t)
		sink := s.open(t, webhook.Slack, "nonce-a")

		// Action
		code, body := s.post(t, webhook.Slack.URL("nonce-a"), `{"text":"hello"}`, nil)

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Equal(t, "ok", body)
		require.Len(t, sink.Deliveries(t), 1)
	})

	t.Run("should refuse with no_text and keep the delivery when the body has no text", func(t *testing.T) {
		// Setup
		s := newStack(t)
		sink := s.open(t, webhook.Slack, "nonce-a")

		// Action
		code, body := s.post(t, webhook.Slack.URL("nonce-a"), `{"event":"test"}`, nil)

		// Assert
		require.Equal(t, http.StatusBadRequest, code)
		require.Equal(t, "no_text", body)
		require.Equal(t, http.StatusBadRequest, sink.Deliveries(t)[0].Status)
	})

	t.Run("should refuse a path outside /services when it is sent to hooks.slack.com", func(t *testing.T) {
		// Setup
		s := newStack(t)

		// Action
		code, body := s.post(t, "https://"+webhook.Slack.Host()+"/nonce-a", `{"text":"hello"}`, nil)

		// Assert
		require.Equalf(t, http.StatusNotImplemented, code, "%s", body)
	})
}
