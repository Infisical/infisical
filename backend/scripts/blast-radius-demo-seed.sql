-- Blast Radius demo story: five secrets, one per exposure band.
--
-- Lays a narrative onto an existing dev project rather than creating one. Each of the five target secrets
-- lives in its own folder, because the distribution leg is folder-scoped (syncs and folder grants belong to
-- a folder, not a key) and secrets sharing a folder cannot be given different destination stories.
--
--   webhooks / SLACK_WEBHOOK      Critical  nobody with access has read it; three ghost readers have
--   platform / GH_APP_JWT         High      two ghosts, half the access unused, two broken destinations
--   billing  / STRIPE_SECRET_KEY  Elevated  some unused access, one unhealthy sync, a few months old
--   notify   / SENDGRID_API_KEY   Low       almost all access is used, one healthy sync, fresh value
--   web      / SEGMENT_WRITE_KEY  Low       all access is used, one healthy sync, changed this week
--
-- Ghost readers work because audit log actor metadata is denormalized: the email and name are copied into
-- the row at write time, so a principal that no longer exists still renders with its real label. Two kinds
-- are seeded, and the score weighs them differently: an identity that still exists but lost access reads as
-- "Access revoked", and an actor id present in no table at all reads as "Deleted".
--
-- Usage:
--   docker exec -i monorepo-db-1 psql -U infisical -d infisical \
--     -v project_slug="'risk-graph-zh-rh'" -v env_slug="'prod'" \
--     < backend/scripts/blast-radius-demo-seed.sql
--
-- Idempotent, and destructive within its scope: it clears every secret-read audit row for the demo project
-- before writing the story, because a stray read (someone revealing a value in the UI) would move the score
-- of whichever secret it touched.

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE demo AS
SELECT p.id AS project_id, p."orgId" AS org_id, e.id AS env_id, e.slug AS env_slug
FROM projects p
JOIN project_environments e ON e."projectId" = p.id
WHERE p.slug = :project_slug AND e.slug = :env_slug;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM demo) THEN
    RAISE EXCEPTION 'No project/environment matched. Check the -v values.';
  END IF;
END $$;

-- The five targets and the levers each one needs. `readers` is how many of the project's principals have
-- read it inside the window; the rest are drawn as entitled-but-unused, which is what the unused-access term
-- of the score measures.
CREATE TEMP TABLE target AS
SELECT *
FROM (
  VALUES
    ('webhooks', 'SLACK_WEBHOOK',     412, 0, 2, 'critical'),
    ('platform', 'GH_APP_JWT',        400, 2, 2, 'high'),
    ('billing',  'STRIPE_SECRET_KEY', 105, 3, 1, 'elevated'),
    ('notify',   'SENDGRID_API_KEY',  200, 4, 1, 'low'),
    ('web',      'SEGMENT_WRITE_KEY', 120, 5, 1, 'low')
) AS t(folder, secret_key, age_days, readers, dependents, band);

CREATE TEMP TABLE resolved AS
SELECT
  t.*,
  f.id AS folder_id,
  '/' || t.folder AS secret_path,
  s.id AS secret_id,
  d.project_id,
  d.org_id,
  d.env_slug
FROM target t
JOIN demo d ON true
JOIN secret_folders f ON f."envId" = d.env_id AND f.name = t.folder
JOIN secrets_v2 s ON s."folderId" = f.id AND s.key = t.secret_key;

DO $$
DECLARE
  missing int;
BEGIN
  SELECT 5 - count(*) INTO missing FROM resolved;
  IF missing <> 0 THEN
    RAISE EXCEPTION 'Only % of 5 target secrets resolved. The dev project does not match this story.', 5 - missing;
  END IF;
END $$;

