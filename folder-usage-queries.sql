-- Secrets Management folder usage analysis (Infisical Cloud)
--
-- Every query is self-contained and returns aggregates only (no org, project, or user
-- identifiers), so the results are safe to paste back.
--
-- Scope used everywhere:
--   * projects.type = 'secret-manager' (the analytics copy has no soft-delete columns, so
--     projects and environments pending deletion are counted too)
--   * "user folder" = any folder except the root (parentId IS NULL) and replication
--     reserved folders (isReserved = true)
--   * "secret" = secrets_v2 row with type = 'shared' (personal overrides excluded)
--
-- If you want to drop internal/test orgs, add a filter to the sm_envs CTE in each query,
-- e.g. AND p."orgId" NOT IN (...).
--
-- Every table is read from the analytics schema (analytics.<table>).
--
-- Performance: the analytics tables may have no indexes, so the queries avoid per-row
-- lookups and only walk the folder tree recursively where depth or full paths are needed
-- (Q2b, Q3, Q8, Q11, Q17). Those are the heaviest; if they still time out, raise the limit
-- for the session with SET statement_timeout = '15min'; if your client allows it.
--
-- Not in the analytics schema, so not covered: project_folder_grants, approval_policies,
-- approval_policy_secret_environments, access_approval_policies, secret_references_v2,
-- secret_v2_tag_junction, folder_commits, folder_commit_changes, and the columns
-- secret_syncs.includeAllSubFolders, additional_privileges.folderId / permissions.
-- Q14 and Q16 are removed for that reason; Q10, Q12, Q13 and Q15 are narrowed.


-- =====================================================================================
-- Q1. Overview: adoption of folders
-- =====================================================================================
WITH
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id, p."orgId" AS org_id, p.version AS project_version
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
),
folders AS (
  SELECT f.id, e.env_id, e.project_id, e.org_id, e.project_version,
         f."parentId" IS NULL AS is_root, COALESCE(f."isReserved", false) AS reserved
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
),
secret_counts AS (
  SELECT s."folderId", count(*) AS n FROM analytics.secrets_v2 s WHERE s.type = 'shared' GROUP BY s."folderId"
)
SELECT
  count(DISTINCT f.org_id)                                                        AS orgs,
  count(DISTINCT f.project_id)                                                    AS projects,
  count(DISTINCT f.project_id) FILTER (WHERE f.project_version = 3)               AS projects_v3,
  count(DISTINCT f.env_id)                                                        AS environments,
  count(*) FILTER (WHERE NOT f.is_root AND NOT f.reserved)                        AS user_folders,
  count(*) FILTER (WHERE f.reserved)                                              AS replication_reserved_folders,
  count(DISTINCT f.org_id) FILTER (WHERE NOT f.is_root AND NOT f.reserved)        AS orgs_using_folders,
  count(DISTINCT f.project_id) FILTER (WHERE NOT f.is_root AND NOT f.reserved)    AS projects_using_folders,
  round(100.0 * count(DISTINCT f.project_id) FILTER (WHERE NOT f.is_root AND NOT f.reserved)
        / NULLIF(count(DISTINCT f.project_id), 0), 2)                             AS pct_projects_using_folders,
  sum(COALESCE(sc.n, 0))                                                          AS total_secrets,
  sum(COALESCE(sc.n, 0)) FILTER (WHERE f.is_root)                                 AS secrets_in_root,
  sum(COALESCE(sc.n, 0)) FILTER (WHERE NOT f.is_root AND NOT f.reserved)          AS secrets_in_user_folders,
  round(100.0 * sum(COALESCE(sc.n, 0)) FILTER (WHERE NOT f.is_root AND NOT f.reserved)
        / NULLIF(sum(COALESCE(sc.n, 0)), 0), 2)                                   AS pct_secrets_in_folders
FROM folders f
LEFT JOIN secret_counts sc ON sc."folderId" = f.id;


