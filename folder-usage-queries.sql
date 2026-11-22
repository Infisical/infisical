-- Secrets Management folder usage analysis (Infisical Cloud)
--
-- Run against a read replica. Every query is self-contained and returns aggregates only
-- (no org, project, or user identifiers), so the results are safe to paste back.
--
-- Scope used everywhere:
--   * projects.type = 'secret-manager', not soft-deleted
--   * project_environments not soft-deleted
--   * "user folder" = any folder except the root (parentId IS NULL) and replication
--     reserved folders (isReserved = true)
--   * "secret" = secrets_v2 row with type = 'shared' (personal overrides excluded)
--
-- If you want to drop internal/test orgs, add a filter to the sm_envs CTE in each query,
-- e.g. AND p."orgId" NOT IN (...).
--
-- The recursive tree CTE walks every folder on Cloud. If a query is slow, run it with
-- SET statement_timeout = '15min';
--
-- Every table is read from the analytics schema (analytics.<table>).


-- =====================================================================================
-- Q1. Overview: adoption of folders
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id, p."orgId" AS org_id, p.version AS project_version
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, f."envId", COALESCE(f."isReserved", false) AS reserved, 0 AS depth
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, c."envId", COALESCE(c."isReserved", false), t.depth + 1
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
),
secret_counts AS (
  SELECT s."folderId", count(*) AS n FROM analytics.secrets_v2 s WHERE s.type = 'shared' GROUP BY s."folderId"
)
SELECT
  count(DISTINCT e.org_id)                                                        AS orgs,
  count(DISTINCT e.project_id)                                                    AS projects,
  count(DISTINCT e.project_id) FILTER (WHERE e.project_version = 3)               AS projects_v3,
  count(DISTINCT e.env_id)                                                        AS environments,
  count(*) FILTER (WHERE t.depth > 0 AND NOT t.reserved)                          AS user_folders,
  count(*) FILTER (WHERE t.reserved)                                              AS replication_reserved_folders,
  count(DISTINCT e.org_id) FILTER (WHERE t.depth > 0 AND NOT t.reserved)          AS orgs_using_folders,
  count(DISTINCT e.project_id) FILTER (WHERE t.depth > 0 AND NOT t.reserved)      AS projects_using_folders,
  round(100.0 * count(DISTINCT e.project_id) FILTER (WHERE t.depth > 0 AND NOT t.reserved)
        / NULLIF(count(DISTINCT e.project_id), 0), 2)                             AS pct_projects_using_folders,
  sum(COALESCE(sc.n, 0))                                                          AS total_secrets,
  sum(COALESCE(sc.n, 0)) FILTER (WHERE t.depth = 0)                               AS secrets_in_root,
  sum(COALESCE(sc.n, 0)) FILTER (WHERE t.depth > 0 AND NOT t.reserved)            AS secrets_in_user_folders,
  round(100.0 * sum(COALESCE(sc.n, 0)) FILTER (WHERE t.depth > 0 AND NOT t.reserved)
        / NULLIF(sum(COALESCE(sc.n, 0)), 0), 2)                                   AS pct_secrets_in_folders
FROM tree t
JOIN sm_envs e ON e.env_id = t."envId"
LEFT JOIN secret_counts sc ON sc."folderId" = t.id;


-- =====================================================================================
-- Q2. Folders per project: percentiles and histogram (all projects, including 0)
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, f."envId", COALESCE(f."isReserved", false) AS reserved, 0 AS depth
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, c."envId", COALESCE(c."isReserved", false), t.depth + 1
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
),
per_project AS (
  SELECT e.project_id,
         count(*) FILTER (WHERE t.depth > 0 AND NOT t.reserved) AS folders,
         count(DISTINCT e.env_id) AS envs
  FROM tree t JOIN sm_envs e ON e.env_id = t."envId"
  GROUP BY e.project_id
)
SELECT
  CASE
    WHEN folders = 0 THEN '0'
    WHEN folders <= 2 THEN '1-2'
    WHEN folders <= 5 THEN '3-5'
    WHEN folders <= 10 THEN '6-10'
    WHEN folders <= 25 THEN '11-25'
    WHEN folders <= 50 THEN '26-50'
    WHEN folders <= 100 THEN '51-100'
    WHEN folders <= 500 THEN '101-500'
    WHEN folders <= 1000 THEN '501-1000'
    ELSE '1000+'
  END AS folders_per_project_bucket,
  count(*) AS projects,
  round(avg(folders::numeric / NULLIF(envs, 0)), 1) AS avg_folders_per_env
