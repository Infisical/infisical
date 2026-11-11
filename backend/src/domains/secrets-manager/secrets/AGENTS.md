# Secrets domain

Holds the `secret_identities` usage counter and Secret Manager's permissions for now; it grows as Secrets moves into domains.

- **Every Secret Manager check calls `getSecretsPermission`**, never `getProjectPermission`: folder grants and service tokens live only here, layered over the project's role rules with `overrideAt`.
- **Folder grants** are `additional_privileges` rows with a `folderId`, read through Access Control (`findFolderGrants`, `findProjectFolderGrants`). They never apply to a built-in admin, and match their folder's exact path.
- **Declared read-only exceptions:** `secret_folders` and `project_environments` (`FolderPathDataAccess`), `service_tokens` (`ServiceTokenDataAccess`), and `users` / `identities` names (`MemberNameDataAccess`). No domain owns those tables yet; move each read to its owner when one exists.
- The usage counter counts through `projects` (`countProjectIdentities`), which owns the membership queries.
