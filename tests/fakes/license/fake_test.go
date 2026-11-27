package license_test

import (
	"crypto"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/Infisical/infisical/tests/fakes/license"
	"github.com/Infisical/infisical/tests/infra/fakenet"
	"github.com/stretchr/testify/require"
)

type stack struct {
	fakes *httptest.Server
	admin string
}

func newStack(t *testing.T) stack {
	t.Helper()
	srv := fakenet.New(license.Service)
	fakes := httptest.NewServer(srv)
	t.Cleanup(fakes.Close)
	admin := httptest.NewServer(srv.Admin(nil))
	t.Cleanup(admin.Close)
	require.NoError(t, fakenet.Listen(t.Context(), admin.URL, "binary-", license.Host))
	return stack{fakes: fakes, admin: admin.URL}
}

func (s stack) call(t *testing.T, method, path, body string, header map[string]string) (int, string) {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, s.fakes.URL+path, strings.NewReader(body))
	require.NoError(t, err)
	req.Host = license.Host
	req.Header.Set("Content-Type", "application/json")
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

func TestLicenseFake_Usage(t *testing.T) {
	t.Run("should keep a snapshot and publish it when an organization reports usage", func(t *testing.T) {
		// Setup
		s := newStack(t)
		org := license.Open(t, s.admin, "11111111-1111-1111-1111-111111111111")

		// Action
		code, _ := s.call(t, http.MethodPost, "/v1/organizations/11111111-1111-1111-1111-111111111111/usage-snapshots",
			`{"snapshots":[{"dimension_key":"user_identities","value":3,"observed_at":"2026-01-01T00:00:00Z","idempotency_key":"k","source":"cloud"}]}`, nil)

		// Assert
		require.Equal(t, http.StatusOK, code)
		got := org.ExpectEvent[license.SnapshotReceived](t, func(e license.SnapshotReceived) bool {
			return e.Dimension == "user_identities"
		})
		require.Equal(t, float64(3), got.Value)
		require.Len(t, org.State(t).Snapshots, 1)
	})

	t.Run("should keep one event and answer deduped when the same event id is sent twice", func(t *testing.T) {
		// Setup
		s := newStack(t)
		org := license.Open(t, s.admin, "22222222-2222-2222-2222-222222222222")
		body := `{"events":[{"event_id":"e1","dimension_key":"session_logs","quantity":1,"occurred_at":"2026-01-01T00:00:00Z","source":"cloud"}]}`
		s.call(t, http.MethodPost, "/v1/organizations/22222222-2222-2222-2222-222222222222/usage-events", body, nil)

		// Action
		code, out := s.call(t, http.MethodPost, "/v1/organizations/22222222-2222-2222-2222-222222222222/usage-events", body, nil)

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.Contains(t, out, `"status":"deduped"`)
		require.Len(t, org.State(t).UsageEvents, 1)
	})
}

func TestLicenseFake_SelfHosted(t *testing.T) {
	t.Run("should serve the license's plan to the token a login returned", func(t *testing.T) {
		// Setup
		s := newStack(t)
		key := license.Open(t, s.admin, "binary-key-a")
		key.Seed(t, license.Free)
		_, out := s.call(t, http.MethodPost, "/api/auth/v1/license-login", "{}", map[string]string{"X-API-KEY": "binary-key-a"})
		var login struct {
			Token string `json:"token"`
		}
		require.NoError(t, json.Unmarshal([]byte(out), &login))

		// Action
		code, body := s.call(t, http.MethodGet, "/v1/entitlements", "", map[string]string{"Authorization": "Bearer " + login.Token})

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.JSONEq(t, `{"features":{},"products":[]}`, body)
		require.Equal(t, 1, key.State(t).Logins)
	})

	t.Run("should attribute a self-hosted usage report to the license, not the organization in the path", func(t *testing.T) {
		// Setup
		s := newStack(t)
		key := license.Open(t, s.admin, "binary-key-b")
		_, out := s.call(t, http.MethodPost, "/api/auth/v1/license-login", "{}", map[string]string{"X-API-KEY": "binary-key-b"})
		var login struct {
			Token string `json:"token"`
		}
		require.NoError(t, json.Unmarshal([]byte(out), &login))

		// Action
		s.call(t, http.MethodPost, "/v1/organizations/self-hosted/usage-snapshots",
			`{"snapshots":[{"dimension_key":"identities","value":1,"observed_at":"x","idempotency_key":"k","source":"self-hosted"}]}`,
			map[string]string{"Authorization": "Bearer " + login.Token})

		// Assert
		require.Len(t, key.State(t).Snapshots, 1)
	})
}