-- The project's principals, numbered so a target can take "the first N" deterministically. Identities sort
-- before the human, so the low-scoring secrets are the ones a person has actually opened.
CREATE TEMP TABLE principal AS
SELECT row_number() OVER (ORDER BY kind, label) AS n, kind, actor_id, label
FROM (
  SELECT 'identity' AS kind, i.id::text AS actor_id, i.name AS label
  FROM memberships m
  JOIN identities i ON i.id = m."actorIdentityId"
  WHERE m."scopeProjectId" = (SELECT project_id FROM demo)
  UNION ALL
  SELECT 'user', u.id::text, u.email
  FROM memberships m
  JOIN users u ON u.id = m."actorUserId"
  WHERE m."scopeProjectId" = (SELECT project_id FROM demo)
) x;

-- 1. Give every target folder exactly one secret.
--
-- The distribution and destination-health terms of the score are folder-scoped, so a secret sharing a folder
-- with a target inherits its syncs, its broken syncs and its cross-project grants. Left alone, the two
-- secrets sitting beside SLACK_WEBHOOK scored High purely by association, which buries the intended spread.
-- Siblings move to a holding folder with no destinations of its own; the reference rows that point *at* a
-- target still match, because a reference is keyed on the referenced secret's path, not the referrer's.
INSERT INTO secret_folders (id, name, "envId", "parentId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'shared', d.env_id, root.id, now(), now()
FROM demo d
JOIN secret_folders root ON root."envId" = d.env_id AND root.name = 'root' AND root."parentId" IS NULL
WHERE NOT EXISTS (
  SELECT 1 FROM secret_folders f WHERE f."envId" = d.env_id AND f.name = 'shared'
);

UPDATE secrets_v2 s
SET "folderId" = (SELECT f.id FROM secret_folders f WHERE f."envId" = (SELECT env_id FROM demo) AND f.name = 'shared')
WHERE s."folderId" IN (SELECT folder_id FROM resolved)
  AND s.id NOT IN (SELECT secret_id FROM resolved);

-- 2. Repair demo sync rows whose destination does not match their connection or config.
--
-- An earlier seeder created rows claiming `github`/`vercel` destinations while pointing at an AWS app
-- connection and carrying a placeholder `destinationConfig`. The secret-syncs list endpoint validates its
-- response against a discriminated union keyed on destination, so those rows made that whole page fail with
-- a 500.
UPDATE secret_syncs
SET destination = 'aws-secrets-manager',
    "destinationConfig" = jsonb_build_object('region', 'us-east-1', 'mappingBehavior', 'one-to-one', 'seedTag', 'risk-graph-demo')
WHERE "destinationConfig"->>'seedTag' = 'risk-graph-demo'
  AND "destinationConfig"->>'region' IS NULL;

-- 3. Reset everything this script owns, so re-running replaces the story rather than stacking onto it.
DELETE FROM audit_logs
WHERE "projectId" = (SELECT project_id FROM demo)
  AND "eventType" IN ('get-secret', 'get-secrets', 'dashboard-get-secret-value', 'dashboard-get-secret-version-value');

DELETE FROM secret_syncs WHERE "destinationConfig"->>'seedTag' = 'blast-radius-demo';
DELETE FROM project_folder_grants WHERE "sourceProjectId" = (SELECT project_id FROM demo);

-- References to a target are declared by this script, not inherited: the count is a scoring lever, so the
-- pre-existing rows are cleared and re-inserted rather than added to.
DELETE FROM secret_references_v2 ref
USING resolved r
WHERE ref.environment = r.env_slug AND ref."secretPath" = r.secret_path AND ref."secretKey" = r.secret_key;

-- 4. Sync health per folder. Every existing sync is first made healthy and recent, so only the ones this
-- story breaks are unhealthy; a null `lastSyncedAt` already counts as stale.
UPDATE secret_syncs
SET "syncStatus" = 'succeeded',
    "isAutoSyncEnabled" = true,
    "lastSyncMessage" = NULL,
    "lastSyncedAt" = now() - interval '4 minutes'
WHERE "projectId" = (SELECT project_id FROM demo);

-- webhooks: one failing, one manual, and one stale mirror added below. Three unhealthy destinations is the
-- top of that scoring term.
UPDATE secret_syncs
SET "syncStatus" = 'failed',
    "lastSyncMessage" = 'AccessDeniedException: the sync credential is no longer authorised for this secret',
    "lastSyncedAt" = now() - interval '3 days'
WHERE name = 'checkout-actions' AND "projectId" = (SELECT project_id FROM demo);

UPDATE secret_syncs
SET "isAutoSyncEnabled" = false
WHERE name = 'prod-api-secrets' AND "projectId" = (SELECT project_id FROM demo);

-- platform: one stale, one manual.
UPDATE secret_syncs
SET "lastSyncedAt" = now() - interval '41 days'
WHERE name = 'platform-prod-secrets' AND "projectId" = (SELECT project_id FROM demo);

INSERT INTO secret_syncs (
  id, name, description, destination, "isAutoSyncEnabled", version, "destinationConfig", "syncOptions",
  "projectId", "folderId", "connectionId", "syncStatus", "lastSyncedAt", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  spec.name,
  spec.description,
  'aws-secrets-manager',
  spec.auto_sync,
  1,
  jsonb_build_object('region', 'us-east-1', 'mappingBehavior', 'one-to-one', 'seedTag', 'blast-radius-demo'),
  jsonb_build_object('initialSyncBehavior', 'overwrite-destination'),
  r.project_id,
  r.folder_id,
  (SELECT id FROM app_connections WHERE "orgId" = (SELECT org_id FROM demo) AND app = 'aws' ORDER BY "createdAt" LIMIT 1),
  'succeeded',
  spec.last_synced_at,
  now(),
  now()
FROM resolved r
JOIN (
  VALUES
    ('webhooks', 'webhooks-dr-mirror',     'Disaster-recovery mirror, second region', true,  now() - interval '44 days'),
    ('platform', 'platform-legacy-mirror', 'Legacy mirror, pushed by hand',           false, now() - interval '2 hours'),
    ('billing',  'billing-eu-mirror',      'EU region mirror',                        true,  now() - interval '38 days')
) AS spec(folder, name, description, auto_sync, last_synced_at) ON spec.folder = r.folder;

-- 5. Cross-project reach. A folder grant is always cross-project, which is what makes it the heaviest kind
-- of destination: the value is readable by principals this project does not administer.
INSERT INTO project_folder_grants (id, "sourceProjectId", "sourceFolderId", "targetProjectId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), r.project_id, r.folder_id, other.id, now(), now()
FROM resolved r
JOIN projects other ON other."orgId" = r.org_id AND other.id <> r.project_id
WHERE r.folder IN ('webhooks', 'platform')
ON CONFLICT ("sourceProjectId", "sourceFolderId", "targetProjectId") DO NOTHING;

-- 6. Secrets that reference the target, so the graph has dependents that resolve rather than break.
INSERT INTO secret_references_v2 (id, environment, "secretPath", "secretKey", "secretId")
SELECT gen_random_uuid(), r.env_slug, r.secret_path, r.secret_key, dependent.id
FROM resolved r
JOIN LATERAL (
  SELECT s.id
  FROM secrets_v2 s
  JOIN secret_folders f ON f.id = s."folderId"
  WHERE f."envId" = (SELECT env_id FROM demo)
    AND s.id NOT IN (SELECT secret_id FROM resolved)
  ORDER BY s.key
  LIMIT r.dependents
) AS dependent ON true
WHERE r.dependents > 0
  AND NOT EXISTS (
    SELECT 1 FROM secret_references_v2 existing
    WHERE existing."secretId" = dependent.id
      AND existing.environment = r.env_slug
      AND existing."secretPath" = r.secret_path
      AND existing."secretKey" = r.secret_key
  );

-- 7. Reads by principals that still have access. Counts differ per principal so edge thickness varies, and
-- one identity reads in bulk without recording which keys it returned, which is what the `~` and the
-- `folder-level` badge exist to disclose.
INSERT INTO audit_logs (
  id, actor, "actorMetadata", "ipAddress", "eventType", "eventMetadata",
  "userAgent", "userAgentType", "orgId", "projectId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  p.kind,
  CASE
    WHEN p.kind = 'user' THEN jsonb_build_object('userId', p.actor_id, 'email', p.label, 'username', p.label, 'authMethod', 'email')
    ELSE jsonb_build_object('identityId', p.actor_id, 'name', p.label, 'authMethod', 'token-auth')
  END,
  '198.51.100.' || (10 + p.n)::text,
  'get-secret',
  jsonb_build_object(
    'environment', r.env_slug,
    'secretPath', r.secret_path,
    'secretKey', r.secret_key,
    'secretId', r.secret_id,
    'secretVersion', 1,
    'blastRadiusDemo', 'true'
  ),
  CASE WHEN p.kind = 'user' THEN 'Mozilla/5.0' ELSE 'cli' END,
  CASE WHEN p.kind = 'user' THEN 'web' ELSE 'cli' END,
  r.org_id,
  r.project_id,
  now() - ((p.n * 40 + gs) || ' minutes')::interval,
  now()
FROM resolved r
JOIN principal p ON p.n <= r.readers
CROSS JOIN generate_series(1, 12) AS gs
WHERE NOT (r.folder = 'platform' AND p.n = 1);

-- The bulk reader on the high-scoring secret: a folder fetch with no `secretIds`, so it can only be
-- attributed to the folder. This is what pre-`secretIds` history looks like, and it has to stay in the demo
-- for as long as the product still renders folder precision.
INSERT INTO audit_logs (
  id, actor, "actorMetadata", "ipAddress", "eventType", "eventMetadata",
  "userAgent", "userAgentType", "orgId", "projectId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  'identity',
  jsonb_build_object('identityId', p.actor_id, 'name', p.label, 'authMethod', 'token-auth'),
  '198.51.100.60',
  'get-secrets',
  jsonb_build_object(
    'environment', r.env_slug,
    'secretPath', r.secret_path,
    'numberOfSecrets', 4,
    'blastRadiusDemo', 'true'
  ),
  'terraform',
  'terraform',
  r.org_id,
  r.project_id,
  now() - (gs || ' hours')::interval,
  now()
FROM resolved r
JOIN principal p ON p.n = 1
CROSS JOIN generate_series(1, 45) AS gs
WHERE r.folder = 'platform';

-- 8. Ghost readers. `legacy-etl` and `old-ci-runner` exist in the org but hold no membership on this project,
-- so they render as "Access revoked". The other two actor ids are deliberately present in no table at all.
INSERT INTO identities (id, name, "orgId", "authMethod", "createdAt", "updatedAt")
SELECT gen_random_uuid(), spec.name, (SELECT org_id FROM demo), 'token-auth', now(), now()
FROM (VALUES ('legacy-etl'), ('old-ci-runner')) AS spec(name)
WHERE NOT EXISTS (
  SELECT 1 FROM identities i WHERE i.name = spec.name AND i."orgId" = (SELECT org_id FROM demo)
);

INSERT INTO audit_logs (
  id, actor, "actorMetadata", "ipAddress", "eventType", "eventMetadata",
  "userAgent", "userAgentType", "orgId", "projectId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  'identity',
  jsonb_build_object('identityId', ghost.id, 'name', ghost.name, 'authMethod', 'token-auth'),
  '198.51.100.44',
  'get-secret',
  jsonb_build_object(
    'environment', r.env_slug,
    'secretPath', r.secret_path,
    'secretKey', r.secret_key,
    'secretId', r.secret_id,
    'secretVersion', 1,
    'blastRadiusDemo', 'true'
  ),
  'cli',
  'cli',
  r.org_id,
  r.project_id,
  now() - interval '19 days' - (gs || ' hours')::interval,
  now()
FROM resolved r
JOIN (
  VALUES ('webhooks', 'legacy-etl'), ('platform', 'legacy-etl'), ('platform', 'old-ci-runner')
) AS spec(folder, identity_name) ON spec.folder = r.folder
JOIN identities ghost ON ghost.name = spec.identity_name AND ghost."orgId" = r.org_id
CROSS JOIN generate_series(1, 12) AS gs;

-- Deleted actors, only on the critical secret: they are what pushes its ghost term to the top.
INSERT INTO audit_logs (
  id, actor, "actorMetadata", "ipAddress", "eventType", "eventMetadata",
  "userAgent", "userAgentType", "orgId", "projectId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  spec.actor,
  spec.actor_metadata,
  spec.ip,
  'get-secret',
  jsonb_build_object(
    'environment', r.env_slug,
    'secretPath', r.secret_path,
    'secretKey', r.secret_key,
    'secretId', r.secret_id,
    'secretVersion', 1,
    'blastRadiusDemo', 'true'
  ),
  spec.user_agent,
  spec.user_agent_type,
  r.org_id,
  r.project_id,
  now() - (spec.days_ago || ' days')::interval - (gs || ' hours')::interval,
  now()
FROM resolved r
JOIN (
  VALUES
    (
      'user',
      jsonb_build_object('userId', '00000000-0000-4000-8000-00000000dead', 'email', 'daniel@acme.io', 'username', 'daniel@acme.io', 'authMethod', 'email'),
      '203.0.113.24', 'Mozilla/5.0', 'web', 11
    ),
    (
      'identity',
      jsonb_build_object('identityId', '00000000-0000-4000-8000-0000000dead2', 'name', 'tf-runner-old', 'authMethod', 'token-auth'),
      '198.51.100.7', 'terraform', 'terraform', 6
    )
) AS spec(actor, actor_metadata, ip, user_agent, user_agent_type, days_ago) ON true
CROSS JOIN generate_series(1, 7) AS gs
WHERE r.folder = 'webhooks';

-- 9. The caller behind a machine identity.
--
-- `actorMetadata` carries the auth details for the methods that can prove them: the assumed AWS role, the
-- Kubernetes service account, the OIDC claim set. Token auth records nothing, because whoever presents the
-- credential is indistinguishable from whoever should — so the demo gives the two readers of the high-scoring
-- secret a provable caller each, and leaves the rest as token auth to show both states side by side.
UPDATE audit_logs a
SET "actorMetadata" = a."actorMetadata" || jsonb_build_object(
      'authMethod', 'kubernetes-auth',
      'kubernetes', jsonb_build_object('namespace', 'platform', 'name', 'github-app-refresher')
    )
FROM resolved r
WHERE a."eventMetadata"->>'blastRadiusDemo' = 'true'
  AND a."eventMetadata"->>'secretPath' = r.secret_path
  AND r.folder = 'platform'
  AND a."actorMetadata"->>'name' = (SELECT label FROM principal WHERE n = 2);

UPDATE audit_logs a
SET "actorMetadata" = a."actorMetadata" || jsonb_build_object(
      'authMethod', 'oidc-auth',
      'oidc', jsonb_build_object(
        'claims', jsonb_build_object(
          'repository', 'acme/platform-deploy',
          'workflow', 'release.yml',
          'actor', 'maya',
          'sub', 'repo:acme/platform-deploy:ref:refs/heads/main'
        )
      )
    )
FROM resolved r
WHERE a."eventMetadata"->>'blastRadiusDemo' = 'true'
  AND a."eventMetadata"->>'secretPath' = r.secret_path
  AND r.folder = 'platform'
  AND a."actorMetadata"->>'name' = (SELECT label FROM principal WHERE n = 1);

-- A ghost reader with a provable caller is the strongest version of that finding: the identity is gone, but
-- the workflow that drove it is still named and can be gone and checked.
UPDATE audit_logs a
SET "actorMetadata" = a."actorMetadata" || jsonb_build_object(
      'authMethod', 'oidc-auth',
      'oidc', jsonb_build_object(
        'claims', jsonb_build_object(
          'repository', 'acme/legacy-etl',
          'workflow', 'nightly.yml',
          'actor', 'daniel',
          'sub', 'repo:acme/legacy-etl:ref:refs/heads/main'
        )
      )
    )
WHERE a."eventMetadata"->>'blastRadiusDemo' = 'true'
  AND a."actorMetadata"->>'name' = 'old-ci-runner';

-- 10. Quiet the rest of the project.
--
-- The ranking is project-wide and across environments, and unused access is worth 15 points, so every secret
-- nobody reads floats near the Elevated band and buries the two Low targets. One bulk read per folder per
-- principal fixes that in a handful of rows rather than one set per secret, because a folder fetch is matched
-- on the path. Target folders are excluded: their read counts are the story.
INSERT INTO audit_logs (
  id, actor, "actorMetadata", "ipAddress", "eventType", "eventMetadata",
  "userAgent", "userAgentType", "orgId", "projectId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  p.kind,
  CASE
    WHEN p.kind = 'user' THEN jsonb_build_object('userId', p.actor_id, 'email', p.label, 'username', p.label, 'authMethod', 'email')
    ELSE jsonb_build_object('identityId', p.actor_id, 'name', p.label, 'authMethod', 'token-auth')
  END,
  '198.51.100.' || (100 + p.n)::text,
  'get-secrets',
  jsonb_build_object(
    'environment', e.slug,
    'secretPath', paths.path,
    'numberOfSecrets', 4,
    'secretIds', paths.secret_ids,
    'blastRadiusDemo', 'true'
  ),
  'cli',
  'cli',
  (SELECT org_id FROM demo),
  (SELECT project_id FROM demo),
  now() - ((p.n * 7) || ' hours')::interval,
  now()
FROM project_environments e
JOIN LATERAL (
  SELECT f.id, '/' || f.name AS path, jsonb_agg(s.id) AS secret_ids
  FROM secret_folders f
  JOIN secrets_v2 s ON s."folderId" = f.id
  WHERE f."envId" = e.id AND f.id NOT IN (SELECT folder_id FROM resolved)
  GROUP BY f.id, f.name
) AS paths ON true
CROSS JOIN principal p
WHERE e."projectId" = (SELECT project_id FROM demo);

-- 11. Value age. `secrets_v2` carries an on-update trigger that rewrites `updatedAt`, so the age is read from
-- the current version row instead, which is created here when the seeded data has no version history.
INSERT INTO secret_versions_v2 (id, version, type, key, "secretId", "folderId", "createdAt", "updatedAt")
SELECT gen_random_uuid(), s.version, 'shared', s.key, s.id, s."folderId", now() - (r.age_days || ' days')::interval, now()
FROM resolved r
JOIN secrets_v2 s ON s.id = r.secret_id
WHERE NOT EXISTS (
  SELECT 1 FROM secret_versions_v2 sv WHERE sv."secretId" = s.id AND sv.version = s.version
);

UPDATE secret_versions_v2 sv
SET "createdAt" = now() - (r.age_days || ' days')::interval
FROM resolved r
JOIN secrets_v2 s ON s.id = r.secret_id
WHERE sv."secretId" = s.id AND sv.version = s.version;

COMMIT;

SELECT
  r.band AS intended_band,
  r.secret_path,
  r.secret_key,
  r.readers AS readers_with_access,
  r.age_days,
  (SELECT count(*) FROM secret_syncs ss WHERE ss."folderId" = r.folder_id) AS syncs,
  (SELECT count(*) FROM project_folder_grants g WHERE g."sourceFolderId" = r.folder_id) AS folder_grants,
  (
    SELECT count(DISTINCT ref."secretId")
    FROM secret_references_v2 ref
    WHERE ref.environment = r.env_slug AND ref."secretPath" = r.secret_path AND ref."secretKey" = r.secret_key
  ) AS referencing_secrets
FROM resolved r
ORDER BY r.age_days DESC;
