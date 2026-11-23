import { TInfisicalIdLookup } from "../../../ce/services/dependencies";
import { AwsProviderInputs } from "../../models/aws-provider-inputs";

export const assertAwsInputsAllowed = async (awsInputs: AwsProviderInputs, idLookup: TInfisicalIdLookup) => {
  const toCheck = awsInputs.legacyExternalIdToCheck();
  if (!toCheck) return;

  const [isOrganization, projectOrgId] = await Promise.all([
    toCheck.mayBeOrganization ? idLookup.organizationKeyStore.isOrganization(toCheck.externalId) : false,
    idLookup.projectKeyStore.findOrgIdIncludingPendingDeletion(toCheck.externalId)
  ]);
  awsInputs.assertNotForeign(isOrganization, projectOrgId);
};
