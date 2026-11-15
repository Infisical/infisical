# Agent Vault domain

Holds only the `agent_vault_identities` usage counter for now. More moves in later.

- Counts through `organizations-projects` (`countProjectIdentities`), which owns the
  membership queries, so this domain reads no tables.