FROM per_project
GROUP BY 1
ORDER BY min(folders);

-- Q2b. Percentiles among projects that use folders
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, f."envId", COALESCE(f."isReserved", false) AS reserved, 0 AS depth
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, c."envId", COALESCE(c."isReserved", false), t.depth + 1
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
),
per_project AS (
  SELECT e.project_id,
         count(*) FILTER (WHERE t.depth > 0 AND NOT t.reserved) AS folders,
         max(t.depth) FILTER (WHERE NOT t.reserved) AS max_depth
  FROM tree t JOIN sm_envs e ON e.env_id = t."envId"
  GROUP BY e.project_id
)
SELECT
  count(*) AS projects_using_folders,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY folders) AS p50_folders,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY folders) AS p75_folders,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY folders) AS p90_folders,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY folders) AS p99_folders,
  max(folders) AS max_folders,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY max_depth) AS p50_max_depth,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY max_depth) AS p90_max_depth,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY max_depth) AS p99_max_depth,
  max(max_depth) AS max_depth
FROM per_project
WHERE folders > 0;


-- =====================================================================================
-- Q3. Depth: how deep are trees, and where do secrets live
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id, p."orgId" AS org_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, f."envId", COALESCE(f."isReserved", false) AS reserved, 0 AS depth
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, c."envId", COALESCE(c."isReserved", false), t.depth + 1
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
),
secret_counts AS (
  SELECT s."folderId", count(*) AS n FROM analytics.secrets_v2 s WHERE s.type = 'shared' GROUP BY s."folderId"
)
SELECT
  t.depth,
  count(*)                                   AS folders,
  count(DISTINCT e.project_id)               AS projects,
  count(DISTINCT e.org_id)                   AS orgs,
  sum(COALESCE(sc.n, 0))                     AS secrets,
  round(avg(COALESCE(sc.n, 0)), 2)           AS avg_secrets_per_folder,
  count(*) FILTER (WHERE COALESCE(sc.n, 0) = 0) AS folders_without_secrets
FROM tree t
JOIN sm_envs e ON e.env_id = t."envId"
LEFT JOIN secret_counts sc ON sc."folderId" = t.id
WHERE NOT t.reserved
GROUP BY t.depth
ORDER BY t.depth;


-- =====================================================================================
-- Q4. Breadth: how many child folders does a folder have
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, COALESCE(f."isReserved", false) AS reserved, 0 AS depth
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, COALESCE(c."isReserved", false), t.depth + 1
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
),
children AS (
  SELECT p.id, p.depth, count(c.id) FILTER (WHERE NOT COALESCE(c."isReserved", false)) AS n_children
  FROM tree p
  LEFT JOIN analytics.secret_folders c ON c."parentId" = p.id
  WHERE NOT p.reserved
  GROUP BY p.id, p.depth
)
SELECT
  CASE WHEN depth = 0 THEN 'root' ELSE 'subfolder' END AS folder_kind,
  count(*) FILTER (WHERE n_children > 0) AS folders_with_children,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY n_children) FILTER (WHERE n_children > 0) AS p50_children,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY n_children) FILTER (WHERE n_children > 0) AS p90_children,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY n_children) FILTER (WHERE n_children > 0) AS p99_children,
  max(n_children) AS max_children
FROM children
GROUP BY 1;


