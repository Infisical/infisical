import { Knex } from "knex";

import { SecretScanningFindingStatus } from "@app/ee/services/secret-scanning-v2/secret-scanning-v2-enums";
import { PgSqlLock } from "@app/keystore/keystore";

import { TableName } from "../schemas";

const FINDING = TableName.SecretScanningFinding;
const LOCATION = TableName.SecretScanningFindingLocation;
const RESOURCE = TableName.SecretScanningResource;
const DATA_SOURCE = TableName.SecretScanningDataSource;

const BATCH_LOCATIONS = 20_000;
const STATEMENT_TIMEOUT_MS = 10 * 60 * 1000;

const STATUS_PRECEDENCE = [
  SecretScanningFindingStatus.Unresolved,
  SecretScanningFindingStatus.Resolved,
  SecretScanningFindingStatus.Ignore,
  SecretScanningFindingStatus.FalsePositive
];

const STATUS_LABEL: Record<string, string> = {
  [SecretScanningFindingStatus.Unresolved]: "unresolved",
  [SecretScanningFindingStatus.Resolved]: "resolved",
  [SecretScanningFindingStatus.Ignore]: "ignored",
  [SecretScanningFindingStatus.FalsePositive]: "false positive"
};

type TValue = { projectId: string; blindIndex: string; locationCount: number; resourceIds: string[] };

type TFinding = {
  id: string;
  valueKey: string;
  status: SecretScanningFindingStatus;
  triagedAt: Date | null;
  triagedByUserId: string | null;
  triageComment: string | null;
  resolvedAt: Date | null;
  lastDetectedAt: Date;
  resourceName: string;
};

const lockAll = (tx: Knex, keys: number[]) =>
  tx.raw("SELECT pg_advisory_xact_lock(k) FROM unnest(?::bigint[]) AS k", [keys]);

const isSafer = (a: TFinding, b: TFinding) => {
  const rankA = STATUS_PRECEDENCE.indexOf(a.status);
  const rankB = STATUS_PRECEDENCE.indexOf(b.status);
  if (rankA !== rankB) return rankA < rankB;
  return (a.triagedAt?.getTime() ?? -Infinity) > (b.triagedAt?.getTime() ?? -Infinity);
};

// The findings come oldest first, and the oldest is kept.
const mergeValue = async (tx: Knex, findings: TFinding[]) => {
  const [winner, ...losers] = findings;
  const loserIds = losers.map(({ id }) => id);

  // A pull request check saved finding ids, so each merged-away finding's id lives on as the id of its oldest
  // location, which findings.findByIdsOrLocationIdsForUpdate resolves.
  for (const loser of losers) {
    /* eslint-disable no-await-in-loop */
    const isTaken = await tx(LOCATION).where({ id: loser.id }).first("id");
    if (!isTaken) {
      const oldest = await tx(LOCATION).where({ findingId: loser.id }).orderBy(["createdAt", "id"]).first("id");
      if (oldest) await tx(LOCATION).where({ id: oldest.id }).update("id", loser.id);
    }
    /* eslint-enable no-await-in-loop */
  }

  await tx(LOCATION).whereIn("findingId", loserIds).update({ findingId: winner.id });

  const verdict = findings.reduce((best, finding) => (isSafer(finding, best) ? finding : best));
  const notes = findings
    .filter((finding): finding is TFinding & { triagedAt: Date } => finding !== verdict && Boolean(finding.triagedAt))
    .sort((a, b) => a.triagedAt.getTime() - b.triagedAt.getTime())
    .map(
      ({ resourceName, status, triagedAt, triageComment }) =>
        `Merged from ${resourceName}: ${STATUS_LABEL[status]} on ${triagedAt.toISOString().slice(0, 10)}${
          triageComment ? `: ${triageComment}` : ""
        }`
    );

  await tx(FINDING)
    .where({ id: winner.id })
    .update({
      status: verdict.status,
      resolvedAt: verdict.resolvedAt,
      triagedAt: verdict.triagedAt,
      triagedByUserId: verdict.triagedByUserId,
      triageComment: [verdict.triageComment, notes.join("\n")].filter(Boolean).join("\n\n") || null,
      lastDetectedAt: new Date(Math.max(...findings.map(({ lastDetectedAt }) => lastDetectedAt.getTime())))
    });

  await tx(FINDING).whereIn("id", loserIds).delete();
};