-- =====================================================================================
-- Q2. Folders per project: histogram (all projects, including 0)
-- =====================================================================================
WITH
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
),
per_project AS (
  SELECT e.project_id,
         count(*) FILTER (WHERE f."parentId" IS NOT NULL AND NOT COALESCE(f."isReserved", false)) AS folders,
         count(DISTINCT e.env_id) AS envs
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
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


-- =====================================================================================
-- Q2b. Folder count and tree depth percentiles among projects that use folders (recursive)
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
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
         count(*) FILTER (WHERE t.depth > 0) AS folders,
         max(t.depth) AS max_depth
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
-- Q3. Depth: how deep are trees, and where do secrets live (recursive)
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id, p."orgId" AS org_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
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
secret_counts AS (
  SELECT s."folderId", count(*) AS n FROM analytics.secrets_v2 s WHERE s.type = 'shared' GROUP BY s."folderId"
)
SELECT
  t.depth,
  count(*)                                      AS folders,
  count(DISTINCT e.project_id)                  AS projects,
  count(DISTINCT e.org_id)                      AS orgs,
  sum(COALESCE(sc.n, 0))                        AS secrets,
  round(avg(COALESCE(sc.n, 0)), 2)              AS avg_secrets_per_folder,
  count(*) FILTER (WHERE COALESCE(sc.n, 0) = 0) AS folders_without_secrets
FROM tree t
JOIN sm_envs e ON e.env_id = t."envId"
LEFT JOIN secret_counts sc ON sc."folderId" = t.id
GROUP BY t.depth
ORDER BY t.depth;


-- =====================================================================================
-- Q4. Breadth: how many child folders does a folder have
-- =====================================================================================
WITH
sm_envs AS (
  SELECT e.id AS env_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
),
child_counts AS (
  SELECT c."parentId" AS id, count(*) AS n_children
  FROM analytics.secret_folders c
  WHERE c."parentId" IS NOT NULL AND NOT COALESCE(c."isReserved", false)
  GROUP BY c."parentId"
)
SELECT
  CASE WHEN f."parentId" IS NULL THEN 'root' ELSE 'subfolder' END AS folder_kind,
  count(*) AS folders_with_children,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY cc.n_children) AS p50_children,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY cc.n_children) AS p90_children,
  percentile_cont(0.99) WITHIN GROUP (ORDER BY cc.n_children) AS p99_children,
  max(cc.n_children) AS max_children
FROM analytics.secret_folders f
JOIN sm_envs e ON e.env_id = f."envId"
JOIN child_counts cc ON cc.id = f.id
GROUP BY 1;


-- =====================================================================================
-- Q5. What folders are used for: classify every user folder by its contents
-- =====================================================================================
WITH
sm_envs AS (
  SELECT e.id AS env_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
),
secret_counts AS (
  SELECT s."folderId" AS id, count(*) AS n FROM analytics.secrets_v2 s WHERE s.type = 'shared' GROUP BY 1
),
child_counts AS (
  SELECT c."parentId" AS id, count(*) AS n FROM analytics.secret_folders c
  WHERE c."parentId" IS NOT NULL AND NOT COALESCE(c."isReserved", false) GROUP BY 1
),
import_counts AS (
  SELECT i."folderId" AS id, count(*) AS n FROM analytics.secret_imports i
  WHERE NOT COALESCE(i."isReserved", false) GROUP BY 1
),
dynamic_counts AS (
  SELECT d."folderId" AS id, count(*) AS n FROM analytics.dynamic_secrets d GROUP BY 1
),
rotation_counts AS (
  SELECT r."folderId" AS id, count(*) AS n FROM analytics.secret_rotations_v2 r GROUP BY 1
),
contents AS (
  SELECT
    COALESCE(sc.n, 0) AS secrets,
    COALESCE(cc.n, 0) AS children,
    COALESCE(ic.n, 0) AS imports,
    COALESCE(dc.n, 0) AS dynamic_secrets,
    COALESCE(rc.n, 0) AS rotations
  FROM analytics.secret_folders f
  JOIN sm_envs e ON e.env_id = f."envId"
  LEFT JOIN secret_counts sc ON sc.id = f.id
  LEFT JOIN child_counts cc ON cc.id = f.id
  LEFT JOIN import_counts ic ON ic.id = f.id
  LEFT JOIN dynamic_counts dc ON dc.id = f.id
  LEFT JOIN rotation_counts rc ON rc.id = f.id
  WHERE f."parentId" IS NOT NULL AND NOT COALESCE(f."isReserved", false)
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


-- =====================================================================================
-- Q5b. Secrets per folder histogram (folders that hold at least one secret)
-- =====================================================================================
WITH
sm_envs AS (
  SELECT e.id AS env_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
),
secret_counts AS (
  SELECT s."folderId" AS id, count(*) AS n FROM analytics.secrets_v2 s WHERE s.type = 'shared' GROUP BY 1
)
SELECT
  CASE WHEN f."parentId" IS NULL THEN 'root' ELSE 'subfolder' END AS folder_kind,
  CASE
    WHEN sc.n = 1 THEN '1'
    WHEN sc.n <= 5 THEN '2-5'
    WHEN sc.n <= 10 THEN '6-10'
    WHEN sc.n <= 25 THEN '11-25'
    WHEN sc.n <= 50 THEN '26-50'
    WHEN sc.n <= 100 THEN '51-100'
    WHEN sc.n <= 500 THEN '101-500'
    ELSE '500+'
  END AS secrets_bucket,
  count(*) AS folders
FROM analytics.secret_folders f
JOIN sm_envs e ON e.env_id = f."envId"
JOIN secret_counts sc ON sc.id = f.id
WHERE NOT COALESCE(f."isReserved", false)
GROUP BY 1, 2
ORDER BY 1, min(sc.n);


-- =====================================================================================
-- Q6. Per project: how much of the project's secrets live outside root
-- =====================================================================================
WITH
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
),
secret_counts AS (
  SELECT s."folderId" AS id, count(*) AS n FROM analytics.secrets_v2 s WHERE s.type = 'shared' GROUP BY 1
),
per_project AS (
  SELECT e.project_id,
         sum(sc.n) AS secrets,
         COALESCE(sum(sc.n) FILTER (WHERE f."parentId" IS NOT NULL), 0) AS in_folders
  FROM analytics.secret_folders f
  JOIN sm_envs e ON e.env_id = f."envId"
  JOIN secret_counts sc ON sc.id = f.id
  WHERE NOT COALESCE(f."isReserved", false)
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
WITH
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id, p."orgId" AS org_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
),
roots AS (
  SELECT f.id FROM analytics.secret_folders f WHERE f."parentId" IS NULL
)
SELECT
  lower(f.name)                  AS folder_name,
  count(*)                       AS folders,
  count(DISTINCT e.project_id)   AS projects,
  count(DISTINCT e.org_id)       AS orgs,
  round(100.0 * count(r.id) / count(*), 1) AS pct_top_level
