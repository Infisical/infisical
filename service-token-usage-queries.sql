-- Service token usage analysis (Infisical Cloud)
--
-- Every query returns aggregates only and reads from the analytics schema.
-- Each query starts with SET statement_timeout = 0; run that line together with the query.
--
-- Definitions used everywhere:
--   * "paying" org = more than 5 machine identities (no plan data in the database, so this is
--     a proxy). Orgs that replace identities with service tokens have fewer identities and so
--     land in "free"; ST4 estimates how many of them would cross the line.
--   * "active" service token = used in the last 30 days and not expired. Only the last use is
--     stored, so this counts tokens, not requests.
--   * An org is any org with at least one active user, identity, or service token. Sub-orgs
--     are counted as their own org.
--   * Expired tokens are deleted the next time someone presents them, so counts of older
--     tokens are slightly low.


-- =====================================================================================
-- ST1. Overview: service tokens vs identities
-- =====================================================================================
SET statement_timeout = 0;
WITH
st AS (
  SELECT s.*, p."orgId" AS org_id,
         s."lastUsed" > now() - interval '30 days'
           AND (s."expiresAt" IS NULL OR s."expiresAt" > now()) AS active
  FROM analytics.service_tokens s
  JOIN analytics.projects p ON p.id = s."projectId"
)
SELECT
  (SELECT count(*) FROM st)                                                         AS service_tokens,
  (SELECT count(*) FROM st WHERE active)                                            AS active_30d,
  (SELECT count(*) FROM st WHERE "lastUsed" > now() - interval '7 days'
                             AND ("expiresAt" IS NULL OR "expiresAt" > now()))      AS active_7d,
  (SELECT count(*) FROM st WHERE "lastUsed" > now() - interval '90 days'
                             AND ("expiresAt" IS NULL OR "expiresAt" > now()))      AS active_90d,
  (SELECT count(*) FROM st WHERE "lastUsed" IS NULL)                                AS never_used,
  (SELECT count(*) FROM st WHERE "expiresAt" < now())                               AS expired_not_yet_deleted,
  (SELECT count(*) FROM st WHERE "expiresAt" IS NULL)                               AS never_expire,
  (SELECT count(DISTINCT org_id) FROM st)                                           AS orgs_with_tokens,
  (SELECT count(DISTINCT org_id) FROM st WHERE active)                              AS orgs_with_active_tokens,
  (SELECT count(DISTINCT "projectId") FROM st WHERE active)                         AS projects_with_active_tokens,
  (SELECT count(*) FROM analytics.identities)                                       AS identities,
  (SELECT count(DISTINCT "orgId") FROM analytics.identities)                        AS orgs_with_identities;


-- =====================================================================================
-- ST2. Who uses service tokens: by identity count (paying = more than 5 identities)
-- =====================================================================================
SET statement_timeout = 0;
WITH
st AS (
  SELECT p."orgId" AS org_id,
         count(*) AS tokens,
         count(*) FILTER (WHERE s."lastUsed" > now() - interval '30 days'
                            AND (s."expiresAt" IS NULL OR s."expiresAt" > now())) AS active_tokens
  FROM analytics.service_tokens s
  JOIN analytics.projects p ON p.id = s."projectId"
  GROUP BY p."orgId"
),
idn AS (
  SELECT i."orgId" AS org_id, count(*) AS identities FROM analytics.identities i GROUP BY i."orgId"
),
usr AS (
  SELECT m."scopeOrgId" AS org_id, count(*) AS users
  FROM analytics.memberships m
  WHERE m.scope = 'organization' AND m."actorUserId" IS NOT NULL AND m."isActive"
  GROUP BY m."scopeOrgId"
),
orgs AS (
  SELECT org_id FROM usr UNION SELECT org_id FROM idn UNION SELECT org_id FROM st
),
per_org AS (
  SELECT o.org_id,
         COALESCE(i.identities, 0) AS identities,
         COALESCE(s.tokens, 0) AS tokens,
         COALESCE(s.active_tokens, 0) AS active_tokens
  FROM orgs o
  LEFT JOIN idn i ON i.org_id = o.org_id
  LEFT JOIN st s ON s.org_id = o.org_id
)
SELECT
  CASE
    WHEN identities = 0 THEN '1 free: 0 identities'
    WHEN identities <= 5 THEN '2 free: 1-5 identities'
    WHEN identities <= 20 THEN '3 paying: 6-20 identities'
    WHEN identities <= 100 THEN '4 paying: 21-100 identities'
    ELSE '5 paying: 100+ identities'
  END AS segment,
  count(*)                                                              AS orgs,
  count(*) FILTER (WHERE tokens > 0)                                    AS orgs_with_tokens,
  round(100.0 * count(*) FILTER (WHERE tokens > 0) / count(*), 2)       AS pct_with_tokens,
  count(*) FILTER (WHERE active_tokens > 0)                             AS orgs_with_active_tokens,
  round(100.0 * count(*) FILTER (WHERE active_tokens > 0) / count(*), 2) AS pct_with_active_tokens,
  sum(tokens)                                                           AS tokens,
  sum(active_tokens)                                                    AS active_tokens,
  round(avg(active_tokens) FILTER (WHERE active_tokens > 0), 1)         AS avg_active_tokens_when_used,
  sum(identities)                                                       AS identities