-- =====================================================================================
-- Q5. What folders are used for: classify every user folder by its contents
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, COALESCE(f."isReserved", false) AS reserved, 0 AS depth
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, COALESCE(c."isReserved", false), t.depth + 1
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
),
contents AS (
  SELECT
    t.id,
    (SELECT count(*) FROM analytics.secrets_v2 s WHERE s."folderId" = t.id AND s.type = 'shared')                AS secrets,
    (SELECT count(*) FROM analytics.secret_folders c WHERE c."parentId" = t.id AND NOT COALESCE(c."isReserved", false)) AS children,
    (SELECT count(*) FROM analytics.secret_imports i WHERE i."folderId" = t.id AND NOT COALESCE(i."isReserved", false)) AS imports,
    (SELECT count(*) FROM analytics.dynamic_secrets d WHERE d."folderId" = t.id)                                  AS dynamic_secrets,
    (SELECT count(*) FROM analytics.secret_rotations_v2 r WHERE r."folderId" = t.id)                              AS rotations
  FROM tree t
  WHERE t.depth > 0 AND NOT t.reserved
)
SELECT
  CASE
    WHEN secrets = 0 AND children = 0 AND imports = 0 AND dynamic_secrets = 0 AND rotations = 0 THEN '1 empty'
    WHEN secrets = 0 AND imports = 0 AND dynamic_secrets = 0 AND rotations = 0 THEN '2 container only (subfolders)'
    WHEN secrets = 0 AND dynamic_secrets = 0 AND rotations = 0 THEN '3 imports only (aggregator)'
    WHEN secrets = 0 THEN '4 dynamic secrets / rotations only'
    WHEN children = 0 THEN '5 leaf with secrets'
    ELSE '6 secrets and subfolders'
  END AS folder_role,
  count(*) AS folders,
  round(100.0 * count(*) / sum(count(*)) OVER (), 2) AS pct
FROM contents
GROUP BY 1
ORDER BY 1;

-- Q5b. Secrets per folder histogram (user folders that hold at least one secret)
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, COALESCE(f."isReserved", false) AS reserved, 0 AS depth
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, COALESCE(c."isReserved", false), t.depth + 1
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
),
counts AS (
  SELECT t.id, t.depth, count(s.id) AS n
  FROM tree t JOIN analytics.secrets_v2 s ON s."folderId" = t.id AND s.type = 'shared'
  WHERE NOT t.reserved
  GROUP BY t.id, t.depth
)
SELECT
  CASE WHEN depth = 0 THEN 'root' ELSE 'subfolder' END AS folder_kind,
  CASE
    WHEN n = 1 THEN '1'
    WHEN n <= 5 THEN '2-5'
    WHEN n <= 10 THEN '6-10'
    WHEN n <= 25 THEN '11-25'
    WHEN n <= 50 THEN '26-50'
    WHEN n <= 100 THEN '51-100'
    WHEN n <= 500 THEN '101-500'
    ELSE '500+'
  END AS secrets_bucket,
  count(*) AS folders
FROM counts
GROUP BY 1, 2
ORDER BY 1, min(n);


-- =====================================================================================
-- Q6. Per project: how much of the project's secrets live outside root
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, f."envId", 0 AS depth
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, c."envId", t.depth + 1
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
  WHERE NOT COALESCE(c."isReserved", false)
),
per_project AS (
  SELECT e.project_id,
         count(s.id) AS secrets,
         count(s.id) FILTER (WHERE t.depth > 0) AS in_folders
  FROM tree t
  JOIN sm_envs e ON e.env_id = t."envId"
  JOIN analytics.secrets_v2 s ON s."folderId" = t.id AND s.type = 'shared'
  GROUP BY e.project_id
)
SELECT
  CASE
    WHEN in_folders = 0 THEN '1 all secrets in root'
    WHEN in_folders::numeric / secrets < 0.25 THEN '2 mostly root (<25% in folders)'
    WHEN in_folders::numeric / secrets < 0.75 THEN '3 mixed (25-75%)'
    WHEN in_folders < secrets THEN '4 mostly folders (>75%)'
    ELSE '5 all secrets in folders'
  END AS layout,
  count(*) AS projects,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY secrets) AS p50_project_secrets
FROM per_project
GROUP BY 1
ORDER BY 1;


-- =====================================================================================
-- Q7. Common folder names (only names used by >= 10 orgs, so nothing customer-specific leaks)
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id, p."orgId" AS org_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, f."envId", f.name, 0 AS depth
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, c."envId", c.name, t.depth + 1
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
  WHERE NOT COALESCE(c."isReserved", false)
)
SELECT
  lower(t.name)                  AS folder_name,
  count(*)                       AS folders,
  count(DISTINCT e.project_id)   AS projects,
  count(DISTINCT e.org_id)       AS orgs,
  round(avg(t.depth), 2)         AS avg_depth
