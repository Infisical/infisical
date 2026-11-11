# PAM domain

Holds only the `pam_identities` usage counter for now; it grows as PAM moves into domains.

- The counter counts through `projects` (`countProjectIdentities`), which owns the
  membership queries, so this domain reads no tables itself.
- Every PAM folder and account check calls `getPamPermission`: the account's memberships override the folder's (`closestWins`), and a project admin gets nothing on a folder it has no role on. PAM projects register admin and member roles; custom roles resolve to the member set.