FROM per_org
GROUP BY 1
ORDER BY 1;


-- =====================================================================================
-- ST3. Who uses service tokens: by org size (active users)
-- =====================================================================================
SET statement_timeout = 0;
WITH
st AS (
  SELECT p."orgId" AS org_id,
         count(*) AS tokens,
         count(*) FILTER (WHERE s."lastUsed" > now() - interval '30 days'
                            AND (s."expiresAt" IS NULL OR s."expiresAt" > now())) AS active_tokens
  FROM analytics.service_tokens s
  JOIN analytics.projects p ON p.id = s."projectId"
  GROUP BY p."orgId"
),
idn AS (
  SELECT i."orgId" AS org_id, count(*) AS identities FROM analytics.identities i GROUP BY i."orgId"
),
usr AS (
  SELECT m."scopeOrgId" AS org_id, count(*) AS users
  FROM analytics.memberships m
  WHERE m.scope = 'organization' AND m."actorUserId" IS NOT NULL AND m."isActive"
  GROUP BY m."scopeOrgId"
),
orgs AS (
  SELECT org_id FROM usr UNION SELECT org_id FROM idn UNION SELECT org_id FROM st
),
per_org AS (
  SELECT o.org_id,
         COALESCE(u.users, 0) AS users,
         COALESCE(i.identities, 0) AS identities,
         COALESCE(s.tokens, 0) AS tokens,
         COALESCE(s.active_tokens, 0) AS active_tokens
  FROM orgs o
  LEFT JOIN usr u ON u.org_id = o.org_id
  LEFT JOIN idn i ON i.org_id = o.org_id
  LEFT JOIN st s ON s.org_id = o.org_id
)
SELECT
  CASE
    WHEN users <= 1 THEN '1 solo'
    WHEN users <= 5 THEN '2 2-5 users'
    WHEN users <= 20 THEN '3 6-20 users'
    WHEN users <= 100 THEN '4 21-100 users'
    ELSE '5 100+ users'
  END AS org_size,
  count(*)                                                                AS orgs,
  round(100.0 * count(*) FILTER (WHERE identities > 5) / count(*), 2)     AS pct_paying,
  round(100.0 * count(*) FILTER (WHERE active_tokens > 0) / count(*), 2)  AS pct_with_active_tokens,
  round(100.0 * count(*) FILTER (WHERE identities > 0) / count(*), 2)     AS pct_with_identities,
  sum(active_tokens)                                                      AS active_tokens,
  sum(identities)                                                         AS identities,
  round(sum(active_tokens)::numeric / NULLIF(sum(active_tokens) + sum(identities), 0) * 100, 1)
                                                                          AS service_token_share_of_machine_credentials
FROM per_org
GROUP BY 1
ORDER BY 1;


