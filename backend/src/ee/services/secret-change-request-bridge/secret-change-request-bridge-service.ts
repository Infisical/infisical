import { Knex } from "knex";

import { BadRequestError } from "@app/lib/errors";
import { TApprovalRequestDALFactory } from "@app/services/approval-policy/approval-request-dal";

import { TSecretChangeRequestBridgeMethods } from "./secret-change-request-bridge-types";

type TSecretChangeRequestBridgeServiceFactoryDep = {
  approvalRequestDAL: Pick<TApprovalRequestDALFactory, "findById">;
};

export type TSecretChangeRequestBridgeServiceFactory = ReturnType<typeof secretChangeRequestBridgeServiceFactory>;

const notAvailable = () =>
  new BadRequestError({ message: "Secret change requests on the approval system are not available yet." });

export const secretChangeRequestBridgeServiceFactory = ({
  approvalRequestDAL
}: TSecretChangeRequestBridgeServiceFactoryDep) => {
  const findSecretChangeRequest = (requestId: string, tx?: Knex) => approvalRequestDAL.findById(requestId, tx);

  const generateSecretChangeRequest: TSecretChangeRequestBridgeMethods["generateSecretChangeRequest"] = async () => {
    throw notAvailable();
  };

  const createSecretChangeRequest: TSecretChangeRequestBridgeMethods["createSecretChangeRequest"] = async () => {
    throw notAvailable();
  };

  const mergeSecretChangeRequest: TSecretChangeRequestBridgeMethods["mergeSecretChangeRequest"] = async () => {
    throw notAvailable();
  };

  const reviewSecretChangeRequest: TSecretChangeRequestBridgeMethods["reviewSecretChangeRequest"] = async () => {
    throw notAvailable();
  };

  const updateSecretChangeRequestStatus: TSecretChangeRequestBridgeMethods["updateSecretChangeRequestStatus"] =
    async () => {
      throw notAvailable();
    };

  const getSecretChangeRequestById: TSecretChangeRequestBridgeMethods["getSecretChangeRequestById"] = async () => {
    throw notAvailable();
  };

  return {
    findSecretChangeRequest,
    generateSecretChangeRequest,
    createSecretChangeRequest,
    mergeSecretChangeRequest,
    reviewSecretChangeRequest,
    updateSecretChangeRequestStatus,
    getSecretChangeRequestById
  };
};
