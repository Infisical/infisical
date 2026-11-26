# Agent Vault policy editor

`agentVaultPermissionCatalog.ts` lists every action a role can hold as a row (`PERMISSION_ROWS`: its actions and named levels, with the dependencies between actions in `SUBJECT_RULES`). `agentVaultPolicyModel.ts` maps rules to those rows and back, and reports any rule no row holds, which makes the editor fall back to JSON so nothing is dropped on save.

When the backend adds an action or subject an Agent Vault role can grant, add it to a row (or to that subject's `ignored` list if nothing in Agent Vault offers it; the editor hides those but keeps them in `policy.hidden` and writes them back unchanged, since a deny there can still matter) and to `ADMIN_RULES` in `agentVaultPolicyModel.test.ts`, which mirrors `buildAgentVaultProjectAdminPermissionRules`. Otherwise every role holding it opens in JSON only.

Saving a role writes the rules its policy comes to, not the rules it was loaded from, so a change to how the model reads or writes rules changes every role saved afterwards, Duplicate included (`rulesForCopy`). Check a change against what the API decides (denies sort after allows, and CASL keeps the last rule that matches), as the model's tests do with `canDoWith`.

Sessions are the one row whose keys aren't API actions. The editor lists acting on the caller's own sessions and on everyone's as separate keys (`read` and `SessionEveryoneAction.Read`, and so on), while a role holds `read`, `edit` and `revoke` with an `actorId` condition on `{{identity.id}}`: none for both, `$eq` for own alone, `$ne` for everyone's alone, in allows and denies alike. `toApiSessionRules` writes the keys as rules and `sessionKeysOf` reads them back; keep the two exact inverses, which the round-trip tests check for every allow and deny set of the row.
