-- Blast Radius demo story.
--
-- Layers a demo narrative onto an existing dev project rather than creating one, so it runs against
-- whatever data is already in the local database:
--
--   * one sync left failing and one left stale, so rotation simulation has real blockers
--   * one sync switched to manual, so "someone has to push this by hand" appears
--   * two ghost readers: a former teammate whose access was revoked, and a deleted CI identity
--   * a stale consumer whose last read predates the current value, so it reads as caching
--
-- Ghost readers work because audit log actor metadata is denormalized: the email and name are copied
-- into the row at write time, so a principal that no longer exists still renders with its real label.
--
-- Usage:
--   docker exec -i monorepo-db-1 psql -U infisical -d infisical \
--     -v project_slug="'risk-graph-zh-rh'" -v env_slug="'prod'" -v folder_name="'webhooks'" \
--     < backend/scripts/blast-radius-demo-seed.sql
--
-- Idempotent: re-running replaces the demo audit rows rather than stacking them.

\set ON_ERROR_STOP on

BEGIN;

CREATE TEMP TABLE demo_target AS
SELECT
  p.id   AS project_id,
  p."orgId" AS org_id,
  e.id   AS env_id,
  e.slug AS env_slug,
  f.id   AS folder_id,
  '/' || :folder_name AS secret_path,
  (
    SELECT s.key
    FROM secrets_v2 s
    WHERE s."folderId" = f.id
    ORDER BY s."createdAt"
    LIMIT 1
  ) AS secret_key,
  -- Single-key read events are attributed by `secretId`, not by key, so a demo row has to carry the
  -- real id. A fabricated one silently matches nothing and the reader vanishes from the graph.
  (
    SELECT s.id
    FROM secrets_v2 s
    WHERE s."folderId" = f.id
    ORDER BY s."createdAt"
    LIMIT 1
  ) AS secret_id
FROM projects p
JOIN project_environments e ON e."projectId" = p.id
JOIN secret_folders f ON f."envId" = e.id
WHERE p.slug = :project_slug
  AND e.slug = :env_slug
  AND f.name = :folder_name;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM demo_target WHERE secret_key IS NOT NULL) THEN
    RAISE EXCEPTION 'No secret found for the requested project/environment/folder. Check the -v values.';
  END IF;
END $$;

-- 0. Repair demo sync rows whose destination does not match their connection or config.
--
-- An earlier seeder created rows claiming `github`/`vercel` destinations while pointing at an AWS app
-- connection and carrying a placeholder `destinationConfig`. The secret-syncs list endpoint validates its
-- response against a discriminated union keyed on destination, so those rows made that whole page fail
-- with a 500. Only rows tagged by the demo seeder and still missing a real config are touched; a sync
-- someone configured properly is left alone.
UPDATE secret_syncs
SET destination = 'aws-secrets-manager',
    "destinationConfig" = jsonb_build_object(
      'region', 'us-east-1',
      'mappingBehavior', 'one-to-one',
      'seedTag', 'risk-graph-demo'
    )
WHERE "destinationConfig"->>'seedTag' = 'risk-graph-demo'
  AND "destinationConfig"->>'region' IS NULL;

-- 1. Break the distribution leg in three different ways, so the simulation has one of each.
UPDATE secret_syncs
SET "syncStatus" = 'failed',
    "lastSyncMessage" = 'AccessDeniedException: the sync credential is no longer authorised for this secret',
    "lastSyncedAt" = now() - interval '3 days'
WHERE id = (
  SELECT ss.id FROM secret_syncs ss, demo_target t
  WHERE ss."folderId" = t.folder_id
  ORDER BY ss.name
  LIMIT 1
);

-- Stale and manual only apply when the folder has enough syncs to spare one each; with two syncs the
-- folder gets one failing and one manual rather than silently leaving a state unrepresented.
UPDATE secret_syncs
SET "syncStatus" = 'succeeded',
    "lastSyncedAt" = now() - interval '34 days'
