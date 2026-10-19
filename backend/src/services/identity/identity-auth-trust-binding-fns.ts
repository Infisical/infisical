// Auth configs saved before this instant may log in without a trust binding, so enforcement does not
// break identities that were configured before it shipped. Any update still requires a binding.
export const UNBOUND_AUTH_CUTOFF = new Date("2026-10-21T00:00:00Z");

export const isUnboundAuthGrandfathered = (authCreatedAt: Date) => authCreatedAt < UNBOUND_AUTH_CUTOFF;
