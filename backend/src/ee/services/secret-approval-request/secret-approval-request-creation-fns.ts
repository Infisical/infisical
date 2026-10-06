import { Knex } from "knex";

import { BadRequestError } from "@app/lib/errors";
import { groupBy } from "@app/lib/fn";
import { alphaNumericNanoId } from "@app/lib/nanoid";

import { getCommitterIds } from "../secret-approval-policy/secret-approval-policy-fns";
import { TSecretChangePolicyBridgeServiceFactory } from "../secret-change-policy-bridge/secret-change-policy-bridge-service";
import { TSecretChangeRequestBridgeServiceFactory } from "../secret-change-request-bridge/secret-change-request-bridge-service";
import { TSecretApprovalRequestDALFactory } from "./secret-approval-request-dal";
import { TSecretApprovalRequestSecretDALFactory } from "./secret-approval-request-secret-dal";
import {
  TCreateSecretApprovalRequestDTO,
  TCreateSecretApprovalRequestV2BridgeDTO
} from "./secret-approval-request-types";

type TSecretApprovalRequestCreationFnsFactoryDep = {
  secretApprovalRequestDAL: Pick<TSecretApprovalRequestDALFactory, "create" | "transaction">;
  secretApprovalRequestSecretDAL: Pick<
    TSecretApprovalRequestSecretDALFactory,
    "insertMany" | "insertV2Bridge" | "insertApprovalSecretV2Tags"
  >;
  secretChangePolicyBridgeService: Pick<TSecretChangePolicyBridgeServiceFactory, "findSecretChangePolicy">;
  secretChangeRequestBridgeService: Pick<TSecretChangeRequestBridgeServiceFactory, "createSecretChangeRequest">;
};

export type TSecretApprovalRequestCreationFnsFactory = ReturnType<typeof secretApprovalRequestCreationFnsFactory>;

export const secretApprovalRequestCreationFnsFactory = ({
  secretApprovalRequestDAL,
  secretApprovalRequestSecretDAL,
  secretChangePolicyBridgeService,
  secretChangeRequestBridgeService
}: TSecretApprovalRequestCreationFnsFactoryDep) => {
  const $isSecretChangePolicy = async (policyId: string, tx?: Knex) =>
    Boolean(await secretChangePolicyBridgeService.findSecretChangePolicy(policyId, tx));

  const $buildRequestDoc = ({
    policy,
    folderId,
    actor,
    actorId,
    isReplicated,
    commitMessage
  }: Pick<
    TCreateSecretApprovalRequestV2BridgeDTO,
    "policy" | "folderId" | "actor" | "actorId" | "isReplicated" | "commitMessage"
  >) => ({
    folderId,
    slug: alphaNumericNanoId(),
    policyId: policy.id,
    status: "open",
    hasMerged: false,
    ...getCommitterIds(actor, actorId),
    isReplicated,
    commitMessage
  });

  const createSecretApprovalRequestV2Bridge = async (dto: TCreateSecretApprovalRequestV2BridgeDTO, tx?: Knex) => {
    if (await $isSecretChangePolicy(dto.policy.id, tx)) {
      return secretChangeRequestBridgeService.createSecretChangeRequest(dto, tx);
    }

    const write = async (trx: Knex) => {
      const doc = await secretApprovalRequestDAL.create($buildRequestDoc(dto), trx);
      const approvalCommits = await secretApprovalRequestSecretDAL.insertV2Bridge(
        dto.commits.map(({ tagIds, ...commit }) => ({ ...commit, requestId: doc.id })),
        trx
      );

      const approvalCommitsByKey = groupBy(approvalCommits, (commit) => commit.key);
      const approvalSecretTags = dto.commits.flatMap(({ key, tagIds = [] }) =>
        tagIds.map((tagId) => ({ secretId: approvalCommitsByKey[key][0].id, tagId }))
      );
      if (approvalSecretTags.length) {
        await secretApprovalRequestSecretDAL.insertApprovalSecretV2Tags(approvalSecretTags, trx);
      }

      return { ...doc, commits: approvalCommits };
    };

    return tx ? write(tx) : secretApprovalRequestDAL.transaction(write);
  };

  const createSecretApprovalRequest = async (dto: TCreateSecretApprovalRequestDTO, tx?: Knex) => {
    if (await $isSecretChangePolicy(dto.policy.id, tx)) {
      throw new BadRequestError({
        message: `Secret approval policy with ID '${dto.policy.id}' is on the global approval system, which does not support projects that have not been upgraded to the latest secrets version.`
      });
    }

    const write = async (trx: Knex) => {
      const doc = await secretApprovalRequestDAL.create($buildRequestDoc(dto), trx);
      const approvalCommits = await secretApprovalRequestSecretDAL.insertMany(
        dto.commits.map((commit) => ({ ...commit, requestId: doc.id })),
        trx
      );
      return { ...doc, commits: approvalCommits };
    };

    return tx ? write(tx) : secretApprovalRequestDAL.transaction(write);
  };

  return { createSecretApprovalRequestV2Bridge, createSecretApprovalRequest };
};
