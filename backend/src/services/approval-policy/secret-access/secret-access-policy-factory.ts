import { BadRequestError } from "@app/lib/errors";

import { TApprovalResourceFactory } from "../approval-policy-types";
import { TSecretAccessPolicy, TSecretAccessPolicyInputs, TSecretAccessRequestData } from "./secret-access-policy-types";

const unsupported = () =>
  new BadRequestError({
    message: "Secret access approval requests are not supported on the global approval system yet"
  });

export const secretAccessPolicyFactory: TApprovalResourceFactory<
  TSecretAccessPolicyInputs,
  TSecretAccessPolicy,
  TSecretAccessRequestData
> = () => ({
  matchPolicy: async () => {
    throw unsupported();
  },
  canAccess: async () => {
    throw unsupported();
  },
  validateConstraints: () => {
    throw unsupported();
  },
  postApprovalRoutine: async () => {
    throw unsupported();
  },
  postRejectionRoutine: async () => {
    throw unsupported();
  }
});
