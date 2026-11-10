import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  SecretApprovalRequestsSecretsV2Schema,
  TableName,
  TApprovalRequests,
  TSecretChangeRequests,
  TSecretTags
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { ormify, selectAllTableCols, sqlNestRelationships } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";
import { ApprovalPolicyType } from "@app/services/approval-policy/approval-policy-enums";

import {
  RequestState,
  SecretApprovalRequestOrderBy,
  TSecretApprovalRequestListFilter
} from "./secret-change-request-types";

export type TSecretChangeRequestDALFactory = ReturnType<typeof secretChangeRequestDALFactory>;

export type TSecretChangeRequestListRow = TApprovalRequests &
  Pick<
    TSecretChangeRequests,
    | "folderId"
    | "slug"
    | "hasMerged"
    | "conflicts"
    | "commitMessage"
    | "bypassReason"
    | "isReplicated"
    | "statusChangedByUserId"
  > & {
    secretChangeId: string;
    environment: string;
    environmentName: string;
    requestFolderPath: string;
    policyName: string | null;
    policyEnforcementLevel: string | null;
    policyConstraints: unknown;
    policySecretPath: string | null;
    committerUserEmail: string | null;
    committerUserUsername: string | null;
    committerUserFirstName: string | null;
    committerUserLastName: string | null;
    committerIdentityName: string | null;
  };

const getOrderExpression = (orderBy = SecretApprovalRequestOrderBy.CreatedAt) => {
  switch (orderBy) {
    case SecretApprovalRequestOrderBy.Environment:
      return 'LOWER(COALESCE("environmentName", "environment", \'\'))';
    case SecretApprovalRequestOrderBy.SecretPath:
      return "LOWER(COALESCE(\"policySecretPath\", ''))";
    case SecretApprovalRequestOrderBy.Author:
      return `LOWER(COALESCE(
        NULLIF(TRIM(CONCAT_WS(' ', "committerUserFirstName", "committerUserLastName")), ''),
        "committerUserEmail",
        "committerIdentityName",
        ''
      ))`;
    case SecretApprovalRequestOrderBy.CreatedAt:
    default:
      return '"createdAt"';
  }
};

const applyRequestOrdering = (
  query: Knex.QueryBuilder,
  orderBy?: SecretApprovalRequestOrderBy,
  orderDirection = OrderByDirection.DESC
) => query.orderByRaw(`${getOrderExpression(orderBy)} ${orderDirection}`).orderBy("id", OrderByDirection.ASC);

export type TSecretChangeRequestListResultRows = { rows: TSecretChangeRequestListRow[]; totalCount: number };

// A user without the project-wide read permission sees the requests they opened and the ones they can approve,
// which on the global approval system is recorded per request step rather than on the policy.
const buildAccessFilter = (qb: Knex.QueryBuilder, dbInstance: Knex, userId?: string) => {
  if (!userId) return;
  void qb.andWhere((bd) => {
    void bd.where(`${TableName.ApprovalRequests}.requesterId`, userId).orWhereExists(
      dbInstance(TableName.ApprovalRequestSteps)
        .select(dbInstance.raw("1"))
        .join(
          TableName.ApprovalRequestStepEligibleApprovers,
          `${TableName.ApprovalRequestSteps}.id`,
          `${TableName.ApprovalRequestStepEligibleApprovers}.stepId`
        )
        .leftJoin(
          TableName.UserGroupMembership,
          `${TableName.ApprovalRequestStepEligibleApprovers}.groupId`,
          `${TableName.UserGroupMembership}.groupId`
        )
        .whereRaw("?? = ??", [`${TableName.ApprovalRequestSteps}.requestId`, `${TableName.ApprovalRequests}.id`])
        .andWhere((inner) => {
          void inner
            .where(`${TableName.ApprovalRequestStepEligibleApprovers}.userId`, userId)
            .orWhere(`${TableName.UserGroupMembership}.userId`, userId);
        })
    );
  });
};

