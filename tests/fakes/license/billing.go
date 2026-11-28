package license

import (
	"encoding/json"
	"io"
	"maps"
	"net/http"
	"strings"
	"time"
)

// Op names one billing mutation, for scripting what the License Server answers and for
// finding what it was sent.
type Op string

const (
	OpPortal         Op = "portal"
	OpPreview        Op = "preview"
	OpBuy            Op = "buy"
	OpRemove         Op = "remove"
	OpUpgrade        Op = "upgrade"
	OpCommitments    Op = "commitments"
	OpTrial          Op = "trial"
	OpTrialCancel    Op = "trialCancel"
	OpConfirmPayment Op = "confirmPayment"
)

// BillingState is the cloud billing side of one organization. A seed fragment carries
// only the fields the test sets; a nil field leaves the current value alone.
//
// Nothing here is computed from anything else. A subscription the test seeds is what
// GET /subscription answers, whatever the catalog or the mutations did, so a test states
// exactly the world it needs.
type BillingState struct {
	Catalog      *Catalog      `json:"catalog,omitempty"`
	Subscription *Subscription `json:"subscription,omitempty"`
	Profile      *Profile      `json:"profile,omitempty"`
	Trials       *[]Trial      `json:"trials,omitempty"`

	// Results is what each mutation answers next. It stays in place until replaced, so a
	// test that calls twice gets the same answer twice. An operation with no entry answers
	// with a success; see defaultReply.
	Results map[Op]Reply `json:"results,omitempty"`

	// Requests is every mutation the instance sent, oldest first, with the body it
	// carried. A refused change leaves this empty.
	Requests []Request `json:"requests,omitempty"`
}

// BillingSeed wraps a BillingState so Seed can tell it from a Plan.
type BillingSeed struct {
	Billing BillingState `json:"billing"`
}

// SeedBilling is the fragment to pass to a scope's Seed.
func SeedBilling(b BillingState) BillingSeed { return BillingSeed{Billing: b} }

// Reply is one answer to a mutation: the status and the JSON body.
type Reply struct {
	Status int            `json:"status,omitempty"`
	Body   map[string]any `json:"body"`
}

// Request is one mutation as the License Server received it.
type Request struct {
	Op     Op             `json:"op"`
	Method string         `json:"method"`
	Path   string         `json:"path"`
	Body   map[string]any `json:"body,omitempty"`
}

// Requests are the recorded mutations of one operation, oldest first.
func (s State) RequestsFor(op Op) []Request {
	var out []Request
	for _, r := range s.Billing.Requests {
		if r.Op == op {
			out = append(out, r)
		}
	}
	return out
}

func CheckoutCreated(url string) Reply {
	return Reply{Body: map[string]any{"outcome": "checkout_created", "checkoutUrl": url}}
}

func SubscriptionUpdated(subscriptionID string) Reply {
	return Reply{Body: map[string]any{"outcome": "subscription_updated", "subscriptionId": subscriptionID}}
}

func SubscriptionCanceled(subscriptionID string) Reply {
	return Reply{Body: map[string]any{"outcome": "subscription_canceled", "subscriptionId": subscriptionID}}
}

// PaymentActionRequired answers with the invoice link the customer's bank wants approval
// on. An empty url leaves the field out, which the instance cannot send anyone to.
func PaymentActionRequired(url string) Reply {
	body := map[string]any{"outcome": "payment_action_required"}
	if url != "" {
		body["paymentUrl"] = url
	}
	return Reply{Body: body}
}

func Upgraded(subscriptionID, from, to string) Reply {
	return Reply{Body: map[string]any{"outcome": "upgraded", "subscriptionId": subscriptionID, "fromPlanKey": from, "toPlanKey": to}}
}

func TrialStarted() Reply { return Reply{Body: map[string]any{"outcome": "trial_started"}} }

// AwaitingCard is the 402 the real server answers with when no card is on file.
func AwaitingCard(cardSetupURL string) Reply {
	return Reply{Status: http.StatusPaymentRequired, Body: map[string]any{"outcome": "awaiting_card", "card_setup_url": cardSetupURL}}
}

func TrialCompleted() Reply { return Reply{Body: map[string]any{"outcome": "trial_completed"}} }

func ConfirmUpgraded() Reply { return Reply{Body: map[string]any{"outcome": "upgraded"}} }

func ConfirmCheckout(url string) Reply {
	return Reply{Body: map[string]any{"outcome": "checkout_created", "checkoutUrl": url}}
}

