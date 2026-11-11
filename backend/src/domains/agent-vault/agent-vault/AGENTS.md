# Agent Vault domain

Holds only the `agent_vault_identities` usage counter for now; it grows as Agent Vault moves into domains.

- The counter counts through `projects` (`countProjectIdentities`), which owns the
  membership queries, so this domain reads no tables itself.
