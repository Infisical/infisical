# Secrets domain

Holds only the `secret_identities` usage counter for now; it grows as Secrets moves into domains.

- The counter counts through `organizations-projects` (`countProjectIdentities`), which owns the
  membership queries, so this domain reads no tables itself.
