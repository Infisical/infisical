import { Knex } from "knex";

import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TPkiAcmeAuthDALFactory } from "./pki-acme-auth-dal";
import { TPkiAcmeChallengeDALFactory } from "./pki-acme-challenge-dal";
import { TPkiAcmeChallengeServiceFactory } from "./pki-acme-types";

// Define types for job data
export type TValidateAcmeChallengeResponseDTO = {
  challengeId: string;
};

type TChallengeQueueServiceFactoryDep = {
  queueService: Pick<TQueueServiceFactory, "queuePg" | "startPg">;
  acmeChallengeDAL: Pick<TPkiAcmeChallengeDALFactory, "transaction" | "findByIdForChallengeValidation" | "updateById">;
  acmeAuthDAL: Pick<TPkiAcmeAuthDALFactory, "updateById">;
  acmeChallengeService: TPkiAcmeChallengeServiceFactory;
};

export type TFolderCommitQueueServiceFactory = ReturnType<typeof challengeQueueServiceFactory>;

export const challengeQueueServiceFactory = ({
  queueService,
  acmeChallengeService
}: TChallengeQueueServiceFactoryDep) => {
  const scheduleChallengeValidation = async (payload: TValidateAcmeChallengeResponseDTO) => {
    const { challengeId } = payload;
    await queueService.queuePg<QueueName.PkiAcmeChallengeValidation>(QueueJobs.ValidateAcmeChallengeResponse, payload, {
      // TODO: maybe we should retry, but let's keep it simple for now
    });
  };

  const validateAcmeChallengeResponse = async (jobData: TValidateAcmeChallengeResponseDTO, tx?: Knex) => {
    const { challengeId } = jobData;
    await acmeChallengeService.validateChallengeResponse(challengeId);
  };

  const init = async () => {
    await queueService.startPg<QueueName.PkiAcmeChallengeValidation>(
      QueueJobs.ValidateAcmeChallengeResponse,
      async ([job]) => {
        await validateAcmeChallengeResponse(job.data as TValidateAcmeChallengeResponseDTO);
      },
      {
        workerCount: 5,
        pollingIntervalSeconds: 30
      }
    );
  };

  return {
    scheduleChallengeValidation,
    init
  };
};