FROM tree t JOIN sm_envs e ON e.env_id = t."envId"
WHERE t.depth > 0
GROUP BY lower(t.name)
HAVING count(DISTINCT e.org_id) >= 10
ORDER BY orgs DESC
LIMIT 150;

-- Q7b. Naming conventions
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, f.name, 0 AS depth
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, c.name, t.depth + 1
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
  WHERE NOT COALESCE(c."isReserved", false)
)
SELECT
  CASE
    WHEN name ~ '^[a-z0-9]+$' THEN 'lowercase single word'
    WHEN name ~ '^[a-z0-9]+(-[a-z0-9]+)+$' THEN 'kebab-case'
    WHEN name ~ '^[a-z0-9]+(_[a-z0-9]+)+$' THEN 'snake_case'
    WHEN name ~ '^[A-Z0-9_]+$' THEN 'UPPER_CASE'
    WHEN name ~ '^[a-z]+[A-Z][A-Za-z0-9]*$' THEN 'camelCase'
    WHEN name ~ '^[A-Z][a-z0-9]+([A-Z][a-z0-9]*)*$' THEN 'PascalCase / Capitalized'
    WHEN name ~ '\.' THEN 'contains dots (domain / host like)'
    ELSE 'other / mixed'
  END AS convention,
  count(*) AS folders,
  round(avg(length(name)), 1) AS avg_len
FROM tree
WHERE depth > 0
GROUP BY 1
ORDER BY folders DESC;

-- Q7c. Semantic category of depth-1 folder names (what the first level of the tree models)
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e.slug AS env_slug, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
lvl1 AS (
  SELECT lower(c.name) AS name, e.project_id, e.env_slug
  FROM analytics.secret_folders r
  JOIN sm_envs e ON e.env_id = r."envId"
  JOIN analytics.secret_folders c ON c."parentId" = r.id AND NOT COALESCE(c."isReserved", false)
  WHERE r."parentId" IS NULL
),
project_env_slugs AS (
  SELECT e."projectId" AS project_id, lower(e.slug) AS slug FROM analytics.project_environments e WHERE e."softDeletedAt" IS NULL
  UNION
  SELECT e."projectId", lower(e.name) FROM analytics.project_environments e WHERE e."softDeletedAt" IS NULL
)
SELECT
  CASE
    WHEN EXISTS (SELECT 1 FROM project_env_slugs s WHERE s.project_id = l.project_id AND s.slug = l.name)
      THEN 'matches an environment name of the same project'
    WHEN l.name ~ '^(dev|develop|development|stg|stage|staging|qa|test|testing|uat|preprod|pre-prod|prod|production|prd|sandbox|demo|local|perf)$'
      THEN 'environment-like'
    WHEN l.name ~ '(aws|gcp|azure|k8s|kubernetes|eks|gke|aks|cluster|region|us-|eu-|ap-)'
      THEN 'infra / cloud / region'
    WHEN l.name ~ '(api|web|app|frontend|backend|service|svc|worker|server|client|mobile|ui)'
      THEN 'application / service'
    WHEN l.name ~ '(db|database|postgres|mysql|mongo|redis|rds|sql|kafka|rabbit|elastic)'
      THEN 'datastore'
    WHEN l.name ~ '(stripe|twilio|sendgrid|slack|github|gitlab|openai|datadog|sentry|auth0|firebase|google|apple|smtp|email|mail)'
      THEN 'third-party / vendor'
    WHEN l.name ~ '(team|squad|tenant|customer|client|org)'
      THEN 'team / tenant'
    WHEN l.name ~ '(shared|common|global|base|default|general|core)'
      THEN 'shared / common'
    WHEN l.name ~ '(ci|cd|pipeline|deploy|build|terraform|ansible|helm)'
      THEN 'ci / deploy tooling'
    ELSE 'other'
  END AS category,
  count(*) AS folders,
  count(DISTINCT project_id) AS projects
FROM lvl1 l
GROUP BY 1
ORDER BY folders DESC;


