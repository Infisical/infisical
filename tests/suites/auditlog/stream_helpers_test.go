package auditlog_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/Infisical/infisical/tests/fakes/webhook"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/Infisical/infisical/tests/internal/wait"
	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
)

type header struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

type streamOpts struct {
	headers  []header
	products []string
}

type streamOpt func(*streamOpts)

func withHeader(key, value string) streamOpt {
	return func(o *streamOpts) { o.headers = append(o.headers, header{key, value}) }
}

func withProducts(products ...string) streamOpt {
	return func(o *streamOpts) { o.products = products }
}

func customStreamBody(url string, opts ...streamOpt) map[string]any {
	o := streamOpts{headers: []header{}}
	for _, opt := range opts {
		opt(&o)
	}
	body := map[string]any{"credentials": map[string]any{"url": url, "headers": o.headers}}
	if o.products != nil {
		body["filters"] = map[string]any{"products": o.products}
	}
	return body
}

func createCustomStream(t *testing.T, actor *harness.Principal, url string, opts ...streamOpt) (int, []byte) {
	t.Helper()
	res, err := actor.API.CreateCustomAuditLogStreamWithBodyWithResponse(t.Context(), "application/json",
		jsonBody(t, customStreamBody(url, opts...)))
	require.NoError(t, err)
	return res.StatusCode(), res.Body
}

// newCustomStream creates a stream and returns its id. Creation sends a test delivery,
// so the sink has to answer it.
func newCustomStream(t *testing.T, tn *harness.Tenant, sink *fixture.WebhookSink, opts ...streamOpt) uuid.UUID {
	t.Helper()
	res, err := tn.Admin.API.CreateCustomAuditLogStreamWithBodyWithResponse(t.Context(), "application/json",
		jsonBody(t, customStreamBody(sink.URL, opts...)))
	require.NoError(t, err)
	require.NotNilf(t, res.JSON200, "creating a stream returned %d: %s", res.StatusCode(), apierr.Body(res.Body))
	return res.JSON200.AuditLogStream.Id
}

// streams lists the org's streams as raw objects: the list is a union of every
// provider's shape.
func streams(t *testing.T, tn *harness.Tenant) []map[string]any {
	t.Helper()
	res, err := tn.Admin.API.ListAuditLogStreamsWithResponse(t.Context())
	require.NoError(t, err)
	require.Equalf(t, http.StatusOK, res.StatusCode(), "listing streams: %s", apierr.Body(res.Body))
	var out struct {
		AuditLogStreams []map[string]any `json:"auditLogStreams"`
	}
	require.NoError(t, json.Unmarshal(res.Body, &out))
	return out.AuditLogStreams
}

// streamedLog is one audit log as a stream delivers it.
type streamedLog struct {
	ID            string         `json:"id"`
	OrgID         string         `json:"orgId"`
	EventType     string         `json:"eventType"`
	EventMetadata map[string]any `json:"eventMetadata"`
}

// batch decodes a delivery as a batch of logs. The test delivery sent on create and
// update is a single object, so it is not a batch.
func batch(body string) ([]streamedLog, bool) {
	var logs []streamedLog
	if json.Unmarshal([]byte(body), &logs) != nil {
		return nil, false
	}
	return logs, true
}

// carries matches a batch holding an event of the type whose metadata field has the
// value.
func carries(eventType, field, value string) func(webhook.DeliveryReceived) bool {
	return func(d webhook.DeliveryReceived) bool {
		logs, ok := batch(d.Body)
		return ok && slices.ContainsFunc(logs, func(l streamedLog) bool {
			return l.EventType == eventType && l.EventMetadata[field] == value
		})
	}
}

func isPing(d webhook.DeliveryReceived) bool {
	return strings.Contains(d.Body, `"ping":"ok"`)
}

// waitForDelivered polls the sink until every group name has arrived in a batch the
// sink answered with 200, and returns those deliveries.
func waitForDelivered(t *testing.T, sink *fixture.WebhookSink, names ...string) []webhook.Delivery {
	t.Helper()
	got, err := wait.For(t.Context(), func(context.Context) ([]webhook.Delivery, bool, error) {
		var hits []webhook.Delivery
		seen := map[string]bool{}
		for _, d := range sink.Deliveries(t) {
			logs, ok := batch(d.Body)
			if !ok || d.Status != http.StatusOK {
				continue
			}
			hit := false
			for _, l := range logs {
				name, _ := l.EventMetadata["name"].(string)
				if l.EventType == "create-group" && slices.Contains(names, name) {
					seen[name] = true
					hit = true
				}
			}
			if hit {
				hits = append(hits, d)
			}
		}
		return hits, len(seen) == len(names), nil
	}, wait.Timeout(45*time.Second))
	require.NoErrorf(t, err, "waiting for groups %v to be streamed", names)
	return got
}

func deliveryOf(t *testing.T, d webhook.Delivery) string {
	t.Helper()
	return fmt.Sprintf("%s %s answered %d: %s", d.Method, d.Path, d.Status, d.Body)
}
