package license

import "maps"

// Plan is what the stubbed License Server returns for one organization.
type Plan struct {
	Slug     string
	Features map[string]any // keyed by License Server v2 key
	Products []Product
}

// Product is an entitlement row. An entitlement can exist without a Stripe
// subscription mirror, so a product's state is read from here rather than inferred
// from the feature map.
type Product struct {
	Key    string `json:"product_key"`
	Plan   string `json:"plan_key,omitempty"`
	Status string `json:"status,omitempty"`
}

// Free is the absence of entitlements. An empty feature map leaves every flag at the
// OSS default, which is what a downgraded customer actually gets.
var Free = Plan{Slug: "", Features: map[string]any{}}

// Enterprise turns on everything in the generated mapping.
//
// It has to enumerate rather than send a wildcard: projectV2ToFeatureSet layers
// entitlements over getDefaultOnPremFeatures(), so a feature the stub omits stays
// off. Limit features get a large number rather than true, since their value is a cap.
func Enterprise() Plan {
	features := make(map[string]any, len(All))
	for _, f := range All {
		features[f.V2] = valueFor(f)
	}
	return Plan{
		Slug:     "enterprise",
		Features: features,
		Products: []Product{
			{Key: "secret-manager", Plan: "enterprise", Status: "active"},
			{Key: "cert-manager", Plan: "enterprise", Status: "active"},
			{Key: "pam", Plan: "enterprise", Status: "active"},
		},
	}
}

// valueFor picks a sensible entitlement value from the feature's name.
//
// The License Server distinguishes capabilities from metered limits, and the mapping
// does not record which is which. A cap sent as `true` would project onto a numeric
// TFeatureSet field as a boolean, so limits are inferred by name and given a value
// high enough that no test hits them accidentally.
func valueFor(f Feature) any {
	switch {
	case hasPrefix(f.V2, "max_"), hasSuffix(f.V2, "_limit"), hasSuffix(f.V2, "_days"):
		return 1_000_000
	case hasSuffix(f.V2, "_cas"), hasSuffix(f.V2, "_certs"), hasSuffix(f.V2, "_identities"):
		return 1_000_000
	case f.V2 == "identities":
		return 1_000_000
	default:
		return true
	}
}

// Without turns features off, for asserting that a gate actually gates.
func (p Plan) Without(features ...Feature) Plan {
	out := p.clone()
	for _, f := range features {
		out.Features[f.V2] = false
	}
	return out
}

// With overrides one feature, for limits: Enterprise().With(license.MaxInternalCAs, 2).
func (p Plan) With(f Feature, value any) Plan {
	out := p.clone()
	out.Features[f.V2] = value
	return out
}

func (p Plan) clone() Plan {
	out := Plan{Slug: p.Slug, Features: make(map[string]any, len(p.Features))}
	maps.Copy(out.Features, p.Features)
	out.Products = append([]Product(nil), p.Products...)
	return out
}

// entitlementsPayload is the response body shape. `features` and `products` are
// load-bearing; the schema is passthrough, so extra fields are tolerated.
type entitlementsPayload struct {
	Slug     string                  `json:"slug,omitempty"`
	Features map[string]featureValue `json:"features"`
	Products []Product               `json:"products"`
}

type featureValue struct {
	Value any `json:"value"`
}

// Payload renders the plan as the License Server would.
func (p Plan) Payload() any {
	features := make(map[string]featureValue, len(p.Features))
	for k, v := range p.Features {
		features[k] = featureValue{Value: v}
	}
	products := p.Products
	if products == nil {
		products = []Product{}
	}
	return entitlementsPayload{Slug: p.Slug, Features: features, Products: products}
}

// Expect is the set a plan read-back can verify: the features that map to a
// TFeatureSet field. The rest are real entitlements with nowhere to check them.
func (p Plan) Expect() map[string]any {
	out := map[string]any{}
	for _, f := range All {
		if f.V1 == "" {
			continue
		}
		if v, ok := p.Features[f.V2]; ok {
			out[f.V1] = v
		}
	}
	return out
}

func hasPrefix(s, p string) bool { return len(s) >= len(p) && s[:len(p)] == p }
func hasSuffix(s, p string) bool { return len(s) >= len(p) && s[len(s)-len(p):] == p }
