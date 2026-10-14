-- Seeds legacy secret change approval policies and requests (secret_approval_* tables) covering approval
-- counts, group approvers, self-approval, soft enforcement and bypassers, machine identity and deleted
-- committers, replication, tags, merge conflicts and deleted policies. Every request, commit and review
-- row is written the way the legacy service writes it, including states only reachable through deleted
-- users or groups or through duplicates the API accepts (see the notes on p03, p08, p10, p13, p17, p18
-- and p19).
--
-- Usage: edit the three ids in seed_params, then run the whole file (psql -f, or pgAdmin's query tool).
--   docker exec -i infisical-db-1 psql -U infisical -d infisical -v ON_ERROR_STOP=1 < legacy-secret-change-approvals-seed.sql
--
-- The project must be on V3, the only version the migration moves. A V3 project can no longer create
-- legacy policies, so these stand in for policies created before the global approval system took over.
--
-- Secret values and comments are empty: SQL cannot encrypt with the project's KMS key, and every read path
-- treats a NULL ciphertext as an empty or unchanged value. Merges write the secrets and their versions, but
-- not folder commits.
--
-- Re-running is safe: it first deletes every legacy secret approval policy in the project whose name
-- matches ^p[0-9]{2}- together with its requests, plus any global copies the migration made of them (same
-- ids) and global requests filed against those copies, and every folder this seed created (marked by its
-- description) with the secrets in it.
--
-- The migration is already recorded as applied on a dev DB that ran it, so roll it back and re-run it to
-- migrate a fresh seed.

BEGIN;

CREATE TEMP TABLE seed_params ON COMMIT DROP AS
SELECT
  'b74165da-868a-4912-8887-58488b5a6cf5'::text AS project_id,
  'ee1008ae-1082-4be2-90e6-b979e82f2476'::uuid AS admin_id,     -- project admin: approver and reviewer
  '1e10c1da-e8c1-4100-ab70-0eaae8b6b639'::uuid AS requester_id; -- project member: files the requests

-- Every write takes the next instant on one timeline, so the rows read in the order the script runs.
CREATE TEMP TABLE seed_clock ON COMMIT DROP AS SELECT now() - interval '3 hours' AS at;
CREATE TEMP TABLE seed_policies (name text PRIMARY KEY, id uuid NOT NULL, path text NOT NULL, created_at timestamptz NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE seed_requests (key text PRIMARY KEY, id uuid NOT NULL, folder_id uuid NOT NULL, updated_at timestamptz NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE seed_review_revisions (id uuid PRIMARY KEY, updated_at timestamptz NOT NULL) ON COMMIT DROP;

-- ---------------------------------------------------------------------------------------------------
-- Helpers (session-scoped, gone when the connection closes)
-- ---------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.project() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT project_id FROM seed_params $$;
CREATE OR REPLACE FUNCTION pg_temp.admin() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT admin_id FROM seed_params $$;
CREATE OR REPLACE FUNCTION pg_temp.requester() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT requester_id FROM seed_params $$;
CREATE OR REPLACE FUNCTION pg_temp.folder_marker() RETURNS text LANGUAGE sql IMMUTABLE AS
$$ SELECT 'Created by legacy-secret-change-approvals-seed.sql' $$;

CREATE OR REPLACE FUNCTION pg_temp.tick(p_step interval) RETURNS timestamptz LANGUAGE sql AS
$$ UPDATE seed_clock SET at = at + p_step RETURNING at $$;

CREATE OR REPLACE FUNCTION pg_temp.env_id(p_slug text) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM project_environments
  WHERE "projectId" = pg_temp.project() AND slug = p_slug AND "deleteAfter" IS NULL;
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Environment "%" not found in project %', p_slug, pg_temp.project();
  END IF;
  RETURN v_id;
END $$;

-- Find or create a group in the project's org, make it a project member, and set its members to
-- exactly p_member (or nobody).
CREATE OR REPLACE FUNCTION pg_temp.seed_group(p_slug text, p_member uuid) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_org uuid;
  v_group uuid;
  v_membership uuid;
BEGIN
  SELECT "orgId" INTO v_org FROM projects WHERE id = pg_temp.project();
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Project % not found', pg_temp.project();
  END IF;

  SELECT id INTO v_group FROM groups WHERE "orgId" = v_org AND (slug = p_slug OR name = p_slug);
  IF v_group IS NULL THEN
    INSERT INTO groups ("orgId", name, slug) VALUES (v_org, p_slug, p_slug) RETURNING id INTO v_group;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM memberships WHERE scope = 'organization' AND "scopeOrgId" = v_org AND "actorGroupId" = v_group) THEN
    INSERT INTO memberships (scope, "actorGroupId", "scopeOrgId") VALUES ('organization', v_group, v_org)
    RETURNING id INTO v_membership;
    INSERT INTO membership_roles ("membershipId", role) VALUES (v_membership, 'no-access');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM memberships WHERE scope = 'project' AND "scopeProjectId" = pg_temp.project() AND "actorGroupId" = v_group) THEN
    INSERT INTO memberships (scope, "actorGroupId", "scopeOrgId", "scopeProjectId")
    VALUES ('project', v_group, v_org, pg_temp.project())
    RETURNING id INTO v_membership;
    INSERT INTO membership_roles ("membershipId", role) VALUES (v_membership, 'member');
  END IF;

  DELETE FROM user_group_membership WHERE "groupId" = v_group AND "userId" IS DISTINCT FROM p_member;
  IF p_member IS NOT NULL AND NOT EXISTS (SELECT 1 FROM user_group_membership WHERE "groupId" = v_group AND "userId" = p_member) THEN
    INSERT INTO user_group_membership ("userId", "groupId") VALUES (p_member, v_group);
  END IF;

  RETURN v_group;
END $$;

-- Find or create an org-level machine identity and make it a project member. It has no auth method, so it
-- only ever appears as the committer of the requests below.
CREATE OR REPLACE FUNCTION pg_temp.seed_identity(p_name text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_org uuid;
  v_identity uuid;
  v_membership uuid;
BEGIN
  SELECT "orgId" INTO v_org FROM projects WHERE id = pg_temp.project();

  SELECT id INTO v_identity FROM identities WHERE "orgId" = v_org AND name = p_name AND "projectId" IS NULL;
  IF v_identity IS NULL THEN
    INSERT INTO identities (name, "orgId") VALUES (p_name, v_org) RETURNING id INTO v_identity;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM memberships WHERE scope = 'organization' AND "scopeOrgId" = v_org AND "actorIdentityId" = v_identity) THEN
    INSERT INTO memberships (scope, "actorIdentityId", "scopeOrgId") VALUES ('organization', v_identity, v_org)
    RETURNING id INTO v_membership;
    INSERT INTO membership_roles ("membershipId", role) VALUES (v_membership, 'no-access');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM memberships WHERE scope = 'project' AND "scopeProjectId" = pg_temp.project() AND "actorIdentityId" = v_identity) THEN
    INSERT INTO memberships (scope, "actorIdentityId", "scopeOrgId", "scopeProjectId")
    VALUES ('project', v_identity, v_org, pg_temp.project())
    RETURNING id INTO v_membership;
    INSERT INTO membership_roles ("membershipId", role) VALUES (v_membership, 'member');
  END IF;

  RETURN v_identity;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.seed_tag(p_slug text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM secret_tags WHERE "projectId" = pg_temp.project() AND slug = p_slug;
  IF v_id IS NULL THEN
    INSERT INTO secret_tags (slug, color, "projectId", "createdBy", "createdByActorType")
    VALUES (p_slug, '#e11d48', pg_temp.project(), pg_temp.admin(), 'user')
    RETURNING id INTO v_id;
  END IF;
  RETURN v_id;
END $$;

-- Find or create the folder at p_path, one segment at a time. Folders created here carry folder_marker()
-- as their description, which is how the next run finds and deletes them.
CREATE OR REPLACE FUNCTION pg_temp.seed_folder(p_env text, p_path text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_env uuid := pg_temp.env_id(p_env);
  v_folder uuid;
  v_child uuid;
  v_name text;
BEGIN
  SELECT id INTO v_folder FROM secret_folders WHERE "envId" = v_env AND "parentId" IS NULL;
  FOR v_name IN SELECT unnest(string_to_array(trim(BOTH '/' FROM p_path), '/')) LOOP
    CONTINUE WHEN v_name = '';
    SELECT id INTO v_child FROM secret_folders WHERE "parentId" = v_folder AND name = v_name;
    IF v_child IS NULL THEN
      INSERT INTO secret_folders (name, "envId", "parentId", description, "createdAt", "updatedAt")
      SELECT v_name, v_env, v_folder, pg_temp.folder_marker(), at, at FROM seed_clock
      RETURNING id INTO v_child;
    END IF;
    v_folder := v_child;
  END LOOP;
  RETURN v_folder;
END $$;

-- The reserved folder secret replication writes into, named after the import it replicates. No import row
-- is created, so nothing replicates into it for real.
CREATE OR REPLACE FUNCTION pg_temp.seed_replication_folder(p_env text, p_path text) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_parent uuid := pg_temp.seed_folder(p_env, p_path);
  v_folder uuid;
BEGIN
  SELECT id INTO v_folder FROM secret_folders WHERE "parentId" = v_parent AND starts_with(name, '__reserve_replication_');
  IF v_folder IS NULL THEN
    INSERT INTO secret_folders (name, "envId", "parentId", "isReserved", description, "createdAt", "updatedAt")
    SELECT '__reserve_replication_' || gen_random_uuid(), pg_temp.env_id(p_env), v_parent, true, pg_temp.folder_marker(), at, at
    FROM seed_clock
    RETURNING id INTO v_folder;
  END IF;
  RETURN v_folder;
END $$;

-- Secrets as a direct write leaves them: version 1 plus its version row.
CREATE OR REPLACE FUNCTION pg_temp.seed_secrets(p_env text, p_path text, p_keys text[]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_folder uuid := pg_temp.seed_folder(p_env, p_path);
  v_key text;
  v_at timestamptz;
  v_secret uuid;
BEGIN
  FOREACH v_key IN ARRAY p_keys LOOP
    v_at := pg_temp.tick('5 seconds');
    INSERT INTO secrets_v2 ("folderId", key, version, type, "skipMultilineEncoding", "createdAt", "updatedAt")
    VALUES (v_folder, v_key, 1, 'shared', false, v_at, v_at)
    RETURNING id INTO v_secret;
    INSERT INTO secret_versions_v2
      ("secretId", "folderId", key, version, type, "skipMultilineEncoding", "actorType", "userActorId", "createdAt", "updatedAt")
    VALUES (v_secret, v_folder, v_key, 1, 'shared', false, 'user', pg_temp.admin(), v_at, v_at);
  END LOOP;
END $$;

-- The API defaults bypassForMachineIdentities to false, unlike the column.
CREATE OR REPLACE FUNCTION pg_temp.seed_policy(
  p_name text,
  p_envs text[],
  p_path text,
  p_approvals int DEFAULT 1,
  p_enforcement text DEFAULT 'hard',
  p_allow_self boolean DEFAULT true,
  p_bypass_machines boolean DEFAULT false
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  v_at timestamptz := pg_temp.tick('1 minute');
BEGIN
  INSERT INTO secret_approval_policies
    (name, approvals, "secretPath", "envId", "enforcementLevel", "allowedSelfApprovals", "bypassForMachineIdentities", "createdAt", "updatedAt")
  VALUES
    (p_name, p_approvals, p_path, pg_temp.env_id(p_envs[1]), p_enforcement, p_allow_self, p_bypass_machines, v_at, v_at)
  RETURNING id INTO v_id;

  INSERT INTO secret_approval_policies_environments ("policyId", "envId", "createdAt", "updatedAt")
  SELECT v_id, pg_temp.env_id(e), v_at, v_at FROM unnest(p_envs) AS e;

  IF position('*' IN p_path) = 0 THEN
    PERFORM pg_temp.seed_folder(e, p_path) FROM unnest(p_envs) AS e;
  END IF;

  INSERT INTO seed_policies (name, id, path, created_at) VALUES (p_name, v_id, p_path, v_at);
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.seed_approver(p_policy text, p_user uuid, p_group uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO secret_approval_policies_approvers ("policyId", "approverUserId", "approverGroupId", "createdAt", "updatedAt")
  SELECT id, p_user, p_group, created_at, created_at FROM seed_policies WHERE name = p_policy
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_bypasser(p_policy text, p_user uuid, p_group uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO secret_approval_policies_bypassers ("policyId", "bypasserUserId", "bypasserGroupId", "createdAt", "updatedAt")
  SELECT id, p_user, p_group, created_at, created_at FROM seed_policies WHERE name = p_policy
$$;

-- p_commits is a list of {"op", "key"} objects, plus "newKey" and "reminderNote" on an update and "tags"
-- (slugs) on a create or update. An update or delete looks its secret up by key in the request's folder
-- and copies what the legacy service copies from the secret and its latest version.
CREATE OR REPLACE FUNCTION pg_temp.seed_request(
  p_key text,
  p_policy text,
  p_committer uuid,
  p_env text,
  p_commits jsonb,
  p_path text DEFAULT NULL,
  p_message text DEFAULT NULL,
  p_identity uuid DEFAULT NULL,
  p_replicated boolean DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_policy_id uuid;
  v_path text;
  v_folder uuid;
  v_at timestamptz := pg_temp.tick('1 minute');
  v_id uuid;
  v_commit jsonb;
  v_commit_id uuid;
  v_secret secrets_v2;
  v_version secret_versions_v2;
  v_tag text;
BEGIN
  SELECT id, coalesce(p_path, path) INTO v_policy_id, v_path FROM seed_policies WHERE name = p_policy;
  IF v_policy_id IS NULL THEN
    RAISE EXCEPTION 'Policy "%" was not seeded', p_policy;
  END IF;
  v_folder := CASE WHEN p_replicated THEN pg_temp.seed_replication_folder(p_env, v_path) ELSE pg_temp.seed_folder(p_env, v_path) END;

  INSERT INTO secret_approval_requests
    ("policyId", "folderId", slug, status, "hasMerged", "committerUserId", "committerIdentityId", "isReplicated", "commitMessage", "createdAt", "updatedAt")
  VALUES
    (v_policy_id, v_folder, substr(md5(random()::text), 1, 10), 'open', false, p_committer, p_identity, p_replicated, p_message, v_at, v_at)
  RETURNING id INTO v_id;

  FOR v_commit IN SELECT value FROM jsonb_array_elements(p_commits) LOOP
    IF v_commit ->> 'op' = 'create' THEN
      INSERT INTO secret_approval_requests_secrets_v2
        ("requestId", op, key, version, "skipMultilineEncoding", "secretMetadata", "createdAt", "updatedAt")
      VALUES (v_id, 'create', v_commit ->> 'key', 1, false, '[]', v_at, v_at)
      RETURNING id INTO v_commit_id;
    ELSIF v_commit ->> 'op' IN ('update', 'delete') THEN
      SELECT * INTO v_secret FROM secrets_v2 WHERE "folderId" = v_folder AND key = v_commit ->> 'key' AND type = 'shared';
      IF v_secret.id IS NULL THEN
        RAISE EXCEPTION 'Secret "%" not found for request %', v_commit ->> 'key', p_key;
      END IF;
      SELECT * INTO v_version FROM secret_versions_v2 WHERE "secretId" = v_secret.id ORDER BY version DESC LIMIT 1;

      IF v_commit ->> 'op' = 'update' THEN
        -- A NULL value and comment is what the legacy service writes when neither changes.
        INSERT INTO secret_approval_requests_secrets_v2
          ("requestId", op, key, version, "secretId", "secretVersion", "reminderNote", "secretMetadata", "createdAt", "updatedAt")
        VALUES (v_id, 'update', coalesce(v_commit ->> 'newKey', v_secret.key), v_secret.version, v_secret.id, v_version.id,
                v_commit ->> 'reminderNote', '[]', v_at, v_at)
        RETURNING id INTO v_commit_id;
      ELSE
        INSERT INTO secret_approval_requests_secrets_v2
          ("requestId", op, key, version, "secretId", "secretVersion", "encryptedValue", "encryptedComment", "reminderNote",
           "reminderRepeatDays", "skipMultilineEncoding", "secretMetadata", "createdAt", "updatedAt")
        VALUES (v_id, 'delete', v_secret.key, v_version.version, v_secret.id, v_version.id, v_version."encryptedValue",
                v_version."encryptedComment", v_version."reminderNote", v_version."reminderRepeatDays",
                v_version."skipMultilineEncoding", '[]', v_at, v_at)
        RETURNING id INTO v_commit_id;
      END IF;
    ELSE
      RAISE EXCEPTION 'Unknown commit op "%" in request %', v_commit ->> 'op', p_key;
    END IF;

    FOR v_tag IN SELECT value FROM jsonb_array_elements_text(coalesce(v_commit -> 'tags', '[]')) LOOP
      INSERT INTO secret_approval_request_secret_tags_v2 ("secretId", "tagId", "createdAt", "updatedAt")
      VALUES (v_commit_id, pg_temp.seed_tag(v_tag), v_at, v_at);
    END LOOP;
  END LOOP;

  INSERT INTO seed_requests (key, id, folder_id, updated_at) VALUES (p_key, v_id, v_folder, v_at);
  RETURN v_id;
END $$;

-- The legacy service keeps one review row per reviewer and updates it in place when they review again, so
-- a second review revises the first. Reviewing never touches the request row.
CREATE OR REPLACE FUNCTION pg_temp.seed_review(p_key text, p_reviewer uuid, p_status text, p_comment text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_request uuid;
  v_review uuid;
  v_at timestamptz := pg_temp.tick('15 seconds');
BEGIN
  SELECT id INTO v_request FROM seed_requests WHERE key = p_key;
  IF v_request IS NULL THEN
    RAISE EXCEPTION 'Request "%" was not seeded', p_key;
  END IF;

  SELECT id INTO v_review FROM secret_approval_requests_reviewers WHERE "requestId" = v_request AND "reviewerUserId" = p_reviewer;
  IF v_review IS NULL THEN
    INSERT INTO secret_approval_requests_reviewers ("requestId", "reviewerUserId", status, comment, "createdAt", "updatedAt")
    VALUES (v_request, p_reviewer, p_status, p_comment, v_at, v_at);
  ELSE
    UPDATE secret_approval_requests_reviewers SET status = p_status, comment = p_comment WHERE id = v_review;
    INSERT INTO seed_review_revisions (id, updated_at) VALUES (v_review, v_at)
    ON CONFLICT (id) DO UPDATE SET updated_at = excluded.updated_at;
  END IF;
END $$;

-- Mirrors the legacy merge: conflicts are found against the folder as it is now (a create whose key is
-- taken, an update whose secret is gone or whose key another secret holds), everything else is applied,
-- and the request closes as merged. Whether the request may merge is the caller's call. Pass
-- p_bypass_reason only for a soft-enforcement merge without the required approvals; the legacy service
-- drops the reason on any other merge.
CREATE OR REPLACE FUNCTION pg_temp.seed_merge(p_key text, p_merger uuid, p_bypass_reason text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_request_id uuid;
  v_folder uuid;
  v_at timestamptz := pg_temp.tick('15 seconds');
  v_commit record;
  v_conflicts jsonb := '[]';
  v_conflicting uuid[] := '{}';
  v_holder uuid;
  v_live_id uuid;
  v_live_key text;
  v_secret uuid;
BEGIN
  SELECT id, folder_id INTO v_request_id, v_folder FROM seed_requests WHERE key = p_key;
  IF v_request_id IS NULL THEN
    RAISE EXCEPTION 'Request "%" was not seeded', p_key;
  END IF;

  FOR v_commit IN
    SELECT c.id, c.op, c.key, c."secretId", v.key AS reviewed_key
    FROM secret_approval_requests_secrets_v2 c
    LEFT JOIN secret_versions_v2 v ON v.id = c."secretVersion"
    WHERE c."requestId" = v_request_id AND c.op IN ('create', 'update')
  LOOP
    SELECT id INTO v_holder FROM secrets_v2 WHERE "folderId" = v_folder AND key = v_commit.key AND type = 'shared';
    SELECT id, key INTO v_live_id, v_live_key FROM secrets_v2 WHERE id = v_commit."secretId";
    IF (v_commit.op = 'create' AND v_holder IS NOT NULL)
       OR (v_commit.op = 'update' AND (
             v_live_id IS NULL
             OR (v_holder IS NOT NULL AND v_holder <> v_live_id)
             OR (v_holder IS NULL AND v_commit.key = coalesce(v_commit.reviewed_key, v_live_key)))) THEN
      v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object('op', v_commit.op, 'secretId', v_commit.id));
      v_conflicting := v_conflicting || v_commit.id;
    END IF;
  END LOOP;

  FOR v_commit IN
    SELECT * FROM secret_approval_requests_secrets_v2
    WHERE "requestId" = v_request_id AND NOT (id = ANY (v_conflicting))
    ORDER BY CASE op WHEN 'create' THEN 1 WHEN 'update' THEN 2 ELSE 3 END, id
  LOOP
    IF v_commit.op = 'create' THEN
      INSERT INTO secrets_v2 ("folderId", key, version, type, "encryptedValue", "skipMultilineEncoding", "createdAt", "updatedAt")
      VALUES (v_folder, v_commit.key, 1, 'shared', v_commit."encryptedValue", coalesce(v_commit."skipMultilineEncoding", false), v_at, v_at)
      RETURNING id INTO v_secret;
      INSERT INTO secret_versions_v2
        ("secretId", "folderId", key, version, type, "encryptedValue", "skipMultilineEncoding", "actorType", "userActorId", "createdAt", "updatedAt")
      VALUES (v_secret, v_folder, v_commit.key, 1, 'shared', v_commit."encryptedValue", coalesce(v_commit."skipMultilineEncoding", false),
              'user', p_merger, v_at, v_at);
    ELSIF v_commit.op = 'update' THEN
      UPDATE secrets_v2
      SET key = v_commit.key, version = version + 1, "reminderNote" = coalesce(v_commit."reminderNote", "reminderNote")
      WHERE id = v_commit."secretId";
      INSERT INTO secret_versions_v2
        ("secretId", "folderId", key, version, type, "encryptedValue", "encryptedComment", "reminderNote", "skipMultilineEncoding",
         "actorType", "userActorId", "createdAt", "updatedAt")
      SELECT id, "folderId", key, version, type, "encryptedValue", "encryptedComment", "reminderNote", "skipMultilineEncoding",
             'user', p_merger, v_at, v_at
      FROM secrets_v2 WHERE id = v_commit."secretId";
    ELSE
      -- The commits' secretId FK is ON DELETE SET NULL, so this also clears it on every request still
      -- pointing at the secret.
      DELETE FROM secrets_v2 WHERE id = v_commit."secretId";
    END IF;
  END LOOP;

  UPDATE secret_approval_requests
  SET status = 'close', "hasMerged" = true, conflicts = v_conflicts, "statusChangedByUserId" = p_merger,
      "bypassReason" = p_bypass_reason
  WHERE id = v_request_id;
  UPDATE seed_requests SET updated_at = v_at WHERE key = p_key;
END $$;

-- Closing or reopening without merging, as the status endpoint does.
CREATE OR REPLACE FUNCTION pg_temp.seed_set_status(p_key text, p_by uuid, p_status text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_at timestamptz := pg_temp.tick('15 seconds');
BEGIN
  UPDATE secret_approval_requests SET status = p_status, "statusChangedByUserId" = p_by
  WHERE id = (SELECT id FROM seed_requests WHERE key = p_key);
  UPDATE seed_requests SET updated_at = v_at WHERE key = p_key;
END $$;

-- Mirrors the legacy delete: close the policy's open requests, leaving statusChangedByUserId as it was,
-- and soft-delete the policy.
CREATE OR REPLACE FUNCTION pg_temp.seed_delete_policy(p_policy text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  v_at timestamptz := pg_temp.tick('1 minute');
BEGIN
  SELECT id INTO v_id FROM seed_policies WHERE name = p_policy;
  UPDATE seed_requests SET updated_at = v_at
  WHERE id IN (SELECT id FROM secret_approval_requests WHERE "policyId" = v_id AND status = 'open');
  UPDATE secret_approval_requests SET status = 'close' WHERE "policyId" = v_id AND status = 'open';
  UPDATE secret_approval_policies SET "deletedAt" = v_at WHERE id = v_id;
END $$;

-- ---------------------------------------------------------------------------------------------------
-- Remove the previous seed (legacy rows, global copies sharing their ids, seeded folders and secrets)
-- ---------------------------------------------------------------------------------------------------

CREATE TEMP TABLE seed_old_policies ON COMMIT DROP AS
SELECT p.id
FROM secret_approval_policies p
JOIN project_environments e ON e.id = p."envId"
WHERE e."projectId" = pg_temp.project() AND p.name ~ '^p[0-9]{2}-';

CREATE TEMP TABLE seed_old_global_requests ON COMMIT DROP AS
SELECT id FROM approval_requests WHERE "policyId" IN (SELECT id FROM seed_old_policies)
UNION
SELECT g.id FROM approval_requests g
JOIN secret_approval_requests r ON r.id = g.id
WHERE r."policyId" IN (SELECT id FROM seed_old_policies);

CREATE TEMP TABLE seed_old_folders ON COMMIT DROP AS
SELECT f.id
FROM secret_folders f
JOIN project_environments e ON e.id = f."envId"
WHERE e."projectId" = pg_temp.project() AND f.description = pg_temp.folder_marker();

-- Cascades to secret_change_requests and the commits the migration relinked onto them.
DELETE FROM approval_requests WHERE id IN (SELECT id FROM seed_old_global_requests);
DELETE FROM approval_policies WHERE id IN (SELECT id FROM seed_old_policies);
DELETE FROM secret_approval_policies WHERE id IN (SELECT id FROM seed_old_policies);
-- secret_versions_v2 has no foreign key to its folder or its secret, so nothing cascades to it.
DELETE FROM secret_versions_v2 WHERE "folderId" IN (SELECT id FROM seed_old_folders);
DELETE FROM secret_folders WHERE id IN (SELECT id FROM seed_old_folders);

-- ---------------------------------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------------------------------

DO $$
DECLARE
  a uuid := pg_temp.admin();
  b uuid := pg_temp.requester();
  -- The admin is the approver group's only member, which is what lets group approvers and group
  -- bypassers be exercised by a user who can log in.
  g uuid := pg_temp.seed_group('seed-change-approvers', pg_temp.admin());
  empty_group uuid := pg_temp.seed_group('seed-change-empty-approvers', NULL);
  -- The requester is this group's only member, so in p04 they count as an approver through it.
  requester_group uuid := pg_temp.seed_group('seed-change-requester-approvers', pg_temp.requester());
  bot uuid := pg_temp.seed_identity('seed-change-bot');
BEGIN
  -- p01: plain hard policy, every request state the legacy service leaves behind
  PERFORM pg_temp.seed_policy('p01-hard-single-approver', ARRAY['dev'], '/backend');
  PERFORM pg_temp.seed_approver('p01-hard-single-approver', a, NULL);
  PERFORM pg_temp.seed_secrets('dev', '/backend', ARRAY['DB_HOST', 'DB_PASSWORD', 'CACHE_URL', 'FEATURE_FLAGS', 'SMTP_HOST', 'LEGACY_TOKEN', 'LOG_LEVEL']);

  PERFORM pg_temp.seed_request('r01a-open-untouched', 'p01-hard-single-approver', b, 'dev',
    '[{"op":"create","key":"NEW_RELIC_KEY"},{"op":"update","key":"DB_HOST","reminderNote":"rotate quarterly"},{"op":"delete","key":"LEGACY_TOKEN"}]',
    p_message => 'rotate database credentials');
  PERFORM pg_temp.seed_request('r01b-open-approved', 'p01-hard-single-approver', b, 'dev', '[{"op":"create","key":"SENTRY_DSN"}]');
  PERFORM pg_temp.seed_review('r01b-open-approved', a, 'approved', 'lgtm');
  PERFORM pg_temp.seed_request('r01c-open-rejected', 'p01-hard-single-approver', b, 'dev', '[{"op":"update","key":"CACHE_URL","newKey":"REDIS_URL"}]');
  PERFORM pg_temp.seed_review('r01c-open-rejected', a, 'rejected', 'use the managed redis instead');
  PERFORM pg_temp.seed_request('r01d-merged', 'p01-hard-single-approver', b, 'dev',
    '[{"op":"create","key":"STRIPE_KEY"},{"op":"update","key":"FEATURE_FLAGS","reminderNote":"review after launch"}]',
    p_message => 'launch checkout');
  PERFORM pg_temp.seed_review('r01d-merged', a, 'approved');
  PERFORM pg_temp.seed_merge('r01d-merged', a);
  PERFORM pg_temp.seed_request('r01e-closed-by-committer', 'p01-hard-single-approver', b, 'dev', '[{"op":"create","key":"TEMP_DEBUG"}]');
  PERFORM pg_temp.seed_set_status('r01e-closed-by-committer', b, 'close');
  PERFORM pg_temp.seed_request('r01f-closed-then-reopened', 'p01-hard-single-approver', b, 'dev', '[{"op":"update","key":"SMTP_HOST","newKey":"SMTP_HOSTNAME"}]');
  PERFORM pg_temp.seed_set_status('r01f-closed-then-reopened', a, 'close');
  PERFORM pg_temp.seed_set_status('r01f-closed-then-reopened', b, 'open');
  PERFORM pg_temp.seed_request('r01g-rejected-then-approved', 'p01-hard-single-approver', b, 'dev', '[{"op":"create","key":"ANALYTICS_KEY"}]');
  PERFORM pg_temp.seed_review('r01g-rejected-then-approved', a, 'rejected', 'missing the ticket');
  PERFORM pg_temp.seed_review('r01g-rejected-then-approved', a, 'approved', 'ticket linked');
  -- the committer may review their own request, but is not an approver, so the approval does not count
  PERFORM pg_temp.seed_request('r01h-committer-reviewed-own', 'p01-hard-single-approver', b, 'dev', '[{"op":"update","key":"LOG_LEVEL"}]');
  PERFORM pg_temp.seed_review('r01h-committer-reviewed-own', b, 'approved');
  -- deleting LOG_LEVEL also clears secretId on r01h's still open update
  PERFORM pg_temp.seed_request('r01i-merged-delete', 'p01-hard-single-approver', b, 'dev', '[{"op":"delete","key":"LOG_LEVEL"}]');
  PERFORM pg_temp.seed_review('r01i-merged-delete', a, 'approved');
  PERFORM pg_temp.seed_merge('r01i-merged-delete', a);
  -- r01k creates KAFKA_BROKERS and deletes DB_PASSWORD before r01j merges, so r01j records a create and an
  -- update conflict and applies only KAFKA_TOPIC
  PERFORM pg_temp.seed_request('r01j-merged-with-conflicts', 'p01-hard-single-approver', b, 'dev',
    '[{"op":"create","key":"KAFKA_BROKERS"},{"op":"update","key":"DB_PASSWORD"},{"op":"create","key":"KAFKA_TOPIC"}]');
  PERFORM pg_temp.seed_review('r01j-merged-with-conflicts', a, 'approved');
  PERFORM pg_temp.seed_request('r01k-merged-first', 'p01-hard-single-approver', b, 'dev',
    '[{"op":"create","key":"KAFKA_BROKERS"},{"op":"delete","key":"DB_PASSWORD"}]');
  PERFORM pg_temp.seed_review('r01k-merged-first', a, 'approved');
  PERFORM pg_temp.seed_merge('r01k-merged-first', a);
  PERFORM pg_temp.seed_merge('r01j-merged-with-conflicts', a);

  -- p02: two approvals from two user approvers, the requester being one of them. Machine identities
  -- bypass this policy, so it has no identity requests.
  PERFORM pg_temp.seed_policy('p02-two-approvals', ARRAY['staging'], '/payments', p_approvals => 2, p_bypass_machines => true);
  PERFORM pg_temp.seed_approver('p02-two-approvals', a, NULL);
  PERFORM pg_temp.seed_approver('p02-two-approvals', b, NULL);
  PERFORM pg_temp.seed_secrets('staging', '/payments', ARRAY['PAYMENT_API_KEY', 'PAYMENT_WEBHOOK_SECRET']);
  PERFORM pg_temp.seed_request('r02a-open-1-of-2', 'p02-two-approvals', b, 'staging', '[{"op":"update","key":"PAYMENT_API_KEY"}]');
  PERFORM pg_temp.seed_review('r02a-open-1-of-2', a, 'approved');
  PERFORM pg_temp.seed_request('r02b-open-2-of-2', 'p02-two-approvals', b, 'staging', '[{"op":"create","key":"PAYMENT_REGION"}]');
  PERFORM pg_temp.seed_review('r02b-open-2-of-2', a, 'approved');
  PERFORM pg_temp.seed_review('r02b-open-2-of-2', b, 'approved');
  PERFORM pg_temp.seed_request('r02c-merged-2-of-2', 'p02-two-approvals', b, 'staging',
    '[{"op":"update","key":"PAYMENT_WEBHOOK_SECRET","newKey":"PAYMENT_WEBHOOK_SIGNING_SECRET"}]');
  PERFORM pg_temp.seed_review('r02c-merged-2-of-2', b, 'approved');
  PERFORM pg_temp.seed_review('r02c-merged-2-of-2', a, 'approved');
  PERFORM pg_temp.seed_merge('r02c-merged-2-of-2', b);
  PERFORM pg_temp.seed_request('r02d-open-approved-and-rejected', 'p02-two-approvals', b, 'staging', '[{"op":"create","key":"PAYMENT_TIMEOUT"}]');
  PERFORM pg_temp.seed_review('r02d-open-approved-and-rejected', a, 'rejected', 'needs a load test first');
  PERFORM pg_temp.seed_review('r02d-open-approved-and-rejected', b, 'approved');
  PERFORM pg_temp.seed_request('r02e-open-untouched', 'p02-two-approvals', b, 'staging', '[{"op":"create","key":"PAYMENT_RETRIES"}]');

  -- p03: two approvals, the admin named directly and through the group. The legacy findById lists him once
  -- (both approver lists share the "approvers" label and are keyed by user id), so his approval is 1 of 2
  -- and, with nobody else eligible, nothing here can be merged.
  PERFORM pg_temp.seed_policy('p03-approver-direct-and-via-group', ARRAY['prod'], '/database', p_approvals => 2);
  PERFORM pg_temp.seed_approver('p03-approver-direct-and-via-group', a, NULL);
  PERFORM pg_temp.seed_approver('p03-approver-direct-and-via-group', NULL, g);
  PERFORM pg_temp.seed_secrets('prod', '/database', ARRAY['PG_PRIMARY_URL']);
  PERFORM pg_temp.seed_request('r03a-open-approved-once', 'p03-approver-direct-and-via-group', b, 'prod', '[{"op":"update","key":"PG_PRIMARY_URL"}]');
  PERFORM pg_temp.seed_review('r03a-open-approved-once', a, 'approved');
  PERFORM pg_temp.seed_request('r03b-closed-after-approval', 'p03-approver-direct-and-via-group', b, 'prod', '[{"op":"create","key":"PG_REPLICA_URL"}]');
  PERFORM pg_temp.seed_review('r03b-closed-after-approval', a, 'approved');
  PERFORM pg_temp.seed_set_status('r03b-closed-after-approval', b, 'close');

  -- p04: two approvals from the admin and the requester's group
  PERFORM pg_temp.seed_policy('p04-two-approvals-user-and-group', ARRAY['prod'], '/platform', p_approvals => 2);
  PERFORM pg_temp.seed_approver('p04-two-approvals-user-and-group', a, NULL);
  PERFORM pg_temp.seed_approver('p04-two-approvals-user-and-group', NULL, requester_group);
  PERFORM pg_temp.seed_secrets('prod', '/platform', ARRAY['K8S_TOKEN']);
  PERFORM pg_temp.seed_request('r04a-open-1-of-2', 'p04-two-approvals-user-and-group', b, 'prod', '[{"op":"update","key":"K8S_TOKEN"}]');
  PERFORM pg_temp.seed_review('r04a-open-1-of-2', a, 'approved');
  PERFORM pg_temp.seed_request('r04b-open-2-of-2', 'p04-two-approvals-user-and-group', b, 'prod', '[{"op":"create","key":"HELM_REPO_TOKEN"}]');
  PERFORM pg_temp.seed_review('r04b-open-2-of-2', a, 'approved');
  PERFORM pg_temp.seed_review('r04b-open-2-of-2', b, 'approved');
  PERFORM pg_temp.seed_request('r04c-merged-2-of-2', 'p04-two-approvals-user-and-group', b, 'prod', '[{"op":"create","key":"ARGOCD_TOKEN"}]');
  PERFORM pg_temp.seed_review('r04c-merged-2-of-2', b, 'approved');
  PERFORM pg_temp.seed_review('r04c-merged-2-of-2', a, 'approved');
  PERFORM pg_temp.seed_merge('r04c-merged-2-of-2', a);

  -- p05: the only approver is a group
  PERFORM pg_temp.seed_policy('p05-group-only-approver', ARRAY['dev'], '/grouped');
  PERFORM pg_temp.seed_approver('p05-group-only-approver', NULL, g);
  PERFORM pg_temp.seed_request('r05a-open-approved-via-group', 'p05-group-only-approver', b, 'dev', '[{"op":"create","key":"GROUPED_KEY"}]');
  PERFORM pg_temp.seed_review('r05a-open-approved-via-group', a, 'approved');
  PERFORM pg_temp.seed_request('r05b-merged', 'p05-group-only-approver', b, 'dev', '[{"op":"create","key":"GROUPED_OTHER"}]');
  PERFORM pg_temp.seed_review('r05b-merged', a, 'approved');
  PERFORM pg_temp.seed_merge('r05b-merged', a);
  PERFORM pg_temp.seed_request('r05c-open-untouched', 'p05-group-only-approver', b, 'dev', '[{"op":"create","key":"GROUPED_PENDING"}]');

  -- p06: self-approval disallowed (the requester's own review is refused, so only the admin's lands)
  PERFORM pg_temp.seed_policy('p06-self-approval-blocked', ARRAY['dev'], '/no-self', p_allow_self => false);
  PERFORM pg_temp.seed_approver('p06-self-approval-blocked', a, NULL);
  PERFORM pg_temp.seed_approver('p06-self-approval-blocked', b, NULL);
  PERFORM pg_temp.seed_request('r06a-open-approved-by-other', 'p06-self-approval-blocked', b, 'dev', '[{"op":"create","key":"NO_SELF_A"}]');
  PERFORM pg_temp.seed_review('r06a-open-approved-by-other', a, 'approved');
  PERFORM pg_temp.seed_request('r06b-open-untouched', 'p06-self-approval-blocked', b, 'dev', '[{"op":"create","key":"NO_SELF_B"}]');
  PERFORM pg_temp.seed_request('r06c-merged', 'p06-self-approval-blocked', b, 'dev', '[{"op":"create","key":"NO_SELF_C"}]');
  PERFORM pg_temp.seed_review('r06c-merged', a, 'approved');
  PERFORM pg_temp.seed_merge('r06c-merged', a);

  -- p07: soft with no bypassers listed, so anyone who may merge can bypass
  PERFORM pg_temp.seed_policy('p07-soft-no-bypassers', ARRAY['prod'], '/hotfix', p_enforcement => 'soft');
  PERFORM pg_temp.seed_approver('p07-soft-no-bypassers', a, NULL);
  PERFORM pg_temp.seed_secrets('prod', '/hotfix', ARRAY['HOTFIX_FLAG']);
  PERFORM pg_temp.seed_request('r07a-bypass-with-reason', 'p07-soft-no-bypassers', b, 'prod', '[{"op":"update","key":"HOTFIX_FLAG"}]');
  PERFORM pg_temp.seed_merge('r07a-bypass-with-reason', b, 'Production incident INC-4821, paging on-call');
  -- a bypass without a reason is stored like a normal merge, minus the approvals
  PERFORM pg_temp.seed_request('r07b-bypass-without-reason', 'p07-soft-no-bypassers', b, 'prod', '[{"op":"create","key":"HOTFIX_NOTE"}]');
  PERFORM pg_temp.seed_merge('r07b-bypass-without-reason', b);
  PERFORM pg_temp.seed_request('r07c-normal-merge', 'p07-soft-no-bypassers', b, 'prod', '[{"op":"create","key":"HOTFIX_OWNER"}]');
  PERFORM pg_temp.seed_review('r07c-normal-merge', a, 'approved');
  PERFORM pg_temp.seed_merge('r07c-normal-merge', a);
  -- a rejection does not stop a bypass
  PERFORM pg_temp.seed_request('r07d-bypass-after-rejection', 'p07-soft-no-bypassers', b, 'prod', '[{"op":"create","key":"HOTFIX_RISKY"}]');
  PERFORM pg_temp.seed_review('r07d-bypass-after-rejection', a, 'rejected', 'too risky for a friday');
  PERFORM pg_temp.seed_merge('r07d-bypass-after-rejection', b, 'Customer escalation, agreed on the call');
  PERFORM pg_temp.seed_request('r07e-open-untouched', 'p07-soft-no-bypassers', b, 'prod', '[{"op":"create","key":"HOTFIX_PENDING"}]');

  -- p08: soft with a user and a group bypasser. The requester is listed twice, which the API stores when
  -- the same bypasser is sent once by id and once by username.
  PERFORM pg_temp.seed_policy('p08-soft-user-and-group-bypassers', ARRAY['prod'], '/billing', p_enforcement => 'soft');
  PERFORM pg_temp.seed_approver('p08-soft-user-and-group-bypassers', a, NULL);
  PERFORM pg_temp.seed_bypasser('p08-soft-user-and-group-bypassers', b, NULL);
  PERFORM pg_temp.seed_bypasser('p08-soft-user-and-group-bypassers', b, NULL);
  PERFORM pg_temp.seed_bypasser('p08-soft-user-and-group-bypassers', NULL, g);
  PERFORM pg_temp.seed_request('r08a-user-bypasser-merged', 'p08-soft-user-and-group-bypassers', b, 'prod', '[{"op":"create","key":"BILLING_KEY"}]');
  PERFORM pg_temp.seed_merge('r08a-user-bypasser-merged', b, 'Invoice run blocked on the old key');
  -- the admin bypasses as a member of the bypasser group
  PERFORM pg_temp.seed_request('r08b-group-bypasser-merged', 'p08-soft-user-and-group-bypassers', b, 'prod', '[{"op":"create","key":"BILLING_REGION"}]');
  PERFORM pg_temp.seed_merge('r08b-group-bypasser-merged', a, 'Month-end close');
  PERFORM pg_temp.seed_request('r08c-open-untouched', 'p08-soft-user-and-group-bypassers', b, 'prod', '[{"op":"create","key":"BILLING_PENDING"}]');

  -- p09: soft, but only the admin may bypass, so the requester's merge is refused
  PERFORM pg_temp.seed_policy('p09-soft-bypasser-is-someone-else', ARRAY['staging'], '/ops', p_enforcement => 'soft');
  PERFORM pg_temp.seed_approver('p09-soft-bypasser-is-someone-else', a, NULL);
  PERFORM pg_temp.seed_bypasser('p09-soft-bypasser-is-someone-else', a, NULL);
  PERFORM pg_temp.seed_request('r09a-bypass-refused', 'p09-soft-bypasser-is-someone-else', b, 'staging', '[{"op":"create","key":"OPS_KEY"}]');

  -- p10: one policy over two environments. The admin is listed twice as an approver (sent once by id and
  -- once by username), which the legacy findById collapses into one.
  PERFORM pg_temp.seed_policy('p10-multi-environment', ARRAY['dev', 'staging'], '/shared');
  PERFORM pg_temp.seed_approver('p10-multi-environment', a, NULL);
  PERFORM pg_temp.seed_approver('p10-multi-environment', a, NULL);
  PERFORM pg_temp.seed_request('r10a-dev-approved', 'p10-multi-environment', b, 'dev', '[{"op":"create","key":"SHARED_DEV_KEY"}]');
  PERFORM pg_temp.seed_review('r10a-dev-approved', a, 'approved');
  PERFORM pg_temp.seed_request('r10b-staging-merged', 'p10-multi-environment', b, 'staging', '[{"op":"create","key":"SHARED_STAGING_KEY"}]');
  PERFORM pg_temp.seed_review('r10b-staging-merged', a, 'approved');
  PERFORM pg_temp.seed_merge('r10b-staging-merged', a);
  PERFORM pg_temp.seed_request('r10c-staging-open', 'p10-multi-environment', b, 'staging', '[{"op":"create","key":"SHARED_STAGING_PENDING"}]');

  -- p11: a glob path, with requests in two folders under it
  PERFORM pg_temp.seed_policy('p11-glob-path', ARRAY['dev'], '/apps/**');
  PERFORM pg_temp.seed_approver('p11-glob-path', a, NULL);
  PERFORM pg_temp.seed_secrets('dev', '/apps/api', ARRAY['API_PORT']);
  PERFORM pg_temp.seed_request('r11a-api-open', 'p11-glob-path', b, 'dev', '[{"op":"update","key":"API_PORT"}]', p_path => '/apps/api');
  PERFORM pg_temp.seed_request('r11b-web-merged', 'p11-glob-path', b, 'dev', '[{"op":"create","key":"WEB_ORIGIN"}]', p_path => '/apps/web');
  PERFORM pg_temp.seed_review('r11b-web-merged', a, 'approved');
  PERFORM pg_temp.seed_merge('r11b-web-merged', a);

  -- p12: machine identities do not bypass this policy, so the bot's writes become requests
  PERFORM pg_temp.seed_policy('p12-machine-identity-committer', ARRAY['staging'], '/automation');
  PERFORM pg_temp.seed_approver('p12-machine-identity-committer', a, NULL);
  PERFORM pg_temp.seed_request('r12a-identity-open', 'p12-machine-identity-committer', NULL, 'staging', '[{"op":"create","key":"CI_DEPLOY_KEY"}]',
    p_message => 'automated rotation', p_identity => bot);
  PERFORM pg_temp.seed_request('r12b-identity-merged', 'p12-machine-identity-committer', NULL, 'staging', '[{"op":"create","key":"CI_CACHE_KEY"}]',
    p_identity => bot);
  PERFORM pg_temp.seed_review('r12b-identity-merged', a, 'approved');
  PERFORM pg_temp.seed_merge('r12b-identity-merged', a);
  PERFORM pg_temp.seed_request('r12c-user-open', 'p12-machine-identity-committer', b, 'staging', '[{"op":"create","key":"AUTOMATION_NOTE"}]');

  -- p13: committers deleted after filing. Deleting a user or an identity sets committerUserId or
  -- committerIdentityId to NULL, leaving a request with no committer at all.
  PERFORM pg_temp.seed_policy('p13-committer-deleted', ARRAY['dev'], '/orphans');
  PERFORM pg_temp.seed_approver('p13-committer-deleted', a, NULL);
  PERFORM pg_temp.seed_request('r13a-open-no-committer', 'p13-committer-deleted', NULL, 'dev', '[{"op":"create","key":"ORPHAN_A"}]');
  PERFORM pg_temp.seed_request('r13b-merged-no-committer', 'p13-committer-deleted', NULL, 'dev', '[{"op":"create","key":"ORPHAN_B"}]');
  PERFORM pg_temp.seed_review('r13b-merged-no-committer', a, 'approved');
  PERFORM pg_temp.seed_merge('r13b-merged-no-committer', a);

  -- p14: requests in several states, then the policy is deleted. The delete closes r14b and r14d without
  -- recording who, so r14d keeps the requester who last reopened it.
  PERFORM pg_temp.seed_policy('p14-deleted-policy', ARRAY['dev'], '/retired');
  PERFORM pg_temp.seed_approver('p14-deleted-policy', a, NULL);
  PERFORM pg_temp.seed_secrets('dev', '/retired', ARRAY['RETIRED_KEY']);
  PERFORM pg_temp.seed_request('r14a-merged', 'p14-deleted-policy', b, 'dev', '[{"op":"update","key":"RETIRED_KEY"}]');
  PERFORM pg_temp.seed_review('r14a-merged', a, 'approved');
  PERFORM pg_temp.seed_merge('r14a-merged', a);
  PERFORM pg_temp.seed_request('r14b-open-closed-by-delete', 'p14-deleted-policy', b, 'dev', '[{"op":"create","key":"RETIRED_PENDING"}]');
  PERFORM pg_temp.seed_request('r14c-closed-by-committer', 'p14-deleted-policy', b, 'dev', '[{"op":"create","key":"RETIRED_CLOSED"}]');
  PERFORM pg_temp.seed_set_status('r14c-closed-by-committer', b, 'close');
  PERFORM pg_temp.seed_request('r14d-reopened-then-closed-by-delete', 'p14-deleted-policy', b, 'dev', '[{"op":"create","key":"RETIRED_REOPENED"}]');
  PERFORM pg_temp.seed_set_status('r14d-reopened-then-closed-by-delete', a, 'close');
  PERFORM pg_temp.seed_set_status('r14d-reopened-then-closed-by-delete', b, 'open');
  PERFORM pg_temp.seed_delete_policy('p14-deleted-policy');

  -- p15: requests written by secret replication into the reserved folder under /replicated. They carry
  -- isReplicated and no commit message.
  PERFORM pg_temp.seed_policy('p15-replicated', ARRAY['staging'], '/replicated');
  PERFORM pg_temp.seed_approver('p15-replicated', a, NULL);
  PERFORM pg_temp.seed_request('r15a-replicated-open', 'p15-replicated', b, 'staging',
    '[{"op":"create","key":"REPLICATED_A"},{"op":"create","key":"REPLICATED_B"}]', p_replicated => true);
  PERFORM pg_temp.seed_request('r15b-replicated-merged', 'p15-replicated', b, 'staging', '[{"op":"create","key":"REPLICATED_C"}]', p_replicated => true);
  PERFORM pg_temp.seed_review('r15b-replicated-merged', a, 'approved');
  PERFORM pg_temp.seed_merge('r15b-replicated-merged', a);

  -- p16: commits carrying tags
  PERFORM pg_temp.seed_policy('p16-tagged-commits', ARRAY['prod'], '/tagged');
  PERFORM pg_temp.seed_approver('p16-tagged-commits', a, NULL);
  PERFORM pg_temp.seed_secrets('prod', '/tagged', ARRAY['TAGGED_EXISTING']);
  PERFORM pg_temp.seed_request('r16a-open-with-tags', 'p16-tagged-commits', b, 'prod',
    '[{"op":"create","key":"TAGGED_NEW","tags":["seed-critical"]},{"op":"update","key":"TAGGED_EXISTING","tags":["seed-critical"]}]');
  PERFORM pg_temp.seed_request('r16b-merged-with-tags', 'p16-tagged-commits', b, 'prod', '[{"op":"create","key":"TAGGED_MERGED","tags":["seed-critical"]}]');
  PERFORM pg_temp.seed_review('r16b-merged-with-tags', a, 'approved');
  PERFORM pg_temp.seed_merge('r16b-merged-with-tags', a);

  -- p17: the only approver is a group that was emptied after the request was filed, so no one can approve
  PERFORM pg_temp.seed_policy('p17-empty-group-only-approver', ARRAY['staging'], '/empty-group');
  PERFORM pg_temp.seed_approver('p17-empty-group-only-approver', NULL, empty_group);
  PERFORM pg_temp.seed_request('r17a-unapprovable', 'p17-empty-group-only-approver', b, 'staging', '[{"op":"create","key":"EMPTY_GROUP_KEY"}]');

  -- p18: two approvals, one approver left. The second approver was a user who has since been deleted, and
  -- their approver row went with them (ON DELETE CASCADE).
  PERFORM pg_temp.seed_policy('p18-approvals-exceed-approvers', ARRAY['dev'], '/approver-removed', p_approvals => 2);
  PERFORM pg_temp.seed_approver('p18-approvals-exceed-approvers', a, NULL);
  PERFORM pg_temp.seed_request('r18a-stuck-1-of-2', 'p18-approvals-exceed-approvers', b, 'dev', '[{"op":"create","key":"APPROVER_REMOVED_KEY"}]');
  PERFORM pg_temp.seed_review('r18a-stuck-1-of-2', a, 'approved');

  -- p19: no approvers left. The only approver was a group that has since been deleted.
  PERFORM pg_temp.seed_policy('p19-no-approvers-left', ARRAY['dev'], '/no-approvers');
  PERFORM pg_temp.seed_request('r19a-unapprovable', 'p19-no-approvers-left', b, 'dev', '[{"op":"create","key":"NO_APPROVERS_KEY"}]');

  -- p20-p21: the requester is the only approver.

  -- p20: self-approval allowed. The admin reviews r20c without being an approver, which an admin may do.
  PERFORM pg_temp.seed_policy('p20-requester-only-approver', ARRAY['dev'], '/requester-approver');
  PERFORM pg_temp.seed_approver('p20-requester-only-approver', b, NULL);
  PERFORM pg_temp.seed_request('r20a-pending-untouched', 'p20-requester-only-approver', b, 'dev', '[{"op":"create","key":"REQ_APPROVER_A"}]');
  PERFORM pg_temp.seed_request('r20b-self-approved-merged', 'p20-requester-only-approver', b, 'dev', '[{"op":"create","key":"REQ_APPROVER_B"}]');
  PERFORM pg_temp.seed_review('r20b-self-approved-merged', b, 'approved');
  PERFORM pg_temp.seed_merge('r20b-self-approved-merged', b);
  PERFORM pg_temp.seed_request('r20c-admin-reviewed-not-approver', 'p20-requester-only-approver', b, 'dev', '[{"op":"create","key":"REQ_APPROVER_C"}]');
  PERFORM pg_temp.seed_review('r20c-admin-reviewed-not-approver', a, 'approved', 'looks fine to me');

  -- p21: self-approval disallowed, so nobody can ever approve
  PERFORM pg_temp.seed_policy('p21-requester-only-approver-self-blocked', ARRAY['dev'], '/requester-approver-blocked', p_allow_self => false);
  PERFORM pg_temp.seed_approver('p21-requester-only-approver-self-blocked', b, NULL);
  PERFORM pg_temp.seed_request('r21a-unapprovable', 'p21-requester-only-approver-self-blocked', b, 'dev', '[{"op":"create","key":"REQ_BLOCKED_A"}]');
END $$;

-- The updatedAt triggers stamp every UPDATE with the transaction's start time, so every merged, closed or
-- reopened request would share one updatedAt. Put back the times from the seed's timeline with triggers
-- off; only timestamp columns change, so no foreign key needs checking. Turning triggers off needs a
-- superuser (the docker dev DB's user is one); without one the stamped times stay.
DO $$
BEGIN
  SET LOCAL session_replication_role = replica;
  UPDATE secret_approval_requests r SET "updatedAt" = sr.updated_at FROM seed_requests sr WHERE r.id = sr.id;
  UPDATE secret_approval_requests_reviewers rv SET "updatedAt" = rr.updated_at FROM seed_review_revisions rr WHERE rv.id = rr.id;
  UPDATE secret_approval_policies p SET "updatedAt" = p."deletedAt"
  FROM seed_policies sp WHERE p.id = sp.id AND p."deletedAt" IS NOT NULL;
  SET LOCAL session_replication_role = origin;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Not a superuser, so merged, closed and reopened requests keep the time this script ran as their updatedAt';
END $$;

SELECT p.name AS policy,
       p."deletedAt" IS NOT NULL AS deleted,
       count(DISTINCT r.id) AS requests,
       count(DISTINCT r.id) FILTER (WHERE r.status = 'open') AS open,
       count(DISTINCT r.id) FILTER (WHERE r."hasMerged") AS merged,
       count(DISTINCT r.id) FILTER (WHERE r.status = 'close' AND NOT r."hasMerged") AS closed,
       count(DISTINCT c.id) AS commits,
       count(DISTINCT rv.id) AS reviews
FROM seed_policies sp
JOIN secret_approval_policies p ON p.id = sp.id
LEFT JOIN secret_approval_requests r ON r."policyId" = p.id
LEFT JOIN secret_approval_requests_secrets_v2 c ON c."requestId" = r.id
LEFT JOIN secret_approval_requests_reviewers rv ON rv."requestId" = r.id
GROUP BY p.name, p."deletedAt"
ORDER BY p.name;

COMMIT;