-- =====================================================================================
-- Q8. Structure parity across environments (do all envs have the same folder tree?)
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, f."envId", 0 AS depth, ''::text AS path
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, c."envId", t.depth + 1, t.path || '/' || c.name
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
  WHERE NOT COALESCE(c."isReserved", false)
),
env_counts AS (
  SELECT project_id, count(*) AS n_envs FROM sm_envs GROUP BY project_id
),
paths AS (
  SELECT e.project_id, t.path, count(DISTINCT t."envId") AS envs_with_path
  FROM tree t JOIN sm_envs e ON e.env_id = t."envId"
  WHERE t.depth > 0
  GROUP BY e.project_id, t.path
),
per_project AS (
  SELECT p.project_id, ec.n_envs,
         count(*) AS distinct_paths,
         count(*) FILTER (WHERE p.envs_with_path = ec.n_envs) AS paths_in_all_envs,
         count(*) FILTER (WHERE p.envs_with_path = 1) AS paths_in_one_env
  FROM paths p JOIN env_counts ec ON ec.project_id = p.project_id
  WHERE ec.n_envs >= 2
  GROUP BY p.project_id, ec.n_envs
)
SELECT
  CASE
    WHEN paths_in_all_envs = distinct_paths THEN '1 identical tree in every env'
    WHEN paths_in_all_envs::numeric / distinct_paths >= 0.75 THEN '2 mostly mirrored (>=75%)'
    WHEN paths_in_all_envs::numeric / distinct_paths >= 0.25 THEN '3 partially mirrored'
    WHEN paths_in_all_envs > 0 THEN '4 mostly divergent (<25%)'
    ELSE '5 no path shared by all envs'
  END AS parity,
  count(*) AS projects,
  round(avg(n_envs), 1) AS avg_envs,
  round(avg(distinct_paths), 1) AS avg_distinct_paths,
  round(avg(paths_in_one_env::numeric / distinct_paths) * 100, 1) AS avg_pct_paths_in_single_env
FROM per_project
GROUP BY 1
ORDER BY 1;


-- =====================================================================================
-- Q9. Folder metadata: descriptions, renames, age, staleness
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, f.description, f.version, f."createdAt", f."lastSecretModified", 0 AS depth
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, c.description, c.version, c."createdAt", c."lastSecretModified", t.depth + 1
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
  WHERE NOT COALESCE(c."isReserved", false)
)
SELECT
  count(*)                                                                      AS user_folders,
  count(*) FILTER (WHERE NULLIF(trim(description), '') IS NOT NULL)             AS with_description,
  count(*) FILTER (WHERE COALESCE(version, 1) > 1)                              AS updated_at_least_once,
  count(*) FILTER (WHERE "createdAt" > now() - interval '90 days')              AS created_last_90d,
  count(*) FILTER (WHERE "lastSecretModified" IS NULL)                          AS secrets_never_modified,
  count(*) FILTER (WHERE "lastSecretModified" > now() - interval '7 days')      AS modified_last_7d,
  count(*) FILTER (WHERE "lastSecretModified" > now() - interval '30 days')     AS modified_last_30d,
  count(*) FILTER (WHERE "lastSecretModified" > now() - interval '90 days')     AS modified_last_90d,
  count(*) FILTER (WHERE "lastSecretModified" < now() - interval '365 days')    AS stale_over_1y
FROM tree
WHERE depth > 0;


-- =====================================================================================
-- Q10. Which features attach to folders, and how deep
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, f."envId", 0 AS depth
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, c."envId", t.depth + 1
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
  WHERE NOT COALESCE(c."isReserved", false)
),
attached AS (
  SELECT 'secret_sync' AS feature, s."folderId" AS folder_id FROM analytics.secret_syncs s WHERE s."folderId" IS NOT NULL
  UNION ALL
  SELECT 'secret_sync (includeAllSubFolders)', s."folderId" FROM analytics.secret_syncs s WHERE s."folderId" IS NOT NULL AND s."includeAllSubFolders"
  UNION ALL
  SELECT 'dynamic_secret', d."folderId" FROM analytics.dynamic_secrets d
  UNION ALL
  SELECT 'secret_rotation_v2', r."folderId" FROM analytics.secret_rotations_v2 r
  UNION ALL
  SELECT 'secret_import (destination)', i."folderId" FROM analytics.secret_imports i WHERE NOT COALESCE(i."isReserved", false)
  UNION ALL
  SELECT 'secret_import (replication)', i."folderId" FROM analytics.secret_imports i WHERE i."isReplication"
  UNION ALL
  SELECT 'folder_grant (shared to another project)', g."sourceFolderId" FROM analytics.project_folder_grants g
  UNION ALL
  SELECT 'folder-scoped additional privilege', a."folderId" FROM analytics.additional_privileges a WHERE a."folderId" IS NOT NULL
)
SELECT
  a.feature,
  count(*)                                              AS total,
  count(*) FILTER (WHERE t.depth = 0)                   AS at_root,
  count(*) FILTER (WHERE t.depth > 0)                   AS in_folders,
  round(100.0 * count(*) FILTER (WHERE t.depth > 0) / NULLIF(count(*), 0), 1) AS pct_in_folders,
  count(DISTINCT e.project_id)                          AS projects,
  count(DISTINCT e.project_id) FILTER (WHERE t.depth > 0) AS projects_using_in_folders,
  max(t.depth)                                          AS max_depth
