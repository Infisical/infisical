## Human Review Checklist

### Screenshots
No screenshots are included. Consider adding:
- [Screenshot: Identity creation page in Org Settings > Access Control > Identities]
- [Screenshot: Kubernetes Auth configuration modal with fields filled in]
- [Screenshot: Adding identity to project in Project Settings > Access Control > Machine Identities]

### Diagrams
None required. The flow is adequately described in prose and YAML examples.

### [VERIFY] Items
- [ ] **ESO API version**: The YAML examples use `external-secrets.io/v1`. Verify this matches your installed ESO version — older installations may require `external-secrets.io/v1beta1`.
- [ ] **ESO service account name**: The "Client JWT as Reviewer" tab assumes the ESO service account is named `external-secrets` in the `external-secrets` namespace. Verify this matches the default ESO Helm installation. Custom installations may use a different name.
- [ ] **serviceAccountTokenPath default**: The ESO Kubernetes auth config supports a `serviceAccountTokenPath` field. This guide omits it, assuming the default `/var/run/secrets/kubernetes.io/serviceaccount/token` is correct. Verify this is the ESO default.

### [LINK NEEDED] Items
None — all internal links validated.

### [REVIEW] Items
None — editorial passed without revision.

---

## Pipeline Summary

**Agents invoked:** Research, Structure, Writing, Linking, Editorial, Titling (all 6)

**Revision loops:** 0 — Editorial approved on first pass.

**Documents produced:** 1
- `final.mdx` — "External Secrets Operator with Kubernetes Auth" (how-to guide)

**Key decisions:**
- Single document (not a doc set) since the scope is one integration workflow.
- Used Tabs component for the two token reviewer options, matching the style of existing Kubernetes Auth docs.
- Included both individual and bulk secret sync ExternalSecret examples.
- Noted the Infisical Kubernetes Operator as an alternative in the intro, matching how existing docs cross-reference.

**Suggested placement in docs.json:**
This doc could be added under the integrations section, e.g. alongside other Kubernetes integration pages. A possible path: `integrations/platforms/kubernetes-eso` or `integrations/platforms/external-secrets-operator`.

**Flagged items:** 3 `[VERIFY]` items, 3 optional `[Screenshot]` items.

**Sources used:**
- Internal: `documentation/platform/identities/kubernetes-auth.mdx`, `documentation/platform/identities/machine-identities.mdx`, `backend/src/server/routes/v1/identity-kubernetes-auth-router.ts`, `integrations/platforms/kubernetes/overview.mdx`
- External: https://external-secrets.io/latest/provider/infisical/, https://external-secrets.io/latest/introduction/getting-started/
