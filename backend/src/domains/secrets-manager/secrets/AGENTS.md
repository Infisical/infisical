# Secrets domain

Holds Secret Manager's permissions and the `secret_identities` usage counter for now; it grows as Secret Manager moves
into domains.

- **Every Secret Manager check goes through `secretsPermissionService.getSecretsPermission({ actor, projectId })`**,
  never `projectPermissionService.getProjectPermission`: folder grants and service tokens live only here. It takes
  the actor's `ProjectAccess` from Projects (`getProjectAccess` with `type: ProjectType.SecretManager`) and layers the
  folder grants over its role rules with `access.toPermission({ overrides: folderGrants.rules() })`, so a folder grant
  decides at its folder whatever the roles say there.
- **Folder grants** are `additional_privileges` rows with a `folderId` and a folder role, read through Access Control
  (`listFolderGrants`, `listProjectFolderGrants`) and placed at their folder's environment and exact path (not below
  it). They never apply to a built-in admin (a custom role slugged `admin` is not one), a grant whose folder is gone
  grants nothing, and an unknown folder role fails the check (`FolderRoleInvalid`) only when its rules are built.
  `FolderGrants.rules()` puts every grant's deny block before every allow block; keep that order, or one grant undoes
  another's allow at the same folder.
- **The folder rules** are in `models/folder-roles.ts`.
  A new action on a subject with a `secretPath` condition goes into `FOLDER_SCOPED_DENY_RULES`, or folder grants stop
  resetting it at their folder; `models/folder-grants.test.ts` fails until it does.
- **Cache:** an actor's folder grants are cached (`FolderGrantCache`) behind the actor's grants fingerprint plus the
  project's folder version, the Postgres counter `project-folder-permission-version:<projectId>`. Anything that changes a folder grant or moves, renames or deletes a folder or an
  environment must call `secretsPermissionService.within(tx).invalidateFolderGrants({ projectIds })` in its
  transaction (legacy code passes `sealKnexTransaction(trx)`), or `invalidateFolderGrants` when it has none, or
  readers keep the old paths for up to ten minutes.
- **A cache of answers built on the permission** (the secret list ETag) keys on
  `secretsPermissionService.getPermissionCacheFingerprint`, which reads the grant and folder grant caches' markers,
  never on `getPermissionFingerprint`, or a newer fingerprint gets paired with an answer built from older cached grants.
- **Read checks:** use `SecretReadAccess.can`, `.assert` and `.assertMove` with the permission, which accept the
  combined `DescribeAndReadValue` action where Read Value or Describe Secret is asked, and refuse with the requested
  action named.
- **Declared read-only exceptions** (no domain owns these tables yet; move each read to its owner when one exists):
  `secret_folders` and `project_environments` (`FolderLocationStore`), `service_tokens` (`ServiceTokenStore`),
  `users` and `identities` names (`MemberNameStore`). A project read for a caller that need not be a member (a
  service token's project, member listings, audits) goes through `projectsService.findProject`.
- The usage counter counts through Projects (`countProjectIdentities`), which owns the membership queries.
- Tests build the service with `testing/build-secrets-permission.ts`; other code's tests use
  `FakeSecretsPermissionService`.
