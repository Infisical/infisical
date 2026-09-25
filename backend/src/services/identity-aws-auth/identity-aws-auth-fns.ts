interface PrincipalArnEntity {
  Partition: string;
  Service: "iam" | "sts";
  AccountNumber: string;
  Type: "user" | "role" | "instance-profile" | "assumed-role";
  Path: string;
  FriendlyName: string;
  SessionInfo: string; // Only populated for assumed-role
}

export const extractPrincipalArnEntity = (arn: string, formatAsIamRole: boolean = false): PrincipalArnEntity => {
  // split the ARN into parts using ":" as the delimiter
  const fullParts = arn.split(":");
  if (fullParts.length !== 6) {
    throw new Error(`Unrecognized ARN: "${arn}" contains ${fullParts.length} colon-separated parts, expected 6`);
  }
  const [prefix, partition, service, , accountNumber, resource] = fullParts;
  if (prefix !== "arn") {
    throw new Error(`Unrecognized ARN: "${arn}" does not begin with "arn:"`);
  }

  // validate the service is either 'iam' or 'sts'
  if (service !== "iam" && service !== "sts") {
    throw new Error(`Unrecognized service: "${service}" in ARN "${arn}", expected "iam" or "sts"`);
  }

  // parse the last part of the ARN which describes the resource
  const parts = resource.split("/");
  if (parts.length < 2) {
    throw new Error(
      `Unrecognized ARN: "${resource}" in ARN "${arn}" contains fewer than 2 slash-separated parts (expected type/name)`
    );
  }

  const [rawType, ...rest] = parts;

  let finalType: PrincipalArnEntity["Type"];
  let friendlyName: string = parts[parts.length - 1];
  let path: string = "";
  let sessionInfo: string = "";

  // handle different types of resources
  switch (rawType) {
    case "assumed-role": {
      if (rest.length < 2) {
        throw new Error(
          `Unrecognized ARN: "${resource}" for assumed-role in ARN "${arn}" contains fewer than 3 slash-separated parts (type/roleName/sessionId)`
        );
      }
      // assumed roles use a special format where the friendly name is the role name
      const [roleName, sessionId] = rest;
      finalType = formatAsIamRole ? "role" : "assumed-role";
      friendlyName = roleName;
      sessionInfo = sessionId;
      break;
    }
    case "user":
    case "role":
    case "instance-profile":
      finalType = rawType;
      path = rest.slice(0, -1).join("/");
      break;
    default:
      throw new Error(
        `Unrecognized principal type: "${rawType}" in ARN "${arn}". Expected "user", "role", "instance-profile", or "assumed-role".`
      );
  }

  const entity: PrincipalArnEntity = {
    Partition: partition,
    Service: service,
    AccountNumber: accountNumber,
    Type: finalType,
    Path: path,
    FriendlyName: friendlyName,
    SessionInfo: sessionInfo
  };

  return entity;
};

/**
 * Extracts the identity ARN from the GetCallerIdentity response to one of the following formats:
 * - arn:aws:iam::123456789012:user/MyUserName
 * - arn:aws:iam::123456789012:role/MyRoleName
 * - arn:aws-us-gov:iam::123456789012:user/MyUserName (GovCloud)
 * - arn:aws-us-gov:iam::123456789012:role/MyRoleName (GovCloud)
 */
export const extractPrincipalArn = (arn: string, formatAsIamRole: boolean = false) => {
  const entity = extractPrincipalArnEntity(arn, formatAsIamRole);

  return `arn:${entity.Partition}:${formatAsIamRole ? "iam" : entity.Service}::${entity.AccountNumber}:${entity.Type}/${entity.FriendlyName}`;
};

// Regional, FIPS, and VPC PrivateLink STS endpoints reject SigV4 requests whose credential
// scope region does not match the endpoint's region. In AWS STS hosts the region is the label
// following the "sts" (or "sts-fips") service label (e.g. sts.eu-west-1.amazonaws.com,
// vpce-0abc.sts.eu-west-1.vpce.amazonaws.com). The global endpoint (sts.amazonaws.com) and
// non-AWS hosts (e.g. LocalStack) carry no region.
export const stsEndpointRegion = (stsEndpoint: string): string | undefined => {
  try {
    const { hostname } = new URL(stsEndpoint);
    const labels = hostname.split(".");
    const stsLabelIndex = labels.findIndex((label) => label === "sts" || label === "sts-fips");
    if (stsLabelIndex === -1) return undefined;
    const region = labels[stsLabelIndex + 1];
    // the global endpoint has the domain in the region position, not a region
    return region === "amazonaws" ? undefined : region;
  } catch {
    return undefined;
  }
};

// Picks the STS URL used to validate a login's signed GetCallerIdentity request.
//
// Only the AWS global endpoint follows the caller's credential scope region: it accepts any
// region scope, and regional routing keeps validation close to the caller. Every other
// configured endpoint is operator intent and is honored. Regional, FIPS, GovCloud, China, and
// VPC endpoints additionally reject a mismatched caller region (returning null) instead of
// silently re-routing validation to a commercial endpoint the operator never configured.
export const resolveStsLoginUrl = (stsEndpoint: string, callerRegion: string | null): string | null => {
  try {
    if (new URL(stsEndpoint).hostname === "sts.amazonaws.com") {
      return callerRegion ? `https://sts.${callerRegion}.amazonaws.com` : stsEndpoint;
    }
  } catch {
    // fall through: honor the configured value as-is
  }
  const configuredRegion = stsEndpointRegion(stsEndpoint);
  if (configuredRegion !== undefined && callerRegion !== configuredRegion) return null;
  return stsEndpoint;
};