func ConfirmPaymentAction(url string) Reply {
	return Reply{Body: map[string]any{"outcome": "payment_action_required", "paymentUrl": url}}
}

func PortalSession(url string) Reply { return Reply{Body: map[string]any{"url": url}} }

// Catalog is GET /products on cloud.
type Catalog struct {
	Products []CatalogProduct `json:"products"`
}

type CatalogProduct struct {
	ID         string             `json:"id"`
	Name       string             `json:"name"`
	Tagline    string             `json:"tagline,omitempty"`
	Icon       string             `json:"icon,omitempty"`
	Color      string             `json:"color,omitempty"`
	Addon      bool               `json:"addon"`
	Deprecated bool               `json:"deprecated"`
	Dimensions []CatalogDimension `json:"dimensions"`
	Plans      []CatalogPlan      `json:"plans"`
	Comparison []CatalogRow       `json:"comparison"`
	Includes   []string           `json:"includes"`
}

type CatalogDimension struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Noun        string `json:"noun"`
	BillingType string `json:"billingType,omitempty"`
	Aggregation string `json:"aggregation,omitempty"`
}

type CatalogPlan struct {
	Tier                  string         `json:"tier"`
	Name                  string         `json:"name"`
	SelfServe             bool           `json:"selfServe"`
	SalesLed              bool           `json:"salesLed"`
	Trialable             bool           `json:"trialable"`
	Upgradeable           bool           `json:"upgradeable"`
	TrialDays             int            `json:"trialDays"`
	Deprecated            bool           `json:"deprecated"`
	BasePriceMonthlyCents *int           `json:"basePriceMonthlyCents,omitempty"`
	BasePriceAnnualCents  *int           `json:"basePriceAnnualCents,omitempty"`
	Prices                []CatalogPrice `json:"prices"`
}

// CatalogPrice is one dimension at one cadence. Kind is left out for a per-unit price,
// which is how the License Server sends it: it classifies by the dimension's billing
// type and the instance reads that back.
type CatalogPrice struct {
	DimensionKey     string `json:"dimensionKey"`
	Cadence          string `json:"cadence"`
	Kind             string `json:"kind,omitempty"`
	UnitAmountCents  int    `json:"unitAmountCents"`
	IncludedQuantity *int   `json:"includedQuantity,omitempty"`
}

type CatalogRow struct {
	Label string        `json:"label"`
	Cells []CatalogCell `json:"cells"`
}

type CatalogCell struct {
	Tier  string `json:"tier"`
	Value any    `json:"value"`
}

// Subscription is GET /subscription. Unset, the endpoint answers 404, which the instance
// reads as no subscription.
type Subscription struct {
	Status       string                  `json:"status"`
	Capabilities *SubscriptionCapability `json:"capabilities,omitempty"`
	Payment      *SubscriptionPayment    `json:"payment,omitempty"`
	Items        []SubscriptionItem      `json:"items"`
}

type SubscriptionCapability struct {
	CheckoutFrozen bool `json:"checkoutFrozen"`
	SelfServe      bool `json:"selfServe"`
}

type SubscriptionPayment struct {
	State     string `json:"state"`
	ActionURL string `json:"actionUrl,omitempty"`
}

type SubscriptionItem struct {
	ProductID  string                  `json:"productId"`
	Plan       string                  `json:"plan"`
	Status     string                  `json:"status,omitempty"`
	IsTrialing bool                    `json:"isTrialing,omitempty"`
	Amount     int                     `json:"amount,omitempty"`
	Dimensions []SubscriptionDimension `json:"dimensions"`
}

type SubscriptionDimension struct {
	Key       string `json:"key"`
	Unit      string `json:"unit,omitempty"`
	Cadence   string `json:"cadence,omitempty"`
	Used      int    `json:"used"`
	Limit     *int   `json:"limit,omitempty"`
	Committed *int   `json:"committed,omitempty"`
}

// Profile is GET /billing/profile. Unset, the endpoint answers 404, which the instance
// reads as no billing profile.
type Profile struct {
	Payment        *ProfilePayment `json:"payment"`
	BillingDetails *ProfileDetails `json:"billingDetails"`
	Invoices       []Invoice       `json:"invoices"`
}

type ProfilePayment struct {
	Brand    string `json:"brand"`
	Last4    string `json:"last4"`
	ExpMonth int    `json:"expMonth"`
	ExpYear  int    `json:"expYear"`
}

type ProfileDetails struct {
	Name   string       `json:"name"`
	Email  string       `json:"email"`
	TaxIDs []ProfileTax `json:"taxIds"`
}

