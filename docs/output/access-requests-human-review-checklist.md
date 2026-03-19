# Human Review Checklist

## Requires Attention

- [ ] The "Set up an access request policy" section has only 1 `<Step>`. Consider whether to add a second step (e.g., "Configure policy settings") or convert to a heading-only section per style guide Section 6.1.
- [ ] Prerequisites say "Admin or appropriate permissions" — consider specifying the exact role or permission needed.
- [ ] Break-glass bypass info links to the general access controls overview. If a dedicated enforcement level doc is created in the future, update this link.

## Verification Needed

- [ ] Confirm all 6 screenshots are still current and match the latest UI. Screenshots were not visually inspected during this review.
- [ ] Verify that the "Approvals" page navigation path is correct (document says "Navigate to your project's **Approvals** page").

## Missing Content

- [ ] Consider adding information about Slack/Teams notification setup for access requests (currently only mentioned generically as "notifications").
- [ ] Consider documenting the `allowedSelfApprovals` policy option (whether requesters can approve their own requests).
- [ ] Consider documenting the `maxTimePeriod` policy option (maximum allowed duration for temporary access).
- [ ] No enterprise tier callout is present. Verify whether Access Requests is an enterprise-only feature. If so, add the enterprise callout per style guide Section 8.
