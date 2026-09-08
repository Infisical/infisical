import { NotFoundError } from "@app/lib/errors";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import { TIdentityDALFactory } from "@app/services/identity/identity-dal";

import { EXTERNAL_APPROVAL_APP_CONNECTION_MAP } from "./external-approval-map";
import { TValidateExternalApprovalPolicyInputDTO } from "./external-approval-types";

type TExternalApprovalServiceFactoryDep = {
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  identityDAL: Pick<TIdentityDALFactory, "findOne">;
};

export type TExternalApprovalServiceFactory = ReturnType<typeof externalApprovalServiceFactory>;

export const externalApprovalServiceFactory = ({
  appConnectionService,
  identityDAL
}: TExternalApprovalServiceFactoryDep) => {
  const validateExternalApprovalPolicyInput = async ({
    input,
    projectId,
    actor
  }: TValidateExternalApprovalPolicyInputDTO) => {
    const app = EXTERNAL_APPROVAL_APP_CONNECTION_MAP[input.type];
    await appConnectionService.validateAppConnectionUsageById(
      app,
      { connectionId: input.connectionId, projectId },
      actor
    );

    if (!input.approverIdentityId) {
      throw new NotFoundError({
        message: `Approver identity ID is required for external approval policy`
      });
    }

    const identity = await identityDAL.findOne({ id: input.approverIdentityId, orgId: actor.orgId });
    if (!identity) {
      throw new NotFoundError({
        message: `Identity with ID '${input.approverIdentityId}' not found in your organization`
      });
    }
  };

  return {
    validateExternalApprovalPolicyInput
  };
};
