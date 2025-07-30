interface PrincipalArnEntity {
  Partition: string;
  Service: "iam" | "sts";
  AccountNumber: string;
  Type: "user" | "role" | "instance-profile";
  Path: string;
  FriendlyName: string;
  SessionInfo: string; // Only populated for assumed-role
}

export const extractPrincipalArnEntity = (arn: string): PrincipalArnEntity => {
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
      finalType = "role"; // treat assumed role case as role
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
 */
export const extractPrincipalArn = (arn: string) => {
  const entity = extractPrincipalArnEntity(arn);

  return `arn:aws:iam::${entity.AccountNumber}:${entity.Type}/${entity.FriendlyName}`;
};