FROM analytics.secret_folders f
JOIN sm_envs e ON e.env_id = f."envId"
LEFT JOIN roots r ON r.id = f."parentId"
WHERE f."parentId" IS NOT NULL AND NOT COALESCE(f."isReserved", false)
GROUP BY lower(f.name)
HAVING count(DISTINCT e.org_id) >= 10
ORDER BY orgs DESC
LIMIT 150;


-- =====================================================================================
-- Q7b. Naming conventions
-- =====================================================================================
WITH
sm_envs AS (
  SELECT e.id AS env_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
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
FROM analytics.secret_folders f
JOIN sm_envs e ON e.env_id = f."envId"
WHERE f."parentId" IS NOT NULL AND NOT COALESCE(f."isReserved", false)
GROUP BY 1
ORDER BY folders DESC;


-- =====================================================================================
-- Q7c. Semantic category of top-level folder names (what the first level of the tree models)
-- =====================================================================================
WITH
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
),
lvl1 AS (
  SELECT lower(c.name) AS name, e.project_id
  FROM analytics.secret_folders r
  JOIN sm_envs e ON e.env_id = r."envId"
  JOIN analytics.secret_folders c ON c."parentId" = r.id AND NOT COALESCE(c."isReserved", false)
  WHERE r."parentId" IS NULL
),
project_env_names AS (
  SELECT DISTINCT project_id, name FROM (
    SELECT e."projectId" AS project_id, lower(e.slug) AS name FROM analytics.project_environments e
    UNION ALL
    SELECT e."projectId", lower(e.name) FROM analytics.project_environments e
  ) x
)
SELECT
  CASE
    WHEN pen.name IS NOT NULL
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
  count(DISTINCT l.project_id) AS projects
FROM lvl1 l
LEFT JOIN project_env_names pen ON pen.project_id = l.project_id AND pen.name = l.name
GROUP BY 1
ORDER BY folders DESC;


-- =====================================================================================
-- Q8. Structure parity across environments: do all envs have the same tree? (recursive)
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
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
WITH
sm_envs AS (
  SELECT e.id AS env_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
)
SELECT
  count(*)                                                                      AS user_folders,
  count(*) FILTER (WHERE NULLIF(trim(f.description), '') IS NOT NULL)           AS with_description,
  count(*) FILTER (WHERE COALESCE(f.version, 1) > 1)                            AS updated_at_least_once,
  count(*) FILTER (WHERE f."createdAt" > now() - interval '90 days')            AS created_last_90d,
  count(*) FILTER (WHERE f."lastSecretModified" IS NULL)                        AS secrets_never_modified,
  count(*) FILTER (WHERE f."lastSecretModified" > now() - interval '7 days')    AS modified_last_7d,
  count(*) FILTER (WHERE f."lastSecretModified" > now() - interval '30 days')   AS modified_last_30d,
  count(*) FILTER (WHERE f."lastSecretModified" > now() - interval '90 days')   AS modified_last_90d,
  count(*) FILTER (WHERE f."lastSecretModified" < now() - interval '365 days')  AS stale_over_1y