type ProfileTax struct {
	Type  string `json:"type"`
	Value string `json:"value"`
}

type Invoice struct {
	ID     string `json:"id"`
	Number string `json:"number"`
	Date   int64  `json:"date"`
	Amount int    `json:"amount"`
	Paid   bool   `json:"paid"`
	PDFURL string `json:"pdfUrl,omitempty"`
}

// Trial is one row of GET /billing/trials.
type Trial struct {
	ProductKey string `json:"product_key"`
	PlanKey    string `json:"plan_key,omitempty"`
	Outcome    string `json:"outcome"`
	EndedAt    int64  `json:"ended_at,omitempty"`
}

func ptr[T any](v T) *T { return &v }

// Int is for the optional numeric fields above.
func Int(v int) *int { return ptr(v) }

// SelfServeProduct is a product with one paid self-serve plan, "pro", that prices the
// given dimensions per unit and monthly. Dimensions the catalog describes as metered are
// priced per unit by a License Server that omits the price kind, so a test of the
// metered case uses MeteredDimension.
func SelfServeProduct(id, name string, dims ...CatalogDimension) CatalogProduct {
	prices := make([]CatalogPrice, 0, len(dims)*2)
	for _, d := range dims {
		prices = append(prices,
			CatalogPrice{DimensionKey: d.Key, Cadence: "monthly", UnitAmountCents: 500, IncludedQuantity: Int(0)},
			CatalogPrice{DimensionKey: d.Key, Cadence: "annual", UnitAmountCents: 5000, IncludedQuantity: Int(0)})
	}
	return CatalogProduct{
		ID: id, Name: name, Dimensions: dims,
		Plans: []CatalogPlan{
			{Tier: "free", Name: "Free", SelfServe: true},
			{Tier: "pro", Name: "Pro", SelfServe: true, Trialable: true, Upgradeable: true, TrialDays: 14, Prices: prices},
		},
	}
}

func PerResourceDimension(key, label, noun string) CatalogDimension {
	return CatalogDimension{Key: key, Label: label, Noun: noun, BillingType: "per_resource"}
}

func MeteredDimension(key, label, noun string) CatalogDimension {
	return CatalogDimension{Key: key, Label: label, Noun: noun, BillingType: "metered", Aggregation: "sum"}
}

func (c *Catalog) normalize() {
	if c.Products == nil {
		c.Products = []CatalogProduct{}
	}
	for i := range c.Products {
		p := &c.Products[i]
		if p.Dimensions == nil {
			p.Dimensions = []CatalogDimension{}
		}
		if p.Plans == nil {
			p.Plans = []CatalogPlan{}
		}
		if p.Comparison == nil {
			p.Comparison = []CatalogRow{}
		}
		if p.Includes == nil {
			p.Includes = []string{}
		}
		for j := range p.Plans {
			if p.Plans[j].Prices == nil {
				p.Plans[j].Prices = []CatalogPrice{}
			}
		}
		for j := range p.Comparison {
			if p.Comparison[j].Cells == nil {
				p.Comparison[j].Cells = []CatalogCell{}
			}
		}
	}
}

func (s *Subscription) normalize() {
	if s.Items == nil {
		s.Items = []SubscriptionItem{}
	}
	for i := range s.Items {
		if s.Items[i].Dimensions == nil {
			s.Items[i].Dimensions = []SubscriptionDimension{}
		}
	}
}

func (p *Profile) normalize() {
	if p.Invoices == nil {
		p.Invoices = []Invoice{}
	}
	if p.BillingDetails != nil && p.BillingDetails.TaxIDs == nil {
		p.BillingDetails.TaxIDs = []ProfileTax{}
	}
}

// merge applies the fields a seed fragment sets.
func (b *BillingState) merge(patch BillingState) {
	if patch.Catalog != nil {
		patch.Catalog.normalize()
		b.Catalog = patch.Catalog
	}
	if patch.Subscription != nil {
		patch.Subscription.normalize()
		b.Subscription = patch.Subscription
	}
	if patch.Profile != nil {
		patch.Profile.normalize()
		b.Profile = patch.Profile
	}
	if patch.Trials != nil {
		b.Trials = patch.Trials
	}
	if len(patch.Results) > 0 {
		next := make(map[Op]Reply, len(b.Results)+len(patch.Results))
		maps.Copy(next, b.Results)
		maps.Copy(next, patch.Results)
		b.Results = next
	}
}

