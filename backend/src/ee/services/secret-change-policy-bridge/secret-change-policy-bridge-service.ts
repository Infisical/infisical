import { Knex } from "knex";

import { BadRequestError } from "@app/lib/errors";
import { TApprovalPolicyDALFactory } from "@app/services/approval-policy/approval-policy-dal";

import { TSecretChangePolicyBridgeMethods } from "./secret-change-policy-bridge-types";

type TSecretChangePolicyBridgeServiceFactoryDep = {
  approvalPolicyDAL: Pick<TApprovalPolicyDALFactory, "findById">;
};

export type TSecretChangePolicyBridgeServiceFactory = ReturnType<typeof secretChangePolicyBridgeServiceFactory>;

const notAvailable = () =>
  new BadRequestError({ message: "Secret change policies on the approval system are not available yet." });

export const secretChangePolicyBridgeServiceFactory = ({
  approvalPolicyDAL
}: TSecretChangePolicyBridgeServiceFactoryDep) => {
  const findSecretChangePolicy = (policyId: string, tx?: Knex) => approvalPolicyDAL.findById(policyId, tx);

  const createSecretChangePolicy: TSecretChangePolicyBridgeMethods["createSecretChangePolicy"] = async () => {
    throw notAvailable();
  };

  const updateSecretChangePolicy: TSecretChangePolicyBridgeMethods["updateSecretChangePolicy"] = async () => {
    throw notAvailable();
  };

  const deleteSecretChangePolicy: TSecretChangePolicyBridgeMethods["deleteSecretChangePolicy"] = async () => {
    throw notAvailable();
  };

  const getSecretChangePolicy: TSecretChangePolicyBridgeMethods["getSecretChangePolicy"] = async () => {
    throw notAvailable();
  };

  const getSecretChangePolicyByPaths: TSecretChangePolicyBridgeMethods["getSecretChangePolicyByPaths"] = async () => {
    throw notAvailable();
  };

  const getSecretChangePolicyByProjectId: TSecretChangePolicyBridgeMethods["getSecretChangePolicyByProjectId"] =
    async () => {
      throw notAvailable();
    };

  const getSecretChangePolicyOfFolder: TSecretChangePolicyBridgeMethods["getSecretChangePolicyOfFolder"] = async () => {
    throw notAvailable();
  };

  const getSecretChangePolicyById: TSecretChangePolicyBridgeMethods["getSecretChangePolicyById"] = async () => {
    throw notAvailable();
  };

  return {
    findSecretChangePolicy,
    createSecretChangePolicy,
    updateSecretChangePolicy,
    deleteSecretChangePolicy,
    getSecretChangePolicy,
    getSecretChangePolicyByPaths,
    getSecretChangePolicyByProjectId,
    getSecretChangePolicyOfFolder,
    getSecretChangePolicyById
  };
};