func TestLicenseFake_Billing(t *testing.T) {
	const org = "33333333-3333-3333-3333-333333333333"
	path := func(suffix string) string { return "/v1/organizations/" + org + suffix }

	t.Run("should answer an empty catalog, no subscription, no profile and no trials when nothing is seeded", func(t *testing.T) {
		// Setup
		s := newStack(t)
		license.Open(t, s.admin, org)

		// Action
		catalog, catalogBody := s.call(t, http.MethodGet, path("/products"), "", nil)
		subscription, _ := s.call(t, http.MethodGet, path("/subscription"), "", nil)
		profile, _ := s.call(t, http.MethodGet, path("/billing/profile"), "", nil)
		trials, trialsBody := s.call(t, http.MethodGet, path("/billing/trials"), "", nil)

		// Assert
		require.Equal(t, http.StatusOK, catalog)
		require.JSONEq(t, `{"products":[]}`, catalogBody)
		require.Equal(t, http.StatusNotFound, subscription)
		require.Equal(t, http.StatusNotFound, profile)
		require.Equal(t, http.StatusOK, trials)
		require.JSONEq(t, `{"trials":[]}`, trialsBody)
	})

	t.Run("should serve a seeded catalog with every list the instance requires present", func(t *testing.T) {
		// Setup
		s := newStack(t)
		sc := license.Open(t, s.admin, org)
		sc.Seed(t, license.SeedBilling(license.BillingState{Catalog: &license.Catalog{Products: []license.CatalogProduct{
			license.SelfServeProduct("secret-manager", "Secrets", license.PerResourceDimension("identities", "Identities", "identity")),
		}}}))

		// Action
		code, body := s.call(t, http.MethodGet, path("/products"), "", nil)

		// Assert
		require.Equal(t, http.StatusOK, code)
		var got struct {
			Products []struct {
				ID         string            `json:"id"`
				Comparison []json.RawMessage `json:"comparison"`
				Includes   []string          `json:"includes"`
				Plans      []struct {
					Tier   string            `json:"tier"`
					Prices []json.RawMessage `json:"prices"`
				} `json:"plans"`
			} `json:"products"`
		}
		require.NoError(t, json.Unmarshal([]byte(body), &got))
		require.Len(t, got.Products, 1)
		require.NotNil(t, got.Products[0].Comparison)
		require.NotNil(t, got.Products[0].Includes)
		require.Equal(t, "free", got.Products[0].Plans[0].Tier)
		require.NotNil(t, got.Products[0].Plans[0].Prices)
		require.Len(t, got.Products[0].Plans[1].Prices, 2)
	})

	t.Run("should serve a seeded subscription, profile and trials", func(t *testing.T) {
		// Setup
		s := newStack(t)
		sc := license.Open(t, s.admin, org)
		trials := []license.Trial{{ProductKey: "pam", Outcome: "converted"}}
		sc.Seed(t, license.SeedBilling(license.BillingState{
			Subscription: &license.Subscription{Status: "active", Items: []license.SubscriptionItem{{ProductID: "pam", Plan: "pro"}}},
			Profile:      &license.Profile{Payment: &license.ProfilePayment{Brand: "visa", Last4: "4242", ExpMonth: 1, ExpYear: 2099}},
			Trials:       &trials,
		}))

		// Action
		_, sub := s.call(t, http.MethodGet, path("/subscription"), "", nil)
		_, profile := s.call(t, http.MethodGet, path("/billing/profile"), "", nil)
		_, got := s.call(t, http.MethodGet, path("/billing/trials"), "", nil)

		// Assert
		require.JSONEq(t, `{"status":"active","items":[{"productId":"pam","plan":"pro","dimensions":[]}]}`, sub)
		require.JSONEq(t, `{"payment":{"brand":"visa","last4":"4242","expMonth":1,"expYear":2099},"billingDetails":null,"invoices":[]}`, profile)
		require.JSONEq(t, `{"trials":[{"product_key":"pam","outcome":"converted"}]}`, got)
	})

	t.Run("should record each mutation with its body and answer a success when no result is scripted", func(t *testing.T) {
		// Setup
		s := newStack(t)
		sc := license.Open(t, s.admin, org)

		// Action
		code, body := s.call(t, http.MethodPost, path("/subscription/products"), `{"productId":"pam","declaredUsage":{"identities":3}}`, nil)
		removed, _ := s.call(t, http.MethodDelete, path("/subscription/products/pam"), "", nil)

		// Assert
		require.Equal(t, http.StatusOK, code)
		require.JSONEq(t, `{"outcome":"subscription_updated","subscriptionId":"sub_fake"}`, body)
		require.Equal(t, http.StatusOK, removed)
		state := sc.State(t)
		buys := state.RequestsFor(license.OpBuy)
		require.Len(t, buys, 1)
		require.Equal(t, map[string]any{"identities": float64(3)}, buys[0].Body["declaredUsage"])
		require.Len(t, state.RequestsFor(license.OpRemove), 1)
		require.Equal(t, path("/subscription/products/pam"), state.RequestsFor(license.OpRemove)[0].Path)
	})

	t.Run("should answer the scripted result, with its status, until another replaces it", func(t *testing.T) {
		// Setup
		s := newStack(t)
		sc := license.Open(t, s.admin, org)
		sc.Seed(t, license.SeedBilling(license.BillingState{Results: map[license.Op]license.Reply{
			license.OpTrial: license.AwaitingCard("https://stripe.test/setup"),
		}}))

		// Action
		first, body := s.call(t, http.MethodPost, path("/billing/trial"), `{"product_key":"pam","plan_key":"pro"}`, nil)
		sc.Seed(t, license.SeedBilling(license.BillingState{Results: map[license.Op]license.Reply{license.OpTrial: license.TrialStarted()}}))
		second, _ := s.call(t, http.MethodPost, path("/billing/trial"), `{"product_key":"pam","plan_key":"pro"}`, nil)

		// Assert
		require.Equal(t, http.StatusPaymentRequired, first)
		require.JSONEq(t, `{"outcome":"awaiting_card","card_setup_url":"https://stripe.test/setup"}`, body)
		require.Equal(t, http.StatusOK, second)
	})

	t.Run("should record nothing when an injected failure refuses the request", func(t *testing.T) {
		// Setup
		s := newStack(t)
		sc := license.Open(t, s.admin, org)
		sc.Fail(t, http.MethodPost, path("/subscription/upgrade"), http.StatusConflict, fakenet.Body(`{"message":"no"}`))

		// Action
		code, _ := s.call(t, http.MethodPost, path("/subscription/upgrade"), `{"productId":"pam"}`, nil)

		// Assert
		require.Equal(t, http.StatusConflict, code)
		require.Empty(t, sc.State(t).Billing.Requests)
		require.Equal(t, 1, sc.Received(t, http.MethodPost, path("/subscription/upgrade")))
	})

	t.Run("should keep the plan when billing is seeded, and keep billing when the plan is seeded", func(t *testing.T) {
		// Setup
		s := newStack(t)
		sc := license.Open(t, s.admin, org)
		sc.Seed(t, license.Free)

		// Action
		sc.Seed(t, license.SeedBilling(license.BillingState{Subscription: &license.Subscription{Status: "active"}}))
		sc.Seed(t, license.Enterprise())

		// Assert
		state := sc.State(t)
		require.Equal(t, "enterprise", state.Slug)
		require.NotNil(t, state.Billing.Subscription)
		require.Equal(t, "active", state.Billing.Subscription.Status)
	})
}

func TestSigner_Key(t *testing.T) {
	t.Run("should sign the license body so its public key verifies it", func(t *testing.T) {
		// Setup
		signer, err := license.NewSigner()
		require.NoError(t, err)

		// Action
		key, err := signer.Key(license.V2("lic-1", license.Enterprise()))

		// Assert
		require.NoError(t, err)
		raw, err := base64.StdEncoding.DecodeString(key)
		require.NoError(t, err)
		var contents struct {
			License   json.RawMessage `json:"license"`
			Signature string          `json:"signature"`
		}
		require.NoError(t, json.Unmarshal(raw, &contents))
		pemBytes, err := os.ReadFile(signer.PublicKeyFile)
		require.NoError(t, err)
		block, _ := pem.Decode(pemBytes)
		require.Equal(t, "RSA PUBLIC KEY", block.Type)
		pub, err := x509.ParsePKCS1PublicKey(block.Bytes)
		require.NoError(t, err)
		sig, err := base64.StdEncoding.DecodeString(contents.Signature)
		require.NoError(t, err)
		digest := sha256.Sum256(contents.License)
		require.NoError(t, rsa.VerifyPKCS1v15(pub, crypto.SHA256, digest[:], sig))
	})
}
