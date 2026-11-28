package organization_test

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/fixture"
	"github.com/Infisical/infisical/tests/harness"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/Infisical/infisical/tests/internal/apierr"
	"github.com/stretchr/testify/require"
)

// billingServer is the License Server's side of one tenant's billing.
type billingServer struct {
	*fakenet.Scope[license.State]
	orgID string
}

func openBilling(t *testing.T, tn *harness.Tenant) billingServer {
	t.Helper()
	return billingServer{Scope: fixture.LicenseServer(t, tn, tn.OrgID), orgID: tn.OrgID.String()}
}

func (b billingServer) seed(t *testing.T, state license.BillingState) {
	t.Helper()
	b.Seed(t, license.SeedBilling(state))
}

func (b billingServer) script(t *testing.T, op license.Op, reply license.Reply) {
	t.Helper()
	b.seed(t, license.BillingState{Results: map[license.Op]license.Reply{op: reply}})
}

// path is a License Server path under this org.
func (b billingServer) path(suffix string) string {
	return "/v1/organizations/" + b.orgID + suffix
}

// refuse makes the License Server answer a request with a status and the error body the
// instance parses.
func (b billingServer) refuse(t *testing.T, method, suffix string, status int, body string) {
	t.Helper()
	b.Fail(t, method, b.path(suffix), status, fakenet.Body(body))
}

// sent is what the instance asked the License Server to do for op.
func (b billingServer) sent(t *testing.T, op license.Op) []license.Request {
	t.Helper()
	return b.State(t).RequestsFor(op)
}

// requireNothingSent proves no change reached the License Server.
func (b billingServer) requireNothingSent(t *testing.T) {
	t.Helper()
	require.Empty(t, b.State(t).Billing.Requests, "no billing mutation may reach the License Server")
}

// proCatalog is one self-serve product, secret-manager, priced per identity.
func proCatalog() *license.Catalog {
	return &license.Catalog{Products: []license.CatalogProduct{
		license.SelfServeProduct("secret-manager", "Secrets Management",
			license.PerResourceDimension("identities", "Machine identities", "machine identity")),
	}}
}

func activeSubscription() *license.Subscription {
	return &license.Subscription{
		Status: "active",
		Items: []license.SubscriptionItem{{
			ProductID: "secret-manager",
			Plan:      "pro",
			Status:    "active",
			Dimensions: []license.SubscriptionDimension{
				{Key: "identities", Unit: "machine identity", Cadence: "monthly", Used: 3, Limit: license.Int(10)},
			},
		}},
	}
}

func requireOK(t *testing.T, status int, body []byte) {
	t.Helper()
	requireStatus(t, http.StatusOK, status, body)
}

// apiError is the part of an error body a billing caller reads.
type apiError struct {
	Message any    `json:"message"`
	Error   string `json:"error"`
	Details struct {
		Code string `json:"code"`
	} `json:"details"`
}

func errorOf(t *testing.T, body []byte) apiError {
	t.Helper()
	var e apiError
	require.NoErrorf(t, json.Unmarshal(body, &e), "not an error body: %s", apierr.Body(body))
	return e
}

// text is the error's message, or the JSON of it when a schema failure sends a list.
func (e apiError) text() string {
	if s, ok := e.Message.(string); ok {
		return s
	}
	out, _ := json.Marshal(e.Message)
	return string(out)
}

func jsonBody(s string) io.Reader { return strings.NewReader(s) }

// returnURL is where the License Server is told to send the customer back to.
func returnURL(t *testing.T, tn *harness.Tenant, path string) string {
	t.Helper()
	if path == "" {
		path = "/organizations/" + tn.OrgID.String() + "/billing"
	}
	return harness.From(t).App().SiteURL() + path
}
