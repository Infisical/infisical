# Agent Vault domain

Holds only the `agent_vault_identities` usage counter for now; it grows as Agent Vault moves into domains.

- The counter counts through `projects` (`countProjectIdentities`), which owns the
  membership queries, so this domain reads no tables itself.
- Agent Vault projects register admin and member roles; custom roles resolve to the member set. Bundle access goes through `getAccessBundlePermission`: reaching a bundle is a filter the services apply, not a CASL rule, and a group's bundle grants count only while the group holds a live project role.