WHERE id = (
  SELECT ss.id FROM secret_syncs ss, demo_target t
  WHERE ss."folderId" = t.folder_id AND ss."syncStatus" IS DISTINCT FROM 'failed'
  ORDER BY ss.name
  OFFSET 1 LIMIT 1
);

UPDATE secret_syncs
SET "isAutoSyncEnabled" = false
WHERE id = (
  SELECT ss.id FROM secret_syncs ss, demo_target t
  WHERE ss."folderId" = t.folder_id AND ss."syncStatus" IS DISTINCT FROM 'failed'
  ORDER BY ss.name
  LIMIT 1
);

-- 2. Ghost readers. Both actor ids are deliberately absent from `users` / `identities`: one models a
-- teammate whose access was revoked, the other an identity deleted outright.
DELETE FROM audit_logs
WHERE "eventMetadata"->>'blastRadiusDemo' = 'true';

INSERT INTO audit_logs (
  id, actor, "actorMetadata", "ipAddress", "eventType", "eventMetadata",
  "userAgent", "userAgentType", "orgId", "projectId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  'user',
  jsonb_build_object(
    'userId', '00000000-0000-4000-8000-00000000dead',
    'email', 'daniel@acme.io',
    'username', 'daniel@acme.io',
    'authMethod', 'email'
  ),
  '203.0.113.24',
  'get-secret',
  jsonb_build_object(
    'environment', t.env_slug,
    'secretPath', t.secret_path,
    'secretKey', t.secret_key,
    'secretId', t.secret_id,
    'secretVersion', 1,
    'blastRadiusDemo', 'true'
  ),
  'Mozilla/5.0',
  'web',
  t.org_id,
  t.project_id,
  now() - interval '11 days' - (gs || ' hours')::interval,
  now()
FROM demo_target t, generate_series(1, 7) AS gs;

INSERT INTO audit_logs (
  id, actor, "actorMetadata", "ipAddress", "eventType", "eventMetadata",
  "userAgent", "userAgentType", "orgId", "projectId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  'identity',
  jsonb_build_object(
    'identityId', '00000000-0000-4000-8000-0000000dead2',
    'name', 'tf-runner-old',
    'authMethod', 'token-auth'
  ),
  '198.51.100.7',
  'get-secrets',
  jsonb_build_object(
    'environment', t.env_slug,
    'secretPath', t.secret_path,
    'numberOfSecrets', 4,
    'blastRadiusDemo', 'true'
  ),
  'terraform',
  'terraform',
  t.org_id,
  t.project_id,
  now() - interval '6 days' - (gs || ' minutes')::interval,
  now()
FROM demo_target t, generate_series(1, 41) AS gs;

-- 3. A consumer that is still entitled but last read the value before the current version existed, so
-- it reads as caching an old value. Uses whichever identity already has access to the folder.
INSERT INTO audit_logs (
  id, actor, "actorMetadata", "ipAddress", "eventType", "eventMetadata",
  "userAgent", "userAgentType", "orgId", "projectId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  'identity',
  jsonb_build_object('identityId', i.id, 'name', i.name, 'authMethod', 'token-auth'),
  '198.51.100.31',
  'get-secrets',
  jsonb_build_object(
    'environment', t.env_slug,
    'secretPath', t.secret_path,
    'numberOfSecrets', 4,
    'blastRadiusDemo', 'true'
  ),
  'cli',
  'cli',
  t.org_id,
  t.project_id,
  now() - interval '26 days',
  now()
FROM demo_target t
JOIN memberships m ON m."scopeProjectId" = t.project_id AND m."actorIdentityId" IS NOT NULL
JOIN identities i ON i.id = m."actorIdentityId"
ORDER BY i.name
LIMIT 1;

-- 4. A ghost reader that still exists. The one above models a deleted identity; this one models a
-- machine identity that is still in the org but no longer has access to the project, which is the
-- "Access revoked" state rather than "Deleted".
INSERT INTO identities (id, name, "orgId", "authMethod", "createdAt", "updatedAt")
SELECT '00000000-0000-4000-8000-00000000ce55', 'legacy-etl', t.org_id, 'token-auth', now(), now()
FROM demo_target t
ON CONFLICT (id) DO NOTHING;

INSERT INTO audit_logs (
  id, actor, "actorMetadata", "ipAddress", "eventType", "eventMetadata",
  "userAgent", "userAgentType", "orgId", "projectId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  'identity',
  jsonb_build_object(
    'identityId', '00000000-0000-4000-8000-00000000ce55',
    'name', 'legacy-etl',
    'authMethod', 'token-auth'
  ),
  '198.51.100.44',
  'get-secrets',
  jsonb_build_object(
    'environment', t.env_slug,
    'secretPath', t.secret_path,
    'numberOfSecrets', 4,
    'blastRadiusDemo', 'true'
  ),
  'cli',
  'cli',
  t.org_id,
  t.project_id,
  now() - interval '19 days' - (gs || ' hours')::interval,
  now()
FROM demo_target t, generate_series(1, 12) AS gs;

-- 5. A bulk read that recorded which secrets it returned, so it attributes exactly despite being a
-- folder fetch. Paired with the folder-precision readers above, the demo shows both precisions, which is
-- the real state of any project whose retention window straddles the change that added `secretIds`.
INSERT INTO audit_logs (
  id, actor, "actorMetadata", "ipAddress", "eventType", "eventMetadata",
  "userAgent", "userAgentType", "orgId", "projectId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  'identity',
  jsonb_build_object('identityId', i.id, 'name', i.name, 'authMethod', 'token-auth'),
  '198.51.100.90',
  'get-secrets',
  jsonb_build_object(
    'environment', t.env_slug,
    'secretPath', t.secret_path,
    'numberOfSecrets', 3,
    'secretIds', jsonb_build_array(t.secret_id),
    'blastRadiusDemo', 'true'
  ),
  'cli',
  'cli',
  t.org_id,
  t.project_id,
  now() - (gs || ' hours')::interval,
  now()
FROM demo_target t
JOIN memberships m ON m."scopeProjectId" = t.project_id AND m."actorIdentityId" IS NOT NULL
JOIN identities i ON i.id = m."actorIdentityId"
CROSS JOIN generate_series(1, 5) AS gs
WHERE i.name = (
  SELECT i2.name
  FROM memberships m2
  JOIN identities i2 ON i2.id = m2."actorIdentityId"
  WHERE m2."scopeProjectId" = t.project_id AND m2."actorIdentityId" IS NOT NULL
  ORDER BY i2.name DESC
  LIMIT 1
);

-- 6. Age the current value so the "overdue anyway" side of the simulation has something to say.
-- `secrets_v2` carries an on-update trigger that rewrites `updatedAt`, so ageing the secret row is not
-- possible. The age is read from the current version row instead, which is created here when the
-- seeded data has no version history.
INSERT INTO secret_versions_v2 (
  id, version, type, key, "secretId", "folderId", "createdAt", "updatedAt"
)
SELECT gen_random_uuid(), s.version, 'shared', s.key, s.id, s."folderId", now() - interval '412 days', now()
FROM secrets_v2 s, demo_target t
WHERE s."folderId" = t.folder_id
  AND s.key = t.secret_key
  AND NOT EXISTS (
    SELECT 1 FROM secret_versions_v2 sv WHERE sv."secretId" = s.id AND sv.version = s.version
  );

UPDATE secret_versions_v2 sv
SET "createdAt" = now() - interval '412 days'
FROM secrets_v2 s, demo_target t
WHERE sv."secretId" = s.id
  AND s."folderId" = t.folder_id
  AND s.key = t.secret_key
  AND sv.version = s.version;

COMMIT;

SELECT
  t.project_id,
  t.env_slug,
  t.secret_path,
  t.secret_key,
  (SELECT count(*) FROM audit_logs a WHERE a."eventMetadata"->>'blastRadiusDemo' = 'true') AS demo_audit_rows
FROM demo_target t;