FROM attached a
JOIN tree t ON t.id = a.folder_id
JOIN sm_envs e ON e.env_id = t."envId"
GROUP BY a.feature
ORDER BY total DESC;


-- =====================================================================================
-- Q11. Secret imports: how folders are composed from each other
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, f."envId", 0 AS depth, '/'::text AS path
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, c."envId", t.depth + 1,
         CASE WHEN t.depth = 0 THEN '/' || c.name ELSE t.path || '/' || c.name END
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
  WHERE NOT COALESCE(c."isReserved", false)
),
imports AS (
  SELECT i.*, dst.depth AS dst_depth, dst."envId" AS dst_env, de.project_id AS dst_project,
         se.project_id AS src_project, src.id AS src_folder_id
  FROM analytics.secret_imports i
  JOIN tree dst ON dst.id = i."folderId"
  JOIN sm_envs de ON de.env_id = dst."envId"
  LEFT JOIN sm_envs se ON se.env_id = i."importEnv"
  LEFT JOIN tree src ON src."envId" = i."importEnv"
                     AND src.path = COALESCE(NULLIF(rtrim(i."importPath", '/'), ''), '/')
  WHERE NOT COALESCE(i."isReserved", false)
)
SELECT
  count(*)                                                                    AS imports,
  count(DISTINCT dst_project)                                                 AS projects_using_imports,
  count(*) FILTER (WHERE dst_depth = 0)                                       AS into_root,
  count(*) FILTER (WHERE dst_depth > 0)                                       AS into_subfolder,
  count(*) FILTER (WHERE "importPath" = '/')                                  AS from_root,
  count(*) FILTER (WHERE "importPath" <> '/')                                 AS from_subfolder,
  count(*) FILTER (WHERE "importEnv" = dst_env)                               AS same_env,
  count(*) FILTER (WHERE "importEnv" <> dst_env AND src_project = dst_project) AS cross_env_same_project,
  count(*) FILTER (WHERE src_project IS DISTINCT FROM dst_project)            AS cross_project_or_unknown_env,
  count(*) FILTER (WHERE "isReplication")                                     AS replication,
  count(*) FILTER (WHERE "isReplication" AND "isReplicationSuccess" IS FALSE) AS replication_failing,
  count(*) FILTER (WHERE src_folder_id IS NULL)                               AS source_path_missing,
  count(*) FILTER (WHERE EXISTS (SELECT 1 FROM analytics.secret_imports i2 WHERE i2."folderId" = src_folder_id))
                                                                              AS source_itself_imports_chained
FROM imports;

-- Q11b. Imports per destination folder
SELECT
  CASE WHEN n = 1 THEN '1' WHEN n <= 3 THEN '2-3' WHEN n <= 5 THEN '4-5'
       WHEN n <= 10 THEN '6-10' WHEN n <= 25 THEN '11-25' ELSE '25+' END AS imports_per_folder,
  count(*) AS folders
FROM (
  SELECT i."folderId", count(*) AS n
  FROM analytics.secret_imports i
  JOIN analytics.secret_folders f ON f.id = i."folderId"
  JOIN analytics.project_environments e ON e.id = f."envId" AND e."softDeletedAt" IS NULL
  JOIN analytics.projects p ON p.id = e."projectId" AND p.type = 'secret-manager' AND p."softDeletedAt" IS NULL
  WHERE NOT COALESCE(i."isReserved", false)
  GROUP BY i."folderId"
) x
GROUP BY 1
ORDER BY min(n);