const mergeBatch = async (tx: Knex, values: TValue[]) => {
  const resourceIds = [...new Set(values.flatMap((value) => value.resourceIds))].sort();
  const projectIds = [...new Set(values.map((value) => value.projectId))].sort();

  await tx.raw(`SET LOCAL statement_timeout = ${STATEMENT_TIMEOUT_MS}`);

  // Resources before projects, as scans take them. A scan of the previous release takes only its resource's lock, so
  // the batch merges only findings named after resources it locked.
  await lockAll(tx, resourceIds.map(PgSqlLock.SecretScanningFindingLocations));
  await lockAll(tx, projectIds.map(PgSqlLock.SecretScanningFindingValues));

  const findings: TFinding[] = await tx(`${FINDING} as f`)
    .join(`${RESOURCE} as r`, "r.id", "f.resourceId")
    .join(`${DATA_SOURCE} as ds`, "ds.id", "r.dataSourceId")
    .whereRaw(`(ds."projectId", f."secretFindingBlindIndex") IN (SELECT * FROM unnest(?::text[], ?::text[]))`, [
      values.map(({ projectId }) => projectId),
      values.map(({ blindIndex }) => blindIndex)
    ])
    .whereRaw(`f."resourceId" = ANY(?::uuid[])`, [resourceIds])
    .orderBy(["f.createdAt", "f.id"])
    .select(
      tx.raw(`ds."projectId" || ':' || f."secretFindingBlindIndex" AS "valueKey"`),
      "f.id",
      "f.status",
      "f.triagedAt",
      "f.triagedByUserId",
      "f.triageComment",
      "f.resolvedAt",
      "f.lastDetectedAt",
      "r.name as resourceName"
    );

  const findingsByValue = Map.groupBy(findings, ({ valueKey }) => valueKey);
  for (const valueFindings of findingsByValue.values()) {
    // eslint-disable-next-line no-await-in-loop
    if (valueFindings.length > 1) await mergeValue(tx, valueFindings);
  }
};

// One transaction per batch, so an interrupted run can start over.
export async function up(knex: Knex): Promise<void> {
  const values: TValue[] = await knex(`${FINDING} as f`)
    .join(`${RESOURCE} as r`, "r.id", "f.resourceId")
    .join(`${DATA_SOURCE} as ds`, "ds.id", "r.dataSourceId")
    .leftJoin(`${LOCATION} as l`, "l.findingId", "f.id")
    .whereNotNull("f.secretFindingBlindIndex")
    .groupBy("ds.projectId", "f.secretFindingBlindIndex")
    .havingRaw("count(DISTINCT f.id) > 1")
    .orderBy(["ds.projectId", "f.secretFindingBlindIndex"])
    .select(
      "ds.projectId",
      "f.secretFindingBlindIndex as blindIndex",
      knex.raw(`array_agg(DISTINCT f."resourceId"::text) AS "resourceIds"`),
      knex.raw(`count(l.id)::int AS "locationCount"`)
    );

  const batches: TValue[][] = [];
  let batchLocations = 0;
  for (const value of values) {
    if (!batches.length || batchLocations + value.locationCount > BATCH_LOCATIONS) {
      batches.push([]);
      batchLocations = 0;
    }
    batches[batches.length - 1].push(value);
    batchLocations += value.locationCount;
  }

  for (const batch of batches) {
    // eslint-disable-next-line no-await-in-loop
    await knex.transaction((tx) => mergeBatch(tx, batch));
  }
}

export async function down(knex: Knex): Promise<void> {
  await knex.transaction(async (tx) => {
    await tx.raw(
      `CREATE TEMPORARY TABLE finding_split ON COMMIT DROP AS
       SELECT DISTINCT ON (l."findingId", l."resourceId")
         l."findingId", l."resourceId", gen_random_uuid() AS "newId", l."scanId", l.fingerprint, l.details, l."createdAt"
       FROM ?? AS l
       JOIN ?? AS f ON f.id = l."findingId"
       WHERE l."resourceId" <> f."resourceId"
       ORDER BY l."findingId", l."resourceId", l."createdAt", l.id`,
      [LOCATION, FINDING]
    );

    await tx.raw(
      `INSERT INTO ?? (
         id, "resourceId", "scanId", fingerprint, details, rule, severity, confidence, status, "triageComment",
         "triagedByUserId", "triagedAt", "resolvedAt", "secretFindingBlindIndex", "createdAt", "lastDetectedAt"
       )
       SELECT s."newId", s."resourceId", s."scanId", s.fingerprint, s.details, f.rule, f.severity, f.confidence, f.status,
         f."triageComment", f."triagedByUserId", f."triagedAt", f."resolvedAt", f."secretFindingBlindIndex", s."createdAt",
         f."lastDetectedAt"
       FROM finding_split AS s
       JOIN ?? AS f ON f.id = s."findingId"`,
      [FINDING, FINDING]
    );

    await tx.raw(
      `UPDATE ?? AS l SET "findingId" = s."newId"
       FROM finding_split AS s
       WHERE l."findingId" = s."findingId" AND l."resourceId" = s."resourceId"`,
      [LOCATION]
    );
  });
}

const config = { transaction: false };
export { config };
