// Package license controls a tenant's entitlements.
//
// Entitlements are a property of the tenant, not the instance, which is what lets a
// downgrade be asserted under a live org without a dedicated stack. That requires
// Cloud instance type: getPlan short-circuits to the instance-wide feature set for
// every other type.
package license

// Feature carries both names for one entitlement, because two vocabularies are in
// play and getting them confused fails silently.
//
// V2 is the License Server registry key the stub emits. V1 is the TFeatureSet field
// the read-back checks. feature-mapping.ts warns that a wrong key means the feature
// is never projected onto the plan, so a raw string would surface as a 403 in a test
// that looks unrelated to licensing.
type Feature struct {
	V2 string
	V1 string
}
