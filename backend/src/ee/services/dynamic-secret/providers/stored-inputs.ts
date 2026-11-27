import { GcpIamServiceAccountSuffixError } from "./gcp-iam";
import { TDynamicProviderFns } from "./models";
import { SnowflakeUnsupportedStatementError } from "./snowflake";

// Inputs saved before a validation rule was added still load, so they can be read and fixed through an update
export const validateStoredProviderInputs = async (
  provider: Pick<TDynamicProviderFns, "validateProviderInputs">,
  storedInputs: object,
  projectId: string
): Promise<unknown> => {
  try {
    return await provider.validateProviderInputs(storedInputs, { projectId });
  } catch (error) {
    if (error instanceof GcpIamServiceAccountSuffixError || error instanceof SnowflakeUnsupportedStatementError) {
      return storedInputs;
    }
    throw error;
  }
};
