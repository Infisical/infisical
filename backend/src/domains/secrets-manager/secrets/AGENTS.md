# Secrets domain

Holds only the `secret_identities` usage counter for now. More moves in later.

- Counts through `organizations-projects` (`countProjectIdentities`), which owns the
  membership queries, so this domain reads no tables.
