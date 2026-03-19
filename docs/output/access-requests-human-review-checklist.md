# Human Review Checklist — Access Requests

Items appear here ONLY because they cannot be resolved by the pipeline.

---

## Visual/Asset Verification

- [ ] **Verify screenshot: create-access-request-policy.png** — Confirm it shows current UI with all documented policy options (Name, Environment, Secret Path, Approvers, Enforcement Level, Bypassers, Allow Self-Approvals, Max Time Period)
- [ ] **Verify screenshot: access-request-policies.png** — Confirm it shows the current policy list view
- [ ] **Verify screenshot: request-access.png** — Confirm it shows the current access request creation UI
- [ ] **Verify screenshot: access-requests-pending.png** — Confirm it shows the current pending requests dashboard
- [ ] **Verify screenshot: access-request-bypass.png** — Confirm it shows the current approval/rejection UI
- [ ] **Verify screenshot: edit-access-request.png** — Confirm it shows the current duration edit UI

**Justification:** Pipeline cannot view or generate visual assets. Screenshots may be outdated if UI has changed since they were captured.

---

## Business/Product Decisions

- [ ] **UI navigation path** — Confirm the exact navigation path to the Approvals page (document says "go to the Approvals settings page"). Verify the exact button label for creating a new policy (document says "Add Policy").

**Justification:** Exact UI labels and navigation paths require visual verification of the running application, which the pipeline cannot perform.

---

## Unresolved After Research

None. All research questions were resolved from the codebase.

---

## External System Dependencies

None applicable.
