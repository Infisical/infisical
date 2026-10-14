-- Seeds legacy access approval policies and requests (access_approval_* tables) covering bypassers,
-- self-approval, requesters who are approvers, break-glass, sequences, expiry and deletion. Every row
-- is written the way the legacy service writes it, including the outcomes of its bugs (see the notes
-- on p02, p08, p15, p17 and p22).
--
-- Usage: edit the three ids in seed_params, then run the whole file (psql -f, or pgAdmin's query tool).
--   docker exec -i infisical-db-1 psql -U infisical -d infisical -v ON_ERROR_STOP=1 < legacy-access-approvals-seed.sql
--
-- Re-running is safe: it first deletes every legacy access approval policy in the project whose name
-- matches ^p[0-9]{2}- together with its requests and privileges, plus any global copies the
-- migration made of them (same ids) and global requests filed against those copies.
--
-- The migration is already recorded as applied on a dev DB that ran it, so roll it back and re-run it
-- to migrate a fresh seed.

BEGIN;

CREATE TEMP TABLE seed_params ON COMMIT DROP AS
SELECT
  '3187d488-34a7-4ebb-9d5a-5481eba0d538'::text AS project_id,
  'ee1008ae-1082-4be2-90e6-b979e82f2476'::uuid AS admin_id,     -- project admin: approver and reviewer
  '1e10c1da-e8c1-4100-ab70-0eaae8b6b639'::uuid AS requester_id; -- project member: files the requests

CREATE TEMP TABLE seed_policies (name text PRIMARY KEY, id uuid NOT NULL, path text NOT NULL) ON COMMIT DROP;
CREATE TEMP TABLE seed_requests (key text PRIMARY KEY, id uuid NOT NULL, last_at timestamptz NOT NULL) ON COMMIT DROP;

-- ---------------------------------------------------------------------------------------------------
-- Helpers (session-scoped, gone when the connection closes)
-- ---------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION pg_temp.project() RETURNS text LANGUAGE sql STABLE AS
$$ SELECT project_id FROM seed_params $$;
CREATE OR REPLACE FUNCTION pg_temp.admin() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT admin_id FROM seed_params $$;
CREATE OR REPLACE FUNCTION pg_temp.requester() RETURNS uuid LANGUAGE sql STABLE AS
$$ SELECT requester_id FROM seed_params $$;

-- '30m', '12h', '7d' -> interval, matching the ms() strings the API accepts
CREATE OR REPLACE FUNCTION pg_temp.dur(p text) RETURNS interval LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN p IS NULL THEN NULL ELSE
    (substring(p FROM '^(\d+)') || ' ' ||
      CASE substring(p FROM '([smhdw])$')
        WHEN 's' THEN 'seconds' WHEN 'm' THEN 'minutes' WHEN 'h' THEN 'hours'
        WHEN 'd' THEN 'days' WHEN 'w' THEN 'weeks' END)::interval
  END
$$;

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

CREATE OR REPLACE FUNCTION pg_temp.seed_policy(
  p_name text,
  p_envs text[],
  p_path text,
  p_approvals int DEFAULT 1,
  p_enforcement text DEFAULT 'hard',
  p_allow_self boolean DEFAULT true,
  p_max_time text DEFAULT NULL,
  p_request_expiration text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_id uuid;
  v_at timestamptz := now() - interval '1 hour';
BEGIN
  INSERT INTO access_approval_policies
    (name, approvals, "secretPath", "envId", "enforcementLevel", "allowedSelfApprovals", "maxTimePeriod", "requestExpirationTime", "createdAt", "updatedAt")
  VALUES
    (p_name, p_approvals, p_path, pg_temp.env_id(p_envs[1]), p_enforcement, p_allow_self, p_max_time, p_request_expiration, v_at, v_at)
  RETURNING id INTO v_id;

  INSERT INTO access_approval_policies_environments ("policyId", "envId", "createdAt", "updatedAt")
  SELECT v_id, pg_temp.env_id(e), v_at, v_at FROM unnest(p_envs) AS e;

  INSERT INTO seed_policies (name, id, path) VALUES (p_name, v_id, p_path);
  RETURN v_id;
END $$;

-- The API stores approvalsRequired only when the request sends a step map, so it stays NULL otherwise.
CREATE OR REPLACE FUNCTION pg_temp.seed_approver(
  p_policy text, p_user uuid, p_group uuid, p_sequence int DEFAULT 1, p_required int DEFAULT NULL
) RETURNS void LANGUAGE sql AS $$
  INSERT INTO access_approval_policies_approvers ("policyId", "approverUserId", "approverGroupId", sequence, "approvalsRequired")
  SELECT id, p_user, p_group, p_sequence, p_required FROM seed_policies WHERE name = p_policy
$$;

CREATE OR REPLACE FUNCTION pg_temp.seed_bypasser(p_policy text, p_user uuid, p_group uuid) RETURNS void LANGUAGE sql AS $$
  INSERT INTO access_approval_policies_bypassers ("policyId", "bypasserUserId", "bypasserGroupId")
  SELECT id, p_user, p_group FROM seed_policies WHERE name = p_policy
$$;

-- p_rules is [[actions, subject], ...] with comma-joined actions, packed like the frontend's packRules.
-- Requests are spaced 10 seconds apart starting 20 minutes ago unless p_created_at is given.
CREATE OR REPLACE FUNCTION pg_temp.seed_request(
  p_key text,
  p_policy text,
  p_requester uuid,
  p_env text,
  p_rules jsonb,
  p_is_temporary boolean DEFAULT false,
  p_range text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_created_at timestamptz DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  v_policy record;
  v_permissions jsonb;
  v_at timestamptz;
  v_id uuid;
BEGIN
  SELECT sp.id, sp.path, p."requestExpirationTime" INTO v_policy
  FROM seed_policies sp JOIN access_approval_policies p ON p.id = sp.id
  WHERE sp.name = p_policy;

  v_at := coalesce(p_created_at, now() - interval '20 minutes' + (SELECT count(*) FROM seed_requests) * interval '10 seconds');

  SELECT jsonb_agg(
           jsonb_build_array(r ->> 0, r ->> 1, jsonb_build_object('environment', p_env, 'secretPath', jsonb_build_object('$glob', v_policy.path)))
           ORDER BY ord)
  INTO v_permissions
  FROM jsonb_array_elements(p_rules) WITH ORDINALITY AS t(r, ord);

  INSERT INTO access_approval_requests
    ("policyId", "requestedByUserId", permissions, "isTemporary", "temporaryRange", note, "expiresAt", status, "createdAt", "updatedAt")
  VALUES
    (v_policy.id, p_requester, v_permissions, p_is_temporary, p_range, p_note,
     v_at + pg_temp.dur(v_policy."requestExpirationTime"), 'pending', v_at, v_at)
  RETURNING id INTO v_id;

  INSERT INTO seed_requests (key, id, last_at) VALUES (p_key, v_id, v_at);
  RETURN v_id;
END $$;

-- Records one review 15 seconds after the request's last activity. A rejection closes the request.
-- An approval closes it only when p_closes says so, because whether the legacy threshold logic
-- would close it is exactly what the scenarios pin down. Closing creates the additional privilege.
CREATE OR REPLACE FUNCTION pg_temp.seed_review(
  p_key text, p_reviewer uuid, p_status text, p_closes boolean DEFAULT false, p_bypass_reason text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_req record;
  v_at timestamptz;
  v_privilege uuid;
BEGIN
  SELECT r.*, sr.last_at INTO v_req
  FROM seed_requests sr JOIN access_approval_requests r ON r.id = sr.id
  WHERE sr.key = p_key;
  v_at := v_req.last_at + interval '15 seconds';

  INSERT INTO access_approval_requests_reviewers ("requestId", "reviewerUserId", status, "createdAt", "updatedAt")
  VALUES (v_req.id, p_reviewer, p_status, v_at, v_at);

  IF p_status = 'rejected' THEN
    UPDATE access_approval_requests SET status = 'rejected', "updatedAt" = v_at WHERE id = v_req.id;
  ELSIF p_closes THEN
    INSERT INTO additional_privileges
      (name, "actorUserId", "projectId", permissions, "isTemporary", "temporaryMode", "temporaryRange",
       "temporaryAccessStartTime", "temporaryAccessEndTime", "createdAt", "updatedAt")
    SELECT
      'requested-privilege-' || substr(md5(random()::text), 1, 12),
      v_req."requestedByUserId",
      pg_temp.project(),
      v_req.permissions,
      tmp,
      CASE WHEN tmp THEN 'relative' END,
      CASE WHEN tmp THEN v_req."temporaryRange" END,
      CASE WHEN tmp THEN v_at END,
      CASE WHEN tmp THEN v_at + pg_temp.dur(v_req."temporaryRange") END,
      v_at,
      v_at
    FROM (SELECT v_req."isTemporary" OR v_req."temporaryRange" IS NOT NULL AS tmp) AS x
    RETURNING id INTO v_privilege;

    UPDATE access_approval_requests
    SET status = 'approved', "privilegeId" = v_privilege, "approvedAt" = v_at, "approvedByUserId" = p_reviewer,
        "bypassReason" = p_bypass_reason, "updatedAt" = v_at
    WHERE id = v_req.id;
  END IF;

  UPDATE seed_requests SET last_at = v_at WHERE key = p_key;
END $$;

-- Same order as the legacy revoke: detach the privilege, then delete it (the FK would cascade the request).
CREATE OR REPLACE FUNCTION pg_temp.seed_revoke(p_key text, p_revoker uuid) RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  v_req record;
  v_at timestamptz;
BEGIN
  SELECT r.*, sr.last_at INTO v_req FROM seed_requests sr JOIN access_approval_requests r ON r.id = sr.id WHERE sr.key = p_key;
  v_at := v_req.last_at + interval '15 seconds';

  UPDATE access_approval_requests
  SET status = 'revoked', "revokedAt" = v_at, "revokedByUserId" = p_revoker, "privilegeId" = NULL, "updatedAt" = v_at
  WHERE id = v_req.id;
  DELETE FROM additional_privileges WHERE id = v_req."privilegeId";

  UPDATE seed_requests SET last_at = v_at WHERE key = p_key;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.seed_edit(p_key text, p_editor uuid, p_range text, p_note text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_at timestamptz;
BEGIN
  SELECT last_at + interval '15 seconds' INTO v_at FROM seed_requests WHERE key = p_key;
  UPDATE access_approval_requests
  SET "temporaryRange" = p_range, "editedByUserId" = p_editor, "editNote" = p_note, "updatedAt" = v_at
  WHERE id = (SELECT id FROM seed_requests WHERE key = p_key);
  UPDATE seed_requests SET last_at = v_at WHERE key = p_key;
END $$;

-- Mirrors the legacy delete: soft-delete the policy and hard-delete its requests' privileges. The
-- privilegeId FK is ON DELETE CASCADE, so every approved request still holding a privilege goes too.
CREATE OR REPLACE FUNCTION pg_temp.seed_delete_policy(p_policy text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM seed_policies WHERE name = p_policy;
  UPDATE access_approval_policies SET "deletedAt" = now() - interval '1 minute' WHERE id = v_id;
  DELETE FROM additional_privileges
  WHERE id IN (SELECT "privilegeId" FROM access_approval_requests WHERE "policyId" = v_id AND "privilegeId" IS NOT NULL);
END $$;

-- ---------------------------------------------------------------------------------------------------
-- Remove the previous seed (legacy rows, privileges, and global copies sharing their ids)
-- ---------------------------------------------------------------------------------------------------

CREATE TEMP TABLE seed_old_policies ON COMMIT DROP AS
SELECT p.id
FROM access_approval_policies p
JOIN access_approval_policies_environments pe ON pe."policyId" = p.id
JOIN project_environments e ON e.id = pe."envId"
WHERE e."projectId" = pg_temp.project() AND p.name ~ '^p[0-9]{2}-'
GROUP BY p.id;

CREATE TEMP TABLE seed_old_global_requests ON COMMIT DROP AS
SELECT id FROM approval_requests WHERE "policyId" IN (SELECT id FROM seed_old_policies)
UNION
SELECT g.id FROM approval_requests g
JOIN access_approval_requests r ON r.id = g.id
WHERE r."policyId" IN (SELECT id FROM seed_old_policies);

DELETE FROM additional_privileges
WHERE "grantId" IN (SELECT id FROM approval_request_grants WHERE "requestId" IN (SELECT id FROM seed_old_global_requests))
   OR id IN (SELECT "privilegeId" FROM access_approval_requests WHERE "policyId" IN (SELECT id FROM seed_old_policies));
DELETE FROM approval_request_grants WHERE "requestId" IN (SELECT id FROM seed_old_global_requests);
DELETE FROM approval_requests WHERE id IN (SELECT id FROM seed_old_global_requests);
DELETE FROM approval_policies WHERE id IN (SELECT id FROM seed_old_policies);
DELETE FROM access_approval_policies WHERE id IN (SELECT id FROM seed_old_policies);

-- ---------------------------------------------------------------------------------------------------
-- Seed
-- ---------------------------------------------------------------------------------------------------

DO $$
DECLARE
  a uuid := pg_temp.admin();
  b uuid := pg_temp.requester();
  -- The admin is the approver group's only member, which is what lets group approvers and group
  -- bypassers be exercised by a user who can log in.
  g uuid := pg_temp.seed_group('seed-approvers', pg_temp.admin());
  empty_group uuid := pg_temp.seed_group('seed-empty-approvers', NULL);
  -- The requester is this group's only member, so p20's requester is an approver only through it.
  requester_group uuid := pg_temp.seed_group('seed-requester-approvers', pg_temp.requester());
BEGIN
  -- p01: plain hard policy, every terminal state
  PERFORM pg_temp.seed_policy('p01-hard-single-approver', ARRAY['dev'], '/');
  PERFORM pg_temp.seed_approver('p01-hard-single-approver', a, NULL);

  PERFORM pg_temp.seed_request('r01a-approved-permanent', 'p01-hard-single-approver', b, 'dev', '[["read","secrets"]]', p_note => 'need read on dev root');
  PERFORM pg_temp.seed_review('r01a-approved-permanent', a, 'approved', true);
  PERFORM pg_temp.seed_request('r01b-approved-temp-30d', 'p01-hard-single-approver', b, 'dev', '[["describeSecret,readValue","secrets"]]', true, '30d');
  PERFORM pg_temp.seed_review('r01b-approved-temp-30d', a, 'approved', true);
  PERFORM pg_temp.seed_request('r01c-approved-temp-1m-expired', 'p01-hard-single-approver', b, 'dev', '[["edit","secrets"]]', true, '1m');
  PERFORM pg_temp.seed_review('r01c-approved-temp-1m-expired', a, 'approved', true);
  PERFORM pg_temp.seed_request('r01d-rejected', 'p01-hard-single-approver', b, 'dev', '[["create","secrets"]]');
  PERFORM pg_temp.seed_review('r01d-rejected', a, 'rejected');
  PERFORM pg_temp.seed_request('r01e-revoked', 'p01-hard-single-approver', b, 'dev', '[["delete","secrets"]]');
  PERFORM pg_temp.seed_review('r01e-revoked', a, 'approved', true);
  PERFORM pg_temp.seed_revoke('r01e-revoked', a);
  PERFORM pg_temp.seed_request('r01f-pending', 'p01-hard-single-approver', b, 'dev', '[["read","secret-folders"]]', p_note => 'pending folder read');
  PERFORM pg_temp.seed_request('r01g-cancelled-by-requester', 'p01-hard-single-approver', b, 'dev', '[["read","secret-imports"]]');
  PERFORM pg_temp.seed_review('r01g-cancelled-by-requester', b, 'rejected');
  PERFORM pg_temp.seed_request('r01h-pending-edited', 'p01-hard-single-approver', b, 'dev', '[["read,edit","secrets"]]', true, '2h');
  PERFORM pg_temp.seed_edit('r01h-pending-edited', a, '1h', 'shortened to one hour');
  PERFORM pg_temp.seed_request('r01i-multi-subject-approved', 'p01-hard-single-approver', b, 'dev', '[["describeSecret","secrets"],["create,edit","secret-folders"]]');
  PERFORM pg_temp.seed_review('r01i-multi-subject-approved', a, 'approved', true);
  -- same criteria as r01c, allowed again because that grant has expired
  PERFORM pg_temp.seed_request('r01j-re-request-after-grant-expired', 'p01-hard-single-approver', b, 'dev', '[["edit","secrets"]]', true, '1m', p_created_at => now());

  -- p02: two steps with the group in step 2, bypassers on a hard policy (bypassers do nothing under
  -- hard enforcement). The admin is a direct step-1 approver and a step-2 group member; the legacy
  -- findById dedupes him into step 2 only, so his single review approves the whole request.
  PERFORM pg_temp.seed_policy('p02-two-step-group-and-bypassers', ARRAY['staging'], '/app');
  PERFORM pg_temp.seed_approver('p02-two-step-group-and-bypassers', a, NULL, 1, 1);
  PERFORM pg_temp.seed_approver('p02-two-step-group-and-bypassers', NULL, g, 2, 1);
  PERFORM pg_temp.seed_bypasser('p02-two-step-group-and-bypassers', b, NULL);
  PERFORM pg_temp.seed_bypasser('p02-two-step-group-and-bypassers', NULL, g);
  PERFORM pg_temp.seed_request('r02a-approved-after-step-1-only', 'p02-two-step-group-and-bypassers', b, 'staging', '[["read","secrets"]]');
  PERFORM pg_temp.seed_review('r02a-approved-after-step-1-only', a, 'approved', true);
  PERFORM pg_temp.seed_request('r02b-rejected-at-step1', 'p02-two-step-group-and-bypassers', b, 'staging', '[["edit","secrets"]]');
  PERFORM pg_temp.seed_review('r02b-rejected-at-step1', a, 'rejected');
  PERFORM pg_temp.seed_request('r02c-pending-untouched', 'p02-two-step-group-and-bypassers', b, 'staging', '[["create","secrets"]]', true, '4h');

  -- p03: self-approval allowed
  PERFORM pg_temp.seed_policy('p03-self-approval-allowed', ARRAY['dev'], '/self');
  PERFORM pg_temp.seed_approver('p03-self-approval-allowed', b, NULL);
  PERFORM pg_temp.seed_approver('p03-self-approval-allowed', a, NULL);
  PERFORM pg_temp.seed_request('r03a-self-approved', 'p03-self-approval-allowed', b, 'dev', '[["read","secrets"]]');
  PERFORM pg_temp.seed_review('r03a-self-approved', b, 'approved', true);
  PERFORM pg_temp.seed_request('r03b-approved-by-other', 'p03-self-approval-allowed', b, 'dev', '[["edit","secrets"]]', true, '7d');
  PERFORM pg_temp.seed_review('r03b-approved-by-other', a, 'approved', true);
  -- the requester's own approval alone would close it
  PERFORM pg_temp.seed_request('r03c-pending-untouched', 'p03-self-approval-allowed', b, 'dev', '[["create","secrets"]]');

  -- p04: self-approval disallowed (the requester's own approval is refused, so only the admin's lands)
  PERFORM pg_temp.seed_policy('p04-self-approval-blocked', ARRAY['dev'], '/no-self', p_allow_self => false);
  PERFORM pg_temp.seed_approver('p04-self-approval-blocked', a, NULL);
  PERFORM pg_temp.seed_approver('p04-self-approval-blocked', b, NULL);
  PERFORM pg_temp.seed_request('r04a-approved-by-other', 'p04-self-approval-blocked', b, 'dev', '[["read","secrets"]]');
  PERFORM pg_temp.seed_review('r04a-approved-by-other', a, 'approved', true);
  PERFORM pg_temp.seed_request('r04b-pending', 'p04-self-approval-blocked', b, 'dev', '[["edit","secrets"]]');

  -- p05: soft with no bypassers listed, so any requester can break glass
  PERFORM pg_temp.seed_policy('p05-soft-breakglass-no-bypassers', ARRAY['prod'], '/', p_enforcement => 'soft');
  PERFORM pg_temp.seed_approver('p05-soft-breakglass-no-bypassers', a, NULL);
  PERFORM pg_temp.seed_request('r05a-break-glass', 'p05-soft-breakglass-no-bypassers', b, 'prod', '[["read","secrets"]]', true, '1h');
  PERFORM pg_temp.seed_review('r05a-break-glass', b, 'approved', true, 'Production incident INC-4821, paging on-call');
  PERFORM pg_temp.seed_request('r05b-normal-approval-on-soft', 'p05-soft-breakglass-no-bypassers', b, 'prod', '[["edit","secrets"]]');
  PERFORM pg_temp.seed_review('r05b-normal-approval-on-soft', a, 'approved', true);
  -- break-glass without a reason is indistinguishable from a normal approval in the stored row
  PERFORM pg_temp.seed_request('r05c-break-glass-no-reason', 'p05-soft-breakglass-no-bypassers', b, 'prod', '[["create","secrets"]]');
  PERFORM pg_temp.seed_review('r05c-break-glass-no-reason', b, 'approved', true);

  -- p06: soft, requester is a user bypasser, self-approval disabled (being a bypasser overrides it)
  PERFORM pg_temp.seed_policy('p06-soft-requester-is-bypasser-self-blocked', ARRAY['prod'], '/payments', p_enforcement => 'soft', p_allow_self => false);
  PERFORM pg_temp.seed_approver('p06-soft-requester-is-bypasser-self-blocked', a, NULL);
  PERFORM pg_temp.seed_bypasser('p06-soft-requester-is-bypasser-self-blocked', b, NULL);
  PERFORM pg_temp.seed_request('r06a-bypasser-break-glass', 'p06-soft-requester-is-bypasser-self-blocked', b, 'prod', '[["read","secrets"]]');
  PERFORM pg_temp.seed_review('r06a-bypasser-break-glass', b, 'approved', true, 'Payment outage, need to rotate keys now');
  PERFORM pg_temp.seed_request('r06b-pending', 'p06-soft-requester-is-bypasser-self-blocked', b, 'prod', '[["edit","secrets"]]');

  -- p07: soft, only someone else is a bypasser, so the requester's break-glass is refused
  PERFORM pg_temp.seed_policy('p07-soft-bypasser-is-someone-else', ARRAY['prod'], '/billing', p_enforcement => 'soft');
  PERFORM pg_temp.seed_approver('p07-soft-bypasser-is-someone-else', a, NULL);
  PERFORM pg_temp.seed_bypasser('p07-soft-bypasser-is-someone-else', a, NULL);
  PERFORM pg_temp.seed_request('r07a-break-glass-refused', 'p07-soft-bypasser-is-someone-else', b, 'prod', '[["read","secrets"]]');

  -- p08: soft, group bypasser, self-approval disabled. The admin's break-glass on his own request is
  -- refused too, because the legacy findById resolves group bypassers from the wrong column.
  PERFORM pg_temp.seed_policy('p08-soft-group-bypasser-self-blocked', ARRAY['prod'], '/ops', p_enforcement => 'soft', p_allow_self => false);
  PERFORM pg_temp.seed_approver('p08-soft-group-bypasser-self-blocked', b, NULL);
  PERFORM pg_temp.seed_bypasser('p08-soft-group-bypasser-self-blocked', NULL, g);
  PERFORM pg_temp.seed_request('r08a-requester-not-in-bypass-group', 'p08-soft-group-bypasser-self-blocked', b, 'prod', '[["read","secrets"]]');
  PERFORM pg_temp.seed_request('r08b-admin-in-bypass-group', 'p08-soft-group-bypasser-self-blocked', a, 'prod', '[["read","secrets"]]');

  -- p09: one policy over two environments
  PERFORM pg_temp.seed_policy('p09-multi-environment', ARRAY['dev', 'staging'], '/shared');
  PERFORM pg_temp.seed_approver('p09-multi-environment', a, NULL);
  PERFORM pg_temp.seed_request('r09a-dev-approved', 'p09-multi-environment', b, 'dev', '[["read","secrets"]]');
  PERFORM pg_temp.seed_review('r09a-dev-approved', a, 'approved', true);
  PERFORM pg_temp.seed_request('r09b-staging-pending', 'p09-multi-environment', b, 'staging', '[["read","secrets"]]');

  -- p10: maxTimePeriod 1h (the API refuses permanent and 2h requests here)
  PERFORM pg_temp.seed_policy('p10-max-time-period-1h', ARRAY['staging'], '/temp-only', p_max_time => '1h');
  PERFORM pg_temp.seed_approver('p10-max-time-period-1h', a, NULL);
  PERFORM pg_temp.seed_request('r10a-temp-30m-approved', 'p10-max-time-period-1h', b, 'staging', '[["read","secrets"]]', true, '30m');
  PERFORM pg_temp.seed_review('r10a-temp-30m-approved', a, 'approved', true);
  PERFORM pg_temp.seed_request('r10b-temp-1h-pending', 'p10-max-time-period-1h', b, 'staging', '[["edit","secrets"]]', true, '1h');

  -- p11: requests expire 1 minute after they are filed
  PERFORM pg_temp.seed_policy('p11-request-expiration-1m', ARRAY['staging'], '/expiring', p_request_expiration => '1m');
  PERFORM pg_temp.seed_approver('p11-request-expiration-1m', a, NULL);
  PERFORM pg_temp.seed_request('r11a-approved-before-expiry', 'p11-request-expiration-1m', b, 'staging', '[["read","secrets"]]');
  PERFORM pg_temp.seed_review('r11a-approved-before-expiry', a, 'approved', true);
  PERFORM pg_temp.seed_request('r11b-pending-expired', 'p11-request-expiration-1m', b, 'staging', '[["edit","secrets"]]');
  PERFORM pg_temp.seed_request('r11c-rejected-before-expiry', 'p11-request-expiration-1m', b, 'staging', '[["create","secrets"]]');
  PERFORM pg_temp.seed_review('r11c-rejected-before-expiry', a, 'rejected');
  -- live for one minute after the seed runs, then expired too
  PERFORM pg_temp.seed_request('r11d-re-request-after-expiry', 'p11-request-expiration-1m', b, 'staging', '[["edit","secrets"]]', p_created_at => now());

  -- p12: two approvals in one step, the requester is one of the approvers
  PERFORM pg_temp.seed_policy('p12-two-approvals-one-step', ARRAY['prod'], '/db', p_approvals => 2);
  PERFORM pg_temp.seed_approver('p12-two-approvals-one-step', a, NULL, 1, 2);
  PERFORM pg_temp.seed_approver('p12-two-approvals-one-step', b, NULL, 1, 2);
  PERFORM pg_temp.seed_approver('p12-two-approvals-one-step', NULL, g, 1, 2);
  PERFORM pg_temp.seed_request('r12a-approved-2-of-2', 'p12-two-approvals-one-step', b, 'prod', '[["read","secrets"]]');
  PERFORM pg_temp.seed_review('r12a-approved-2-of-2', a, 'approved');
  PERFORM pg_temp.seed_review('r12a-approved-2-of-2', b, 'approved', true);
  PERFORM pg_temp.seed_request('r12b-pending-1-of-2', 'p12-two-approvals-one-step', b, 'prod', '[["edit","secrets"]]');
  PERFORM pg_temp.seed_review('r12b-pending-1-of-2', a, 'approved');
  PERFORM pg_temp.seed_request('r12c-self-approved-then-rejected', 'p12-two-approvals-one-step', b, 'prod', '[["create","secrets"]]');
  PERFORM pg_temp.seed_review('r12c-self-approved-then-rejected', b, 'approved');
  PERFORM pg_temp.seed_review('r12c-self-approved-then-rejected', a, 'rejected');
  -- the requester's own approval would count as 1 of 2
  PERFORM pg_temp.seed_request('r12d-pending-untouched', 'p12-two-approvals-one-step', b, 'prod', '[["delete","secrets"]]');

  -- p13: approvals = 2 but no approvalsRequired, so legacy treats the step as needing one
  PERFORM pg_temp.seed_policy('p13-approvals-2-without-approvalsRequired', ARRAY['dev'], '/legacy-count', p_approvals => 2);
  PERFORM pg_temp.seed_approver('p13-approvals-2-without-approvalsRequired', a, NULL);
  PERFORM pg_temp.seed_approver('p13-approvals-2-without-approvalsRequired', b, NULL);
  PERFORM pg_temp.seed_request('r13a-approved-by-one', 'p13-approvals-2-without-approvalsRequired', b, 'dev', '[["read","secrets"]]');
  PERFORM pg_temp.seed_review('r13a-approved-by-one', a, 'approved', true);
  PERFORM pg_temp.seed_request('r13b-pending', 'p13-approvals-2-without-approvalsRequired', b, 'dev', '[["edit","secrets"]]');

  -- p14: the step needs 2 approvals but has 1 approver, so the request can never close
  PERFORM pg_temp.seed_policy('p14-step-needs-more-than-its-approvers', ARRAY['dev'], '/overdemanding', p_approvals => 2);
  PERFORM pg_temp.seed_approver('p14-step-needs-more-than-its-approvers', a, NULL, 1, 2);
  PERFORM pg_temp.seed_request('r14a-stuck-1-of-2', 'p14-step-needs-more-than-its-approvers', b, 'dev', '[["read","secrets"]]');
  PERFORM pg_temp.seed_review('r14a-stuck-1-of-2', a, 'approved');

  -- p15: the only approver is an empty group. The API 500s when filing a request while the group is
  -- empty (sendMail with no recipients), so this state means the group was emptied afterwards.
  PERFORM pg_temp.seed_policy('p15-empty-group-only-approver', ARRAY['staging'], '/empty-group');
  PERFORM pg_temp.seed_approver('p15-empty-group-only-approver', NULL, empty_group);
  PERFORM pg_temp.seed_request('r15a-unapprovable', 'p15-empty-group-only-approver', b, 'staging', '[["read","secrets"]]');

  -- p16: the admin named directly and through the group
  PERFORM pg_temp.seed_policy('p16-user-direct-and-through-group', ARRAY['prod'], '/dup-approver');
  PERFORM pg_temp.seed_approver('p16-user-direct-and-through-group', a, NULL);
  PERFORM pg_temp.seed_approver('p16-user-direct-and-through-group', NULL, g);
  PERFORM pg_temp.seed_request('r16a-pending', 'p16-user-direct-and-through-group', b, 'prod', '[["read","secrets"]]');
  PERFORM pg_temp.seed_request('r16b-approved', 'p16-user-direct-and-through-group', b, 'prod', '[["edit","secrets"]]');
  PERFORM pg_temp.seed_review('r16b-approved', a, 'approved', true);

  -- p17: requests in several states, then the policy is deleted. The delete removes r17a entirely
  -- (its privilege is deleted and the FK cascades), leaving pending, rejected and revoked requests.
  PERFORM pg_temp.seed_policy('p17-deleted-policy', ARRAY['dev'], '/deleted');
  PERFORM pg_temp.seed_approver('p17-deleted-policy', a, NULL);
  PERFORM pg_temp.seed_request('r17a-approved-then-cascaded', 'p17-deleted-policy', b, 'dev', '[["read","secrets"]]');
  PERFORM pg_temp.seed_review('r17a-approved-then-cascaded', a, 'approved', true);
  PERFORM pg_temp.seed_request('r17b-pending', 'p17-deleted-policy', b, 'dev', '[["edit","secrets"]]');
  PERFORM pg_temp.seed_request('r17c-rejected', 'p17-deleted-policy', b, 'dev', '[["create","secrets"]]');
  PERFORM pg_temp.seed_review('r17c-rejected', a, 'rejected');
  PERFORM pg_temp.seed_request('r17d-revoked', 'p17-deleted-policy', b, 'dev', '[["delete","secrets"]]', true, '1d');
  PERFORM pg_temp.seed_review('r17d-revoked', a, 'approved', true);
  PERFORM pg_temp.seed_revoke('r17d-revoked', a);
  PERFORM pg_temp.seed_delete_policy('p17-deleted-policy');

  -- p18: the requester approves step 1, the admin step 2
  PERFORM pg_temp.seed_policy('p18-two-step-self-approval-first', ARRAY['prod'], '/two-step');
  PERFORM pg_temp.seed_approver('p18-two-step-self-approval-first', b, NULL, 1, 1);
  PERFORM pg_temp.seed_approver('p18-two-step-self-approval-first', a, NULL, 2, 1);
  PERFORM pg_temp.seed_request('r18a-approved-both-steps', 'p18-two-step-self-approval-first', b, 'prod', '[["read","secrets"]]');
  PERFORM pg_temp.seed_review('r18a-approved-both-steps', b, 'approved');
  PERFORM pg_temp.seed_review('r18a-approved-both-steps', a, 'approved', true);
  PERFORM pg_temp.seed_request('r18b-step1-done-step2-pending', 'p18-two-step-self-approval-first', b, 'prod', '[["edit","secrets"]]', true, '12h');
  PERFORM pg_temp.seed_review('r18b-step1-done-step2-pending', b, 'approved');
  PERFORM pg_temp.seed_request('r18c-rejected-at-step2', 'p18-two-step-self-approval-first', b, 'prod', '[["create","secrets"]]');
  PERFORM pg_temp.seed_review('r18c-rejected-at-step2', b, 'approved');
  PERFORM pg_temp.seed_review('r18c-rejected-at-step2', a, 'rejected');
  -- the requester's own approval would clear step 1 and leave step 2 to the admin
  PERFORM pg_temp.seed_request('r18d-pending-untouched', 'p18-two-step-self-approval-first', b, 'prod', '[["delete","secrets"]]');

  -- p19-p22: the requester is an approver and nobody else is. Each policy keeps a request nobody has
  -- reviewed, which is what an auto-approval of the requester's own steps would act on.

  -- p19: direct approver, self-approval allowed
  PERFORM pg_temp.seed_policy('p19-requester-only-approver', ARRAY['dev'], '/requester-approver');
  PERFORM pg_temp.seed_approver('p19-requester-only-approver', b, NULL);
  PERFORM pg_temp.seed_request('r19a-pending-untouched', 'p19-requester-only-approver', b, 'dev', '[["read","secrets"]]');
  PERFORM pg_temp.seed_request('r19b-self-approved', 'p19-requester-only-approver', b, 'dev', '[["edit","secrets"]]', true, '8h');
  PERFORM pg_temp.seed_review('r19b-self-approved', b, 'approved', true);

  -- p20: approver only through a group, self-approval allowed
  PERFORM pg_temp.seed_policy('p20-requester-only-approver-via-group', ARRAY['dev'], '/requester-group-approver');
  PERFORM pg_temp.seed_approver('p20-requester-only-approver-via-group', NULL, requester_group);
  PERFORM pg_temp.seed_request('r20a-pending-untouched', 'p20-requester-only-approver-via-group', b, 'dev', '[["read","secrets"]]');
  PERFORM pg_temp.seed_request('r20b-self-approved-via-group', 'p20-requester-only-approver-via-group', b, 'dev', '[["edit","secrets"]]');
  PERFORM pg_temp.seed_review('r20b-self-approved-via-group', b, 'approved', true);

  -- p21: direct approver, self-approval disallowed, so nobody can ever approve (and nothing should
  -- auto-approve it either)
  PERFORM pg_temp.seed_policy('p21-requester-only-approver-self-blocked', ARRAY['dev'], '/requester-approver-self-blocked', p_allow_self => false);
  PERFORM pg_temp.seed_approver('p21-requester-only-approver-self-blocked', b, NULL);
  PERFORM pg_temp.seed_request('r21a-unapprovable', 'p21-requester-only-approver-self-blocked', b, 'dev', '[["read","secrets"]]');

  -- p22: the only approver in both steps. The legacy findById dedupes approvers by user id, leaving
  -- the requester in a single step, so their one review approves the whole request.
  PERFORM pg_temp.seed_policy('p22-requester-approver-in-both-steps', ARRAY['staging'], '/requester-every-step');
  PERFORM pg_temp.seed_approver('p22-requester-approver-in-both-steps', b, NULL, 1, 1);
  PERFORM pg_temp.seed_approver('p22-requester-approver-in-both-steps', b, NULL, 2, 1);
  PERFORM pg_temp.seed_request('r22a-pending-untouched', 'p22-requester-approver-in-both-steps', b, 'staging', '[["read","secrets"]]', true, '1d');
  PERFORM pg_temp.seed_request('r22b-self-approved-both-steps', 'p22-requester-approver-in-both-steps', b, 'staging', '[["edit","secrets"]]');
  PERFORM pg_temp.seed_review('r22b-self-approved-both-steps', b, 'approved', true);
END $$;

SELECT p.name AS policy,
       count(r.id) AS requests,
       count(r.id) FILTER (WHERE r.status = 'pending') AS pending,
       count(r.id) FILTER (WHERE r.status = 'approved') AS approved,
       count(r.id) FILTER (WHERE r.status = 'rejected') AS rejected,
       count(r.id) FILTER (WHERE r.status = 'revoked') AS revoked
FROM seed_policies sp
JOIN access_approval_policies p ON p.id = sp.id
LEFT JOIN access_approval_requests r ON r."policyId" = p.id
GROUP BY p.name
ORDER BY p.name;

COMMIT;