FROM analytics.secret_folders f
JOIN sm_envs e ON e.env_id = f."envId"
WHERE f."parentId" IS NOT NULL AND NOT COALESCE(f."isReserved", false);


-- =====================================================================================
-- Q10. Which features attach to folders rather than root
-- =====================================================================================
WITH
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
),
folders AS (
  SELECT f.id, e.project_id, f."parentId" IS NULL AS is_root, p."parentId" IS NULL AS parent_is_root
  FROM analytics.secret_folders f
  JOIN sm_envs e ON e.env_id = f."envId"
  LEFT JOIN analytics.secret_folders p ON p.id = f."parentId"
  WHERE NOT COALESCE(f."isReserved", false)
),
attached AS (
  SELECT 'secret_sync' AS feature, s."folderId" AS folder_id FROM analytics.secret_syncs s WHERE s."folderId" IS NOT NULL
  UNION ALL
  SELECT 'dynamic_secret', d."folderId" FROM analytics.dynamic_secrets d
  UNION ALL
  SELECT 'secret_rotation_v2', r."folderId" FROM analytics.secret_rotations_v2 r
  UNION ALL
  SELECT 'secret_import (destination)', i."folderId" FROM analytics.secret_imports i WHERE NOT COALESCE(i."isReserved", false)
  UNION ALL
  SELECT 'secret_import (replication)', i."folderId" FROM analytics.secret_imports i WHERE i."isReplication"
)
SELECT
  a.feature,
  count(*)                                                       AS total,
  count(*) FILTER (WHERE f.is_root)                              AS at_root,
  count(*) FILTER (WHERE NOT f.is_root AND f.parent_is_root)     AS in_top_level_folder,
  count(*) FILTER (WHERE NOT f.is_root AND NOT f.parent_is_root) AS in_nested_folder,
  round(100.0 * count(*) FILTER (WHERE NOT f.is_root) / NULLIF(count(*), 0), 1) AS pct_in_folders,
  count(DISTINCT f.project_id)                                   AS projects,
  count(DISTINCT f.project_id) FILTER (WHERE NOT f.is_root)      AS projects_using_in_folders
FROM attached a
JOIN folders f ON f.id = a.folder_id
GROUP BY a.feature
ORDER BY total DESC;


