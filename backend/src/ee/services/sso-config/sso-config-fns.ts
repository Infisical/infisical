import { ConflictError } from "@app/lib/errors";
import { SsoProvider } from "@app/lib/types";

type TSsoConfigLookup = {
  findOne: (filter: { orgId: string }) => Promise<unknown>;
};

// An organization has one SSO config at a time (SAML, OIDC or LDAP), guards against api clients, terraform etc
export const assertNoOtherSsoMethod = async ({
  orgId,
  method,
  otherMethods
}: {
  orgId: string;
  method: SsoProvider;
  otherMethods: Partial<Record<SsoProvider, TSsoConfigLookup>>;
}) => {
  const lookups = Object.entries(otherMethods) as [SsoProvider, TSsoConfigLookup][];
  const existingConfigs = await Promise.all(lookups.map(([, dal]) => dal.findOne({ orgId })));

  const existingIndex = existingConfigs.findIndex(Boolean);
  if (existingIndex === -1) return;

  const [existingProvider] = lookups[existingIndex];
  const newName = method.toUpperCase();
  const existingName = existingProvider.toUpperCase();
  throw new ConflictError({
    message: `Cannot create the ${newName} configuration because this organization already has ${existingName} configured. Delete the ${existingName} configuration first.`
  });
};