-- =====================================================================================
-- Q12. Policies scoped by folder path (approvals and access)
-- =====================================================================================
WITH paths AS (
  SELECT 'approval_policies (' || ap.type || ')' AS source, ase."secretPath" AS path, ap."projectId" AS project_id
  FROM analytics.approval_policy_secret_environments ase
  JOIN analytics.approval_policies ap ON ap.id = ase."policyId"
  WHERE COALESCE(ap."isActive", true)
  UNION ALL
  SELECT 'secret_approval_policies (legacy)', sap."secretPath", e."projectId"
  FROM analytics.secret_approval_policies sap JOIN analytics.project_environments e ON e.id = sap."envId"
  WHERE sap."deletedAt" IS NULL
  UNION ALL
  SELECT 'access_approval_policies (legacy)', aap."secretPath", e."projectId"
  FROM analytics.access_approval_policies aap JOIN analytics.project_environments e ON e.id = aap."envId"
  WHERE aap."deletedAt" IS NULL
)
SELECT
  source,
  CASE
    WHEN path IN ('/', '') THEN 'root only'
    WHEN path IN ('/**', '/*', '**', '*') THEN 'whole env glob'
    WHEN path ~ '[*?{]' THEN 'subtree / glob pattern'
    ELSE 'exact folder path'
  END AS path_kind,
  count(*) AS rows,
  count(DISTINCT project_id) AS projects,
  round(avg(array_length(string_to_array(trim(both '/' from path), '/'), 1)), 2) AS avg_path_segments
FROM paths
GROUP BY 1, 2
ORDER BY 1, rows DESC;


-- =====================================================================================
-- Q13. Folder-path conditions in custom roles and additional privileges
-- =====================================================================================
WITH perms AS (
  SELECT 'custom project role' AS source, r."projectId" AS project_id, r.permissions::text AS p
  FROM analytics.roles r JOIN analytics.projects pr ON pr.id = r."projectId" AND pr.type = 'secret-manager' AND pr."softDeletedAt" IS NULL
  UNION ALL
  SELECT 'additional privilege', a."projectId", a.permissions::text
  FROM analytics.additional_privileges a JOIN analytics.projects pr ON pr.id = a."projectId" AND pr.type = 'secret-manager' AND pr."softDeletedAt" IS NULL
)
SELECT
  source,
  count(*)                                                  AS total,
  count(*) FILTER (WHERE p LIKE '%secretPath%')             AS uses_secret_path_condition,
  count(*) FILTER (WHERE p LIKE '%secretPath%' AND p LIKE '%$glob%') AS secret_path_glob,
  count(*) FILTER (WHERE p LIKE '%secretPath%' AND p LIKE '%$eq%')   AS secret_path_eq,
  count(*) FILTER (WHERE p LIKE '%secretPath%' AND p LIKE '%$in%')   AS secret_path_in,
  count(*) FILTER (WHERE p LIKE '%secret-folders%')         AS has_folder_subject_rule,
  count(DISTINCT project_id) FILTER (WHERE p LIKE '%secretPath%') AS projects_with_path_scoped_access
FROM perms
GROUP BY source;


-- =====================================================================================
-- Q14. Secret references that point into folders (${env.path.KEY})
-- =====================================================================================
SELECT
  CASE WHEN r."targetProjectSlug" IS NOT NULL THEN 'cross-project' ELSE 'same project' END AS scope,
  CASE WHEN r."secretPath" IN ('/', '') THEN 'root' ELSE 'subfolder' END AS target,
  count(*) AS ref_count,
  round(avg(array_length(string_to_array(NULLIF(trim(both '/' from r."secretPath"), ''), '/'), 1)), 2) AS avg_target_depth
FROM analytics.secret_references_v2 r
GROUP BY 1, 2
ORDER BY ref_count DESC;


-- =====================================================================================
-- Q15. Folders vs tags: are they alternatives or used together?
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, f."envId", 0 AS depth
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, c."envId", t.depth + 1
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
  WHERE NOT COALESCE(c."isReserved", false)
),
per_project AS (
  SELECT e.project_id,
         bool_or(t.depth > 0) AS uses_folders,
         EXISTS (
           SELECT 1 FROM analytics.secret_v2_tag_junction j
           JOIN analytics.secret_tags st ON st.id = j."secret_tagsId"
           WHERE st."projectId" = e.project_id
         ) AS uses_tags
  FROM tree t JOIN sm_envs e ON e.env_id = t."envId"
  GROUP BY e.project_id
)
SELECT uses_folders, uses_tags, count(*) AS projects
FROM per_project
GROUP BY 1, 2
ORDER BY 1, 2;


