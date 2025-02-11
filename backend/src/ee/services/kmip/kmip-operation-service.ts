import { ProjectType } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError, NotFoundError } from "@app/lib/errors";
import { TKmsKeyDALFactory } from "@app/services/kms/kms-key-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TKmipClientDALFactory } from "./kmip-client-dal";
import { KmipPermission } from "./kmip-enum";
import { TKmipCreateDTO, TKmipGetDTO } from "./kmip-types";

type TKmipOperationServiceFactoryDep = {
  kmsService: TKmsServiceFactory;
  kmsDAL: TKmsKeyDALFactory;
  kmipClientDAL: TKmipClientDALFactory;
  projectDAL: Pick<TProjectDALFactory, "getProjectFromSplitId" | "findById">;
};

export type TKmipOperationServiceFactory = ReturnType<typeof kmipOperationServiceFactory>;

export const kmipOperationServiceFactory = ({
  kmsService,
  kmsDAL,
  projectDAL,
  kmipClientDAL
}: TKmipOperationServiceFactoryDep) => {
  const create = async ({ projectId: preSplitProjectId, clientId, encryptionAlgorithm }: TKmipCreateDTO) => {
    let projectId = preSplitProjectId;
    const cmekProjectFromSplit = await projectDAL.getProjectFromSplitId(projectId, ProjectType.KMS);
    if (cmekProjectFromSplit) {
      projectId = cmekProjectFromSplit.id;
    }

    const project = await projectDAL.findById(projectId);
    const kmipClient = await kmipClientDAL.findOne({
      id: clientId,
      projectId
    });

    if (!kmipClient.permissions?.includes(KmipPermission.Create)) {
      throw new ForbiddenRequestError({
        message: "Client does not have sufficient permission to perform KMIP create"
      });
    }

    const kmsKey = await kmsService.generateKmsKey({
      encryptionAlgorithm,
      orgId: project.orgId,
      projectId,
      isReserved: false
    });

    return kmsKey;
  };

  const get = async ({ projectId: preSplitProjectId, id, clientId }: TKmipGetDTO) => {
    let projectId = preSplitProjectId;
    const cmekProjectFromSplit = await projectDAL.getProjectFromSplitId(projectId, ProjectType.KMS);

    if (cmekProjectFromSplit) {
      projectId = cmekProjectFromSplit.id;
    }

    const kmipClient = await kmipClientDAL.findOne({
      id: clientId,
      projectId
    });

    if (!kmipClient.permissions?.includes(KmipPermission.Get)) {
      throw new ForbiddenRequestError({
        message: "Client does not have sufficient permission to perform KMIP get"
      });
    }

    const key = await kmsDAL.findOne({
      id,
      projectId
    });

    if (!key) {
      throw new NotFoundError({ message: `Key with ID ${id} not found` });
    }

    if (key.isReserved) {
      throw new BadRequestError({ message: "Cannot get reserved keys" });
    }

    const completeKeyDetails = await kmsDAL.findByIdWithAssociatedKms(id);

    if (!completeKeyDetails.internalKms) {
      throw new BadRequestError({
        message: "Cannot get external key"
      });
    }

    const kmsKey = await kmsService.getKeyMaterial({
      kmsId: key.id
    });

    return {
      id: key.id,
      value: kmsKey.toString("base64"),
      algorithm: completeKeyDetails.internalKms.encryptionAlgorithm
    };
  };

  return {
    create,
    get
  };
};
