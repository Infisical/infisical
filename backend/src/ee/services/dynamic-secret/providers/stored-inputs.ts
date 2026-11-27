import { GcpIamServiceAccountSuffixError } from "./gcp-iam";
import { TDynamicProviderFns } from "./models";
import { SnowflakeUnsupportedStatementError } from "./snowflake";

// Returns stored inputs as they are when they fail the GCP IAM suffix check or the Snowflake statement check
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