-- =====================================================================================
-- Q11. Secret imports: how folders are composed from each other (recursive)
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
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
importing_folders AS (
  SELECT DISTINCT i."folderId" AS id FROM analytics.secret_imports i
),
imports AS (
  SELECT i."importPath", i."importEnv", i."isReplication", i."isReplicationSuccess",
         dst.depth AS dst_depth, dst."envId" AS dst_env, de.project_id AS dst_project,
         se.project_id AS src_project, src.id AS src_folder_id, chained.id AS chained_id
  FROM analytics.secret_imports i
  JOIN tree dst ON dst.id = i."folderId"
  JOIN sm_envs de ON de.env_id = dst."envId"
  LEFT JOIN sm_envs se ON se.env_id = i."importEnv"
  LEFT JOIN tree src ON src."envId" = i."importEnv"
                     AND src.path = COALESCE(NULLIF(rtrim(i."importPath", '/'), ''), '/')
  LEFT JOIN importing_folders chained ON chained.id = src.id
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
  count(*) FILTER (WHERE chained_id IS NOT NULL)                              AS source_itself_imports_chained
FROM imports;


-- =====================================================================================
-- Q11b. Imports per destination folder
-- =====================================================================================
SELECT
  CASE WHEN n = 1 THEN '1' WHEN n <= 3 THEN '2-3' WHEN n <= 5 THEN '4-5'
       WHEN n <= 10 THEN '6-10' WHEN n <= 25 THEN '11-25' ELSE '25+' END AS imports_per_folder,
  count(*) AS folders
FROM (
  SELECT i."folderId", count(*) AS n
  FROM analytics.secret_imports i
  JOIN analytics.secret_folders f ON f.id = i."folderId"
  JOIN analytics.project_environments e ON e.id = f."envId"
  JOIN analytics.projects p ON p.id = e."projectId" AND p.type = 'secret-manager'
  WHERE NOT COALESCE(i."isReserved", false)
  GROUP BY i."folderId"
) x
GROUP BY 1
ORDER BY min(n);


-- =====================================================================================
-- Q12. Secret approval policies scoped by folder path (legacy table only)
-- =====================================================================================
-- Only the legacy secret_approval_policies table is in the analytics schema. New policies
-- live in approval_policies, which is not, so this undercounts current policy usage.
SELECT
  CASE
    WHEN sap."secretPath" IN ('/', '') THEN 'root only'
    WHEN sap."secretPath" IN ('/**', '/*', '**', '*') THEN 'whole env glob'
    WHEN sap."secretPath" ~ '[*?{]' THEN 'subtree / glob pattern'
    ELSE 'exact folder path'
  END AS path_kind,
  count(*) AS policies,
  count(DISTINCT e."projectId") AS projects,
  round(avg(array_length(string_to_array(NULLIF(trim(both '/' from sap."secretPath"), ''), '/'), 1)), 2) AS avg_path_segments
FROM analytics.secret_approval_policies sap
JOIN analytics.project_environments e ON e.id = sap."envId"
JOIN analytics.projects p ON p.id = e."projectId" AND p.type = 'secret-manager'
WHERE sap."deletedAt" IS NULL
GROUP BY 1
ORDER BY policies DESC;


-- =====================================================================================
-- Q13. Folder-path conditions in custom project roles
-- =====================================================================================
WITH perms AS (
  SELECT r."projectId" AS project_id, r.permissions::text AS p
  FROM analytics.roles r JOIN analytics.projects pr ON pr.id = r."projectId" AND pr.type = 'secret-manager'
)
SELECT
  count(*)                                                           AS custom_project_roles,
  count(*) FILTER (WHERE p LIKE '%secretPath%')                      AS uses_secret_path_condition,
  count(*) FILTER (WHERE p LIKE '%secretPath%' AND p LIKE '%$glob%') AS secret_path_glob,
  count(*) FILTER (WHERE p LIKE '%secretPath%' AND p LIKE '%$eq%')   AS secret_path_eq,
  count(*) FILTER (WHERE p LIKE '%secretPath%' AND p LIKE '%$in%')   AS secret_path_in,
  count(*) FILTER (WHERE p LIKE '%secret-folders%')                  AS has_folder_subject_rule,
  count(DISTINCT project_id) FILTER (WHERE p LIKE '%secretPath%')    AS projects_with_path_scoped_access
FROM perms;


-- =====================================================================================
-- Q15. Folders vs tags: are they alternatives or used together?
--      (tag assignments are not in the analytics schema, so this checks whether the project
--      has defined any tags, not whether secrets carry them)
-- =====================================================================================
WITH
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
),
projects_with_tags AS (
  SELECT DISTINCT st."projectId" AS project_id FROM analytics.secret_tags st
),
per_project AS (
  SELECT e.project_id,
         bool_or(f."parentId" IS NOT NULL AND NOT COALESCE(f."isReserved", false)) AS uses_folders
  FROM analytics.secret_folders f JOIN sm_envs e ON e.env_id = f."envId"
  GROUP BY e.project_id
)
SELECT pp.uses_folders, pt.project_id IS NOT NULL AS has_tags_defined, count(*) AS projects
FROM per_project pp
LEFT JOIN projects_with_tags pt ON pt.project_id = pp.project_id
GROUP BY 1, 2
ORDER BY 1, 2;


-- =====================================================================================
-- Q16b. Folder creation per month (current folders only) and how many orgs created folders
-- =====================================================================================
SELECT
  date_trunc('month', f."createdAt")::date AS month,
  count(*) AS folders_created,
  count(DISTINCT p."orgId") AS orgs,
  count(DISTINCT p.id) AS projects
FROM analytics.secret_folders f
JOIN analytics.project_environments e ON e.id = f."envId"
JOIN analytics.projects p ON p.id = e."projectId" AND p.type = 'secret-manager'
WHERE f."parentId" IS NOT NULL
  AND NOT COALESCE(f."isReserved", false)
  AND f."createdAt" > now() - interval '24 months'
GROUP BY 1
ORDER BY 1;


-- =====================================================================================
-- Q17. Segment by org size: do bigger orgs structure more? (recursive)
-- =====================================================================================
WITH RECURSIVE
sm_envs AS (
  SELECT e.id AS env_id, e."projectId" AS project_id, p."orgId" AS org_id
  FROM analytics.project_environments e
  JOIN analytics.projects p ON p.id = e."projectId"
  WHERE p.type = 'secret-manager'
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