-- =====================================================================================
-- Q16. Folder activity over time (from commits): folder add/delete/update by actor type
-- =====================================================================================
SELECT
  date_trunc('month', fc."createdAt")::date AS month,
  fcc."changeType",
  fcc."isUpdate",
  fc."actorType",
  count(*) AS folder_changes
FROM analytics.folder_commit_changes fcc
JOIN analytics.folder_commits fc ON fc.id = fcc."folderCommitId"
WHERE fcc."folderVersionId" IS NOT NULL
  AND fc."createdAt" > now() - interval '12 months'
GROUP BY 1, 2, 3, 4
ORDER BY 1, 2, 3, 4;

-- Q16b. Folder creation per month (current folders only) and how many orgs created folders
SELECT
  date_trunc('month', f."createdAt")::date AS month,
  count(*) AS folders_created,
  count(DISTINCT p."orgId") AS orgs,
  count(DISTINCT p.id) AS projects
FROM analytics.secret_folders f
JOIN analytics.project_environments e ON e.id = f."envId" AND e."softDeletedAt" IS NULL
JOIN analytics.projects p ON p.id = e."projectId" AND p.type = 'secret-manager' AND p."softDeletedAt" IS NULL
WHERE f."parentId" IS NOT NULL
  AND NOT COALESCE(f."isReserved", false)
  AND f."createdAt" > now() - interval '24 months'
GROUP BY 1
ORDER BY 1;


-- =====================================================================================
-- Q17. Segment by org size: do bigger orgs structure more?
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id, p."orgId" AS org_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager' AND p."softDeletedAt" IS NULL AND e."softDeletedAt" IS NULL
),
tree AS (
  SELECT f.id, f."envId", 0 AS depth
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  WHERE f."parentId" IS NULL
  UNION ALL
  SELECT c.id, c."envId", t.depth + 1
  FROM analytics.secret_folders c JOIN tree t ON c."parentId" = t.id
  WHERE NOT COALESCE(c."isReserved", false)
),
org_users AS (
  SELECT m."scopeOrgId" AS org_id, count(*) AS users
  FROM analytics.memberships m
  WHERE m.scope = 'organization' AND m."actorUserId" IS NOT NULL AND m."isActive"
  GROUP BY m."scopeOrgId"
),
org_identities AS (
  SELECT m."scopeOrgId" AS org_id, count(*) AS identities
  FROM analytics.memberships m
  WHERE m.scope = 'organization' AND m."actorIdentityId" IS NOT NULL
  GROUP BY m."scopeOrgId"
),
per_project AS (
  SELECT e.org_id, e.project_id,
         count(*) FILTER (WHERE t.depth > 0) AS folders,
         max(t.depth) AS max_depth
  FROM tree t JOIN sm_envs e ON e.env_id = t."envId"
  GROUP BY e.org_id, e.project_id
)
SELECT
  CASE
    WHEN COALESCE(u.users, 0) <= 1 THEN '1 solo'
    WHEN u.users <= 5 THEN '2 2-5 users'
    WHEN u.users <= 20 THEN '3 6-20 users'
    WHEN u.users <= 100 THEN '4 21-100 users'
    WHEN u.users <= 500 THEN '5 101-500 users'
    ELSE '6 500+ users'
  END AS org_size,
  count(DISTINCT pp.org_id) AS orgs,
  count(*) AS projects,
  round(100.0 * count(*) FILTER (WHERE folders > 0) / count(*), 1) AS pct_projects_with_folders,
  round(avg(folders), 1) AS avg_folders_per_project,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY folders) FILTER (WHERE folders > 0) AS p50_folders_when_used,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY max_depth) FILTER (WHERE folders > 0) AS p50_depth_when_used,
  round(avg(COALESCE(i.identities, 0)), 1) AS avg_org_machine_identities
FROM per_project pp
LEFT JOIN org_users u ON u.org_id = pp.org_id
LEFT JOIN org_identities i ON i.org_id = pp.org_id
GROUP BY 1
ORDER BY 1;