-- =====================================================================================
-- ST4. Substitution: how orgs authenticate machines, and how much identity revenue leaks
-- =====================================================================================
-- "would_cross_paid_line" counts free orgs (5 or fewer identities) that would have more than
-- 5 if each active service token were an identity. The per-project variant assumes one
-- identity per project with active tokens, which is the lower estimate.
SET statement_timeout = 0;
WITH
st AS (
  SELECT p."orgId" AS org_id,
         count(*) FILTER (WHERE s."lastUsed" > now() - interval '30 days'
                            AND (s."expiresAt" IS NULL OR s."expiresAt" > now())) AS active_tokens,
         count(DISTINCT s."projectId") FILTER (WHERE s."lastUsed" > now() - interval '30 days'
                            AND (s."expiresAt" IS NULL OR s."expiresAt" > now())) AS active_projects
  FROM analytics.service_tokens s
  JOIN analytics.projects p ON p.id = s."projectId"
  GROUP BY p."orgId"
),
idn AS (
  SELECT i."orgId" AS org_id, count(*) AS identities FROM analytics.identities i GROUP BY i."orgId"
),
usr AS (
  SELECT m."scopeOrgId" AS org_id
  FROM analytics.memberships m
  WHERE m.scope = 'organization' AND m."actorUserId" IS NOT NULL AND m."isActive"
  GROUP BY m."scopeOrgId"
),
orgs AS (
  SELECT org_id FROM usr UNION SELECT org_id FROM idn UNION SELECT org_id FROM st
),
per_org AS (
  SELECT o.org_id,
         COALESCE(i.identities, 0) AS identities,
         COALESCE(s.active_tokens, 0) AS active_tokens,
         COALESCE(s.active_projects, 0) AS active_projects
  FROM orgs o
  LEFT JOIN idn i ON i.org_id = o.org_id
  LEFT JOIN st s ON s.org_id = o.org_id
)
SELECT
  CASE WHEN identities > 5 THEN 'paying (>5 identities)' ELSE 'free (<=5 identities)' END AS segment,
  CASE
    WHEN active_tokens = 0 AND identities = 0 THEN '1 no machine access'
    WHEN active_tokens > 0 AND identities = 0 THEN '2 service tokens only'
    WHEN active_tokens > 0 AND identities > 0 THEN '3 both'
    ELSE '4 identities only'
  END AS machine_auth,
  count(*) AS orgs,
  sum(active_tokens) AS active_tokens,
  sum(identities) AS identities,
  count(*) FILTER (WHERE identities <= 5 AND identities + active_tokens > 5)   AS would_cross_paid_line_per_token,
  count(*) FILTER (WHERE identities <= 5 AND identities + active_projects > 5) AS would_cross_paid_line_per_project,
  COALESCE(sum(GREATEST(identities + active_tokens - 5, 0)) FILTER (WHERE identities <= 5), 0)
                                                                               AS billable_identities_above_free_per_token,
  COALESCE(sum(GREATEST(identities + active_projects - 5, 0)) FILTER (WHERE identities <= 5), 0)
                                                                               AS billable_identities_above_free_per_project
FROM per_org
GROUP BY 1, 2
ORDER BY 1, 2;


-- =====================================================================================
-- ST5. Growth: service tokens vs identities created per month
-- =====================================================================================
SET statement_timeout = 0;
WITH
st AS (
  SELECT date_trunc('month', s."createdAt")::date AS month,
         count(*) AS tokens_created,
         count(DISTINCT p."orgId") AS orgs_creating_tokens,
         count(*) FILTER (WHERE s."lastUsed" > now() - interval '30 days'
                            AND (s."expiresAt" IS NULL OR s."expiresAt" > now())) AS still_active
  FROM analytics.service_tokens s
  JOIN analytics.projects p ON p.id = s."projectId"
  WHERE s."createdAt" > now() - interval '24 months'
  GROUP BY 1
),
idn AS (
  SELECT date_trunc('month', i."createdAt")::date AS month,
         count(*) AS identities_created,
         count(DISTINCT i."orgId") AS orgs_creating_identities
  FROM analytics.identities i
  WHERE i."createdAt" > now() - interval '24 months'
  GROUP BY 1
)
SELECT
  COALESCE(st.month, idn.month) AS month,
  COALESCE(st.tokens_created, 0) AS tokens_created,
  COALESCE(st.orgs_creating_tokens, 0) AS orgs_creating_tokens,
  COALESCE(st.still_active, 0) AS tokens_still_active,
  COALESCE(idn.identities_created, 0) AS identities_created,
  COALESCE(idn.orgs_creating_identities, 0) AS orgs_creating_identities,
  round(100.0 * COALESCE(st.tokens_created, 0)
        / NULLIF(COALESCE(st.tokens_created, 0) + COALESCE(idn.identities_created, 0), 0), 1)
                                                          AS service_token_share_of_new_credentials
FROM st
FULL JOIN idn ON idn.month = st.month
ORDER BY 1;


