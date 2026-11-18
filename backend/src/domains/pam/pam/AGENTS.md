# PAM domain

Holds only the `pam_identities` usage counter for now. More moves in later.

- Counts through Projects (`projectsService.countProjectIdentities`), which owns the
  membership queries, so this domain reads no tables.
