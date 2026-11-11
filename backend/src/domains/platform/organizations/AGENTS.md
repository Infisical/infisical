# Organizations domain

The top-level container: orgs and sub-orgs. Owns `organizations`. Holds what every request acting in an org needs (`findActorOrg`: name, root and parent org, the privilege-system flag and the root org's sign-in policy), the root-org lookup, and the org rule schema (`service/permission/org-permission.ts`).

- **Below Projects:** Organizations never reads or calls Projects. A sub-org's policy comes from its root org's row.