const buildCoreQuery = (dbInstance: Knex, projectId: string) =>
  dbInstance(TableName.ApprovalRequests)
    .where(`${TableName.ApprovalRequests}.type`, ApprovalPolicyType.SecretChange)
    .where(`${TableName.ApprovalRequests}.projectId`, projectId)
    .join(
      TableName.SecretChangeRequests,
      `${TableName.SecretChangeRequests}.approvalRequestId`,
      `${TableName.ApprovalRequests}.id`
    )
    .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.SecretChangeRequests}.folderId`)
    .join(TableName.Environment, function joinActiveEnvForSecretFolder() {
      this.on(`${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`).andOnNull(
        `${TableName.Environment}.deleteAfter`
      );
    })
    .join(TableName.Project, `${TableName.Environment}.projectId`, `${TableName.Project}.id`)
    .whereNull(`${TableName.Project}.deleteAfter`);

export const secretChangeRequestDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.SecretChangeRequests);
  const commitOrm = ormify(db, TableName.SecretApprovalRequestSecretV2);
  const commitTagOrm = ormify(db, TableName.SecretApprovalRequestSecretTagV2);

  const queryBridgeSecretV2 = (tx?: Knex) =>
    (tx || db.replicaNode())({
      secVerTag: TableName.SecretTag
    })
      .from(TableName.SecretApprovalRequestSecretV2)
      .leftJoin(
        TableName.SecretApprovalRequestSecretTagV2,
        `${TableName.SecretApprovalRequestSecretV2}.id`,
        `${TableName.SecretApprovalRequestSecretTagV2}.secretId`
      )
      .leftJoin(TableName.SecretTag, `${TableName.SecretApprovalRequestSecretTagV2}.tagId`, `${TableName.SecretTag}.id`)
      .leftJoin(TableName.SecretV2, `${TableName.SecretApprovalRequestSecretV2}.secretId`, `${TableName.SecretV2}.id`)
      .leftJoin(
        TableName.SecretVersionV2,
        `${TableName.SecretVersionV2}.id`,
        `${TableName.SecretApprovalRequestSecretV2}.secretVersion`
      )
      .leftJoin(
        TableName.SecretVersionV2Tag,
        `${TableName.SecretVersionV2Tag}.${TableName.SecretVersionV2}Id`,
        `${TableName.SecretVersionV2}.id`
      )
      .leftJoin<TSecretTags>(
        db.ref(TableName.SecretTag).as("secVerTag"),
        `${TableName.SecretVersionV2Tag}.${TableName.SecretTag}Id`,
        db.ref("id").withSchema("secVerTag")
      )
      .leftJoin(TableName.ResourceMetadata, `${TableName.SecretV2}.id`, `${TableName.ResourceMetadata}.secretId`)
      .leftJoin(
        TableName.SecretRotationV2SecretMapping,
        `${TableName.SecretV2}.id`,
        `${TableName.SecretRotationV2SecretMapping}.secretId`
      )
      .select(selectAllTableCols(TableName.SecretApprovalRequestSecretV2))
      .select({
        secVerTagId: "secVerTag.id",
        secVerTagColor: "secVerTag.color",
        secVerTagSlug: "secVerTag.slug"
      })
      .select(
        db.ref("id").withSchema(TableName.SecretTag).as("tagId"),
        db.ref("id").withSchema(TableName.SecretApprovalRequestSecretTagV2).as("tagJnId"),
        db.ref("color").withSchema(TableName.SecretTag).as("tagColor"),
        db.ref("slug").withSchema(TableName.SecretTag).as("tagSlug")
      )
      .select(
        db.ref("version").withSchema(TableName.SecretV2).as("orgSecVersion"),
        db.ref("key").withSchema(TableName.SecretV2).as("orgSecKey"),
        db.ref("encryptedValue").withSchema(TableName.SecretV2).as("orgSecValue"),
        db.ref("encryptedComment").withSchema(TableName.SecretV2).as("orgSecComment")
      )
      .select(
        db.ref("version").withSchema(TableName.SecretVersionV2).as("secVerVersion"),
        db.ref("key").withSchema(TableName.SecretVersionV2).as("secVerKey"),
        db.ref("encryptedValue").withSchema(TableName.SecretVersionV2).as("secVerValue"),
        db.ref("encryptedComment").withSchema(TableName.SecretVersionV2).as("secVerComment"),
        db.ref("skipMultilineEncoding").withSchema(TableName.SecretVersionV2).as("secVerSkipMultilineEncoding")
      )
      .select(
        db.ref("id").withSchema(TableName.ResourceMetadata).as("metadataId"),
        db.ref("key").withSchema(TableName.ResourceMetadata).as("metadataKey"),
        db.ref("value").withSchema(TableName.ResourceMetadata).as("metadataValue"),
        db.ref("encryptedValue").withSchema(TableName.ResourceMetadata).as("metadataEncryptedValue")
      )
      .select(db.ref("rotationId").withSchema(TableName.SecretRotationV2SecretMapping));

  const formatBridgeSecretV2 = (doc: Awaited<ReturnType<typeof queryBridgeSecretV2>>) => {
    const formatedDoc = sqlNestRelationships({
      data: doc,
      key: "id",
      parentMapper: (data) => SecretApprovalRequestsSecretsV2Schema.omit({ secretVersion: true }).parse(data),
      childrenMapper: [
        {
          key: "tagJnId",
          label: "tags" as const,
          mapper: ({ tagId: id, tagSlug: slug, tagColor: color }) => ({
            id,
            name: slug,
            slug,
            color
          })
        },
        {
          key: "secretId",
          label: "secret" as const,
          mapper: ({ orgSecVersion, orgSecKey, orgSecValue, orgSecComment, secretId, rotationId }) =>
            secretId
              ? {
                  id: secretId,
                  version: orgSecVersion,
                  key: orgSecKey,
                  encryptedValue: orgSecValue,
                  encryptedComment: orgSecComment,
                  isRotatedSecret: Boolean(rotationId),
                  rotationId
                }
              : undefined
        },
        {
          key: "secretVersion",
          label: "secretVersion" as const,
          mapper: ({
            secretVersion,
            secVerVersion,
            secVerKey,
            secVerValue,
            secVerComment,
            secVerSkipMultilineEncoding
          }) =>
            secretVersion
              ? {
                  version: secVerVersion,
                  id: secretVersion,
                  key: secVerKey,
                  encryptedValue: secVerValue,
                  encryptedComment: secVerComment,
                  skipMultilineEncoding: secVerSkipMultilineEncoding
                }
              : undefined,
          childrenMapper: [
            {
              key: "secVerTagId",
              label: "tags" as const,
              mapper: ({ secVerTagId: id, secVerTagSlug: slug, secVerTagColor: color }) => ({
                // eslint-disable-next-line
                id,
                // eslint-disable-next-line
                name: slug,
                // eslint-disable-next-line
                slug,
                // eslint-disable-next-line
                color
              })
            }
          ]
        },
        {
          key: "metadataId",
          label: "oldSecretMetadata" as const,
          mapper: ({ metadataKey, metadataEncryptedValue, metadataValue, metadataId }) => ({
            id: metadataId,
            key: metadataKey,
            value: metadataValue,
            encryptedValue: metadataEncryptedValue
          })
        }
      ]
    });

    return formatedDoc?.map(({ secret, secretVersion, ...el }) => ({
      ...el,
      secret: secret?.[0],
      secretVersion: secretVersion?.[0]
    }));
  };

  const findBySecretChangeIdBridgeSecretV2 = async (secretChangeId: string, tx?: Knex) => {
    try {
      const doc = await queryBridgeSecretV2(tx).where(
        `${TableName.SecretApprovalRequestSecretV2}.secretChangeId`,
        secretChangeId
      );
      return formatBridgeSecretV2(doc);
    } catch (error) {
      throw new DatabaseError({ error, name: "FindBySecretChangeIdBridgeSecretV2" });
    }
  };

  const findCommitsBySecretChangeIds = async (secretChangeIds: string[], tx?: Knex) => {
    if (!secretChangeIds.length) return [];
    const rows = await commitOrm.find({ $in: { secretChangeId: secretChangeIds } }, { tx });
    return rows.map(({ id, op, secretId, secretChangeId }) => ({
      id,
      op,
      secretId: secretId ?? null,
      secretChangeId: secretChangeId as string
    }));
  };

  const findByProjectId = async (
    {
      projectId,
      userId,
      status,
      environment,
      committer,
      limit = 20,
      offset = 0,
      search,
      orderBy,
      orderDirection
    }: TSecretApprovalRequestListFilter,
    tx?: Knex
  ): Promise<TSecretChangeRequestListResultRows> => {
    try {
      const dbInstance = tx || db.replicaNode();
      const innerQuery = buildCoreQuery(dbInstance, projectId)
        .leftJoin(
          TableName.ApprovalPolicies,
          `${TableName.ApprovalPolicies}.id`,
          `${TableName.ApprovalRequests}.policyId`
        )
        .leftJoin(TableName.ApprovalPolicySecretEnvironment, function joinPolicyEnvironment() {
          this.on(`${TableName.ApprovalPolicySecretEnvironment}.policyId`, `${TableName.ApprovalPolicies}.id`).andOn(
            `${TableName.ApprovalPolicySecretEnvironment}.envId`,
            `${TableName.SecretFolder}.envId`
          );
        })
        .leftJoin(
          db(TableName.Users).as("committerUser"),
          `${TableName.ApprovalRequests}.requesterId`,
          "committerUser.id"
        )
        .leftJoin(
          db(TableName.Identity).as("committerIdentity"),
          `${TableName.ApprovalRequests}.machineIdentityId`,
          "committerIdentity.id"
        )
        .where((qb) => {
          if (environment) void qb.where(`${TableName.Environment}.slug`, environment);
          if (status) void qb.where(`${TableName.ApprovalRequests}.status`, status);
          if (committer) void qb.where(`${TableName.ApprovalRequests}.requesterId`, committer);
        })
        .modify((qb) => buildAccessFilter(qb, dbInstance, userId))
        .select(selectAllTableCols(TableName.ApprovalRequests))
        .select(
          db.ref("id").withSchema(TableName.SecretChangeRequests).as("secretChangeId"),
          db.ref("folderId").withSchema(TableName.SecretChangeRequests),
          db.ref("slug").withSchema(TableName.SecretChangeRequests),
          db.ref("hasMerged").withSchema(TableName.SecretChangeRequests),
          db.ref("conflicts").withSchema(TableName.SecretChangeRequests),
          db.ref("commitMessage").withSchema(TableName.SecretChangeRequests),
          db.ref("bypassReason").withSchema(TableName.SecretChangeRequests),
          db.ref("isReplicated").withSchema(TableName.SecretChangeRequests),
          db.ref("statusChangedByUserId").withSchema(TableName.SecretChangeRequests),
          db.ref("slug").withSchema(TableName.Environment).as("environment"),
          db.ref("name").withSchema(TableName.Environment).as("environmentName"),
          db.ref("name").withSchema(TableName.SecretFolder).as("requestFolderPath"),
          db.ref("name").withSchema(TableName.ApprovalPolicies).as("policyName"),
          db.ref("enforcementLevel").withSchema(TableName.ApprovalPolicies).as("policyEnforcementLevel"),
          db.ref("constraints").withSchema(TableName.ApprovalPolicies).as("policyConstraints"),
          db.ref("secretPath").withSchema(TableName.ApprovalPolicySecretEnvironment).as("policySecretPath"),
          db.ref("email").withSchema("committerUser").as("committerUserEmail"),
          db.ref("username").withSchema("committerUser").as("committerUserUsername"),
          db.ref("firstName").withSchema("committerUser").as("committerUserFirstName"),
          db.ref("lastName").withSchema("committerUser").as("committerUserLastName"),
          db.ref("name").withSchema("committerIdentity").as("committerIdentityName")
        )
        .as("inner");

      const baseQuery = dbInstance.select("*").from(innerQuery);

      if (search) {
        const pattern = `%${sanitizeSqlLikeString(search)}%`;
        void baseQuery.where((qb) => {
          void qb
            .whereRaw(`CONCAT_WS(' ', ??, ??) ilike ?`, [
              db.ref("committerUserFirstName"),
              db.ref("committerUserLastName"),
              pattern
            ])
            .orWhereRaw(`?? ilike ?`, [db.ref("committerUserUsername"), pattern])
            .orWhereRaw(`?? ilike ?`, [db.ref("committerUserEmail"), pattern])
            .orWhereRaw(`?? ilike ?`, [db.ref("committerIdentityName"), pattern])
            .orWhereILike("environmentName", pattern)
            .orWhereILike("environment", pattern)
            .orWhereILike("policySecretPath", pattern)
            .orWhereILike("requestFolderPath", pattern)
            .orWhereExists(
              dbInstance(TableName.SecretApprovalRequestSecretV2)
                .select(dbInstance.raw("1"))
                .whereRaw("?? = ??", [
                  `${TableName.SecretApprovalRequestSecretV2}.secretChangeId`,
                  "inner.secretChangeId"
                ])
                .whereILike(`${TableName.SecretApprovalRequestSecretV2}.key`, pattern)
            );
        });
      }

      const pageQuery = applyRequestOrdering(baseQuery.clone(), orderBy, orderDirection)
        .select(db.raw("COUNT(*) OVER () as total"))
        .offset(offset)
        .limit(limit);
      const rows = (await pageQuery) as (TSecretChangeRequestListRow & { total: string })[];
      let totalCount = Number(rows[0]?.total ?? 0);

      if (!rows.length) {
        const countResult = (await dbInstance
          .count({ count: "*" })
          .from(baseQuery.clone().as("count_query"))
          .first()) as { count: string } | undefined;
        totalCount = Number(countResult?.count ?? 0);
      }

      return { rows: rows.map(({ total, ...row }) => row), totalCount };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindSecretChangeRequestsByProjectId" });
    }
  };

  const countByProjectId = async (projectId: string, userId?: string, policyId?: string, tx?: Knex) => {
    try {
      const dbInstance = tx || db.replicaNode();
      const rows = (await buildCoreQuery(dbInstance, projectId)
        .where((qb) => {
          if (policyId) void qb.where(`${TableName.ApprovalRequests}.policyId`, policyId);
        })
        .modify((qb) => buildAccessFilter(qb, dbInstance, userId))
        .select(`${TableName.ApprovalRequests}.status`)
        .count(`${TableName.ApprovalRequests}.id as count`)
        .groupBy(`${TableName.ApprovalRequests}.status`)) as { status: string; count: string }[];

      const countOf = (state: RequestState) => parseInt(rows.find((row) => row.status === state)?.count || "0", 10);
      return { open: countOf(RequestState.Open), closed: countOf(RequestState.Closed) };
    } catch (error) {
      throw new DatabaseError({ error, name: "CountSecretChangeRequestsByProjectId" });
    }
  };

  return {
    ...orm,
    findByProjectId,
    countByProjectId,
    insertV2Bridge: commitOrm.insertMany,
    updateV2ById: commitOrm.updateById,
    insertApprovalSecretV2Tags: commitTagOrm.insertMany,
    findBySecretChangeIdBridgeSecretV2,
    findCommitsBySecretChangeIds
  };
};