func defaultReply(op Op) Reply {
	switch op {
	case OpPortal:
		return PortalSession("https://billing.license.infisical.test/portal")
	case OpPreview:
		return Reply{Body: map[string]any{
			"currency":           "usd",
			"prorationAmount":    1500,
			"additionalCharges":  500,
			"totalDueNow":        2000,
			"nextInvoiceTotal":   3000,
			"nextRecurringTotal": 3000,
			"prorationDate":      time.Now().Unix(),
			"lines":              []map[string]any{{"description": "Pro plan", "amount": 2000, "proration": true}},
		}}
	case OpBuy, OpRemove, OpCommitments:
		return SubscriptionUpdated("sub_fake")
	case OpUpgrade:
		return Upgraded("sub_fake", "free", "pro")
	case OpTrial:
		return TrialStarted()
	case OpTrialCancel:
		return TrialCompleted()
	case OpConfirmPayment:
		return ConfirmUpgraded()
	}
	return Reply{Body: map[string]any{}}
}

func (o *Org) billingRoutes(mux *http.ServeMux) {
	notFound := func(w http.ResponseWriter) {
		writeJSON(w, http.StatusNotFound, map[string]any{"message": "license not found"})
	}

	mux.HandleFunc("GET /v1/organizations/{orgId}/products", func(w http.ResponseWriter, _ *http.Request) {
		o.mu.Lock()
		catalog := Catalog{}
		if o.state.Billing.Catalog != nil {
			catalog = *o.state.Billing.Catalog
		}
		catalog.normalize()
		o.mu.Unlock()
		writeJSON(w, http.StatusOK, catalog)
	})

	mux.HandleFunc("GET /v1/organizations/{orgId}/subscription", func(w http.ResponseWriter, _ *http.Request) {
		o.mu.Lock()
		sub := o.state.Billing.Subscription
		o.mu.Unlock()
		if sub == nil {
			notFound(w)
			return
		}
		writeJSON(w, http.StatusOK, sub)
	})

	mux.HandleFunc("GET /v1/organizations/{orgId}/billing/profile", func(w http.ResponseWriter, _ *http.Request) {
		o.mu.Lock()
		profile := o.state.Billing.Profile
		o.mu.Unlock()
		if profile == nil {
			notFound(w)
			return
		}
		writeJSON(w, http.StatusOK, profile)
	})

	mux.HandleFunc("GET /v1/organizations/{orgId}/billing/trials", func(w http.ResponseWriter, _ *http.Request) {
		o.mu.Lock()
		trials := []Trial{}
		if o.state.Billing.Trials != nil {
			trials = *o.state.Billing.Trials
		}
		o.mu.Unlock()
		writeJSON(w, http.StatusOK, map[string]any{"trials": trials})
	})

	mutation := func(pattern string, op Op) {
		mux.HandleFunc(pattern, func(w http.ResponseWriter, r *http.Request) {
			var body map[string]any
			if raw, err := io.ReadAll(r.Body); err == nil && len(strings.TrimSpace(string(raw))) > 0 {
				if err := json.Unmarshal(raw, &body); err != nil {
					writeJSON(w, http.StatusBadRequest, map[string]any{"message": "malformed body"})
					return
				}
			}
			o.mu.Lock()
			o.state.Billing.Requests = append(o.state.Billing.Requests, Request{Op: op, Method: r.Method, Path: r.URL.Path, Body: body})
			reply, ok := o.state.Billing.Results[op]
			o.mu.Unlock()
			if !ok {
				reply = defaultReply(op)
			}
			status := reply.Status
			if status == 0 {
				status = http.StatusOK
			}
			writeJSON(w, status, reply.Body)
		})
	}
	mutation("POST /v1/organizations/{orgId}/billing/portal-session", OpPortal)
	mutation("POST /v1/organizations/{orgId}/subscription/preview", OpPreview)
	mutation("POST /v1/organizations/{orgId}/subscription/products", OpBuy)
	mutation("DELETE /v1/organizations/{orgId}/subscription/products/{productId}", OpRemove)
	mutation("POST /v1/organizations/{orgId}/subscription/upgrade", OpUpgrade)
	mutation("PUT /v1/organizations/{orgId}/subscription/commitments", OpCommitments)
	mutation("POST /v1/organizations/{orgId}/billing/trial", OpTrial)
	mutation("POST /v1/organizations/{orgId}/billing/trial/cancel", OpTrialCancel)
	mutation("POST /v1/organizations/{orgId}/subscription/trials/confirm-payment", OpConfirmPayment)
}