-- =====================================================================================
-- ST6. First choice: for orgs that set up machine access, did they start with a service
--      token or an identity? Grouped by the month of that first credential.
-- =====================================================================================
SET statement_timeout = 0;
WITH
first_st AS (
  SELECT p."orgId" AS org_id, min(s."createdAt") AS first_at
  FROM analytics.service_tokens s
  JOIN analytics.projects p ON p.id = s."projectId"
  GROUP BY p."orgId"
),
first_idn AS (
  SELECT i."orgId" AS org_id, min(i."createdAt") AS first_at
  FROM analytics.identities i
  GROUP BY i."orgId"
),
firsts AS (
  SELECT COALESCE(s.org_id, i.org_id) AS org_id,
         LEAST(s.first_at, i.first_at) AS first_at,
         CASE
           WHEN i.first_at IS NULL THEN 'service token only'
           WHEN s.first_at IS NULL THEN 'identity only'
           WHEN s.first_at < i.first_at THEN 'service token first, identity later'
           ELSE 'identity first, service token later'
         END AS path
  FROM first_st s
  FULL JOIN first_idn i ON i.org_id = s.org_id
)
SELECT
  date_trunc('month', first_at)::date AS month,
  count(*) AS orgs_starting_machine_access,
  count(*) FILTER (WHERE path = 'service token only')                  AS service_token_only,
  count(*) FILTER (WHERE path = 'service token first, identity later') AS service_token_then_identity,
  count(*) FILTER (WHERE path = 'identity first, service token later') AS identity_then_service_token,
  count(*) FILTER (WHERE path = 'identity only')                       AS identity_only,
  round(100.0 * count(*) FILTER (WHERE path LIKE 'service token%') / count(*), 1) AS pct_started_with_service_token
FROM firsts
WHERE first_at > now() - interval '24 months'
GROUP BY 1
ORDER BY 1;


-- =====================================================================================
-- ST7. Are service tokens kept alive or abandoned? Activity by the year they were created
-- =====================================================================================
SET statement_timeout = 0;
SELECT
  extract(year FROM s."createdAt")::int AS created_year,
  count(*) AS tokens,
  count(*) FILTER (WHERE s."lastUsed" > now() - interval '7 days')   AS used_last_7d,
  count(*) FILTER (WHERE s."lastUsed" > now() - interval '30 days')  AS used_last_30d,
  count(*) FILTER (WHERE s."lastUsed" > now() - interval '90 days')  AS used_last_90d,
  count(*) FILTER (WHERE s."lastUsed" IS NULL)                       AS never_used,
  count(*) FILTER (WHERE s."expiresAt" IS NULL)                      AS never_expire,
  round(100.0 * count(*) FILTER (WHERE s."lastUsed" > now() - interval '30 days') / count(*), 1) AS pct_active_30d
FROM analytics.service_tokens s
GROUP BY 1
ORDER BY 1;


-- =====================================================================================
-- ST8. Active service tokens vs active identities (identities that authenticated recently)
-- =====================================================================================
-- Needs identity_access_tokens in the analytics schema. Access token rows are removed after
-- they expire, so this undercounts identities that authenticate rarely.
SET statement_timeout = 0;
WITH
active_idn AS (
  SELECT i."orgId" AS org_id, count(DISTINCT t."identityId") AS active_identities
  FROM analytics.identity_access_tokens t
  JOIN analytics.identities i ON i.id = t."identityId"
  WHERE t."accessTokenLastUsedAt" > now() - interval '30 days'
  GROUP BY i."orgId"
),
active_st AS (
  SELECT p."orgId" AS org_id, count(*) AS active_tokens
  FROM analytics.service_tokens s
  JOIN analytics.projects p ON p.id = s."projectId"
  WHERE s."lastUsed" > now() - interval '30 days'
    AND (s."expiresAt" IS NULL OR s."expiresAt" > now())
  GROUP BY p."orgId"
),
idn AS (
  SELECT i."orgId" AS org_id, count(*) AS identities FROM analytics.identities i GROUP BY i."orgId"
)
SELECT
  CASE WHEN COALESCE(idn.identities, 0) > 5 THEN 'paying (>5 identities)' ELSE 'free (<=5 identities)' END AS segment,
  count(*) FILTER (WHERE COALESCE(s.active_tokens, 0) > 0)        AS orgs_with_active_tokens,
  count(*) FILTER (WHERE COALESCE(a.active_identities, 0) > 0)    AS orgs_with_active_identities,
  sum(COALESCE(s.active_tokens, 0))                               AS active_tokens,
  sum(COALESCE(a.active_identities, 0))                           AS active_identities,
  round(100.0 * sum(COALESCE(s.active_tokens, 0))
        / NULLIF(sum(COALESCE(s.active_tokens, 0)) + sum(COALESCE(a.active_identities, 0)), 0), 1)
                                                                  AS service_token_share_of_active_machine_auth
FROM (SELECT org_id FROM active_idn UNION SELECT org_id FROM active_st) o
LEFT JOIN active_idn a ON a.org_id = o.org_id
LEFT JOIN active_st s ON s.org_id = o.org_id
LEFT JOIN idn ON idn.org_id = o.org_id
GROUP BY 1
ORDER BY 1;
