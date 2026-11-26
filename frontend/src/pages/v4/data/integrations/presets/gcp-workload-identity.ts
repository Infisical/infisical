const WORKLOAD_IDENTITY_PROVIDER_PATTERN =
  /^projects\/([0-9]{1,20})\/locations\/global\/workloadIdentityPools\/([a-z0-9-]{4,32})\/providers\/([a-z0-9-]{4,32})$/;

export type WorkloadIdentityProviderParts = {
  projectNumber: string;
  poolId: string;
  providerId: string;
};

export const parseWorkloadIdentityProvider = (
  workloadIdentityProvider: string | undefined
): WorkloadIdentityProviderParts | undefined => {
  const match = WORKLOAD_IDENTITY_PROVIDER_PATTERN.exec(workloadIdentityProvider ?? "");
  if (!match) return undefined;
  const [, projectNumber, poolId, providerId] = match;
  return { projectNumber, poolId, providerId };
};

export const toWorkloadIdentityProvider = ({
  projectNumber,
  poolId,
  providerId
}: WorkloadIdentityProviderParts) =>
  `projects/${projectNumber.trim()}/locations/global/workloadIdentityPools/${poolId.trim()}/providers/${providerId.trim()}`;

/** The provider the form's fields name, once all three are filled in. */
export const editedWorkloadIdentityProvider = (credentials: unknown) => {
  const parts = (credentials ?? {}) as Partial<WorkloadIdentityProviderParts>;
  if (!parts.projectNumber || !parts.poolId || !parts.providerId) return undefined;
  const provider = toWorkloadIdentityProvider(parts as WorkloadIdentityProviderParts);
  return parseWorkloadIdentityProvider(provider) ? provider : undefined;
};

// GCP keeps a deleted pool's ID reserved for 30 days, so a fixed default would collide with one deleted earlier.
// getRandomValues rather than randomUUID, which browsers only expose over HTTPS or localhost.
export const randomGcpId = () =>
  `infisical-${Array.from(crypto.getRandomValues(new Uint8Array(4)), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
