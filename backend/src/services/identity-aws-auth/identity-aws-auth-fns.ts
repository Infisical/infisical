/**
 * Extracts the identity ARN from the GetCallerIdentity response to one of the following formats:
 * - arn:aws:iam::123456789012:user/MyUserName
 * - arn:aws:iam::123456789012:role/MyRoleName
 */
export const extractPrincipalArn = (arn: string) => {
  // split the ARN into parts using ":" as the delimiter
  const fullParts = arn.split(":");
  if (fullParts.length !== 6) {
    throw new Error(`Unrecognized ARN: contains ${fullParts.length} colon-separated parts, expected 6`);
  }
  const [prefix, partition, service, , accountNumber, resource] = fullParts;
  if (prefix !== "arn") {
    throw new Error('Unrecognized ARN: does not begin with "arn:"');
  }

  // structure to hold the parsed data
  const entity = {
    Partition: partition,
    Service: service,
    AccountNumber: accountNumber,
    Type: "",
    Path: "",
    FriendlyName: "",
    SessionInfo: ""
  };

  // validate the service is either 'iam' or 'sts'
  if (entity.Service !== "iam" && entity.Service !== "sts") {
    throw new Error(`Unrecognized service: ${entity.Service}, not one of iam or sts`);
  }

  // parse the last part of the ARN which describes the resource
  const parts = resource.split("/");
  if (parts.length < 2) {
    throw new Error(`Unrecognized ARN: "${resource}" contains fewer than 2 slash-separated parts`);
  }

  const [type, ...rest] = parts;
  entity.Type = type;
  entity.FriendlyName = parts[parts.length - 1];

  // handle different types of resources
  switch (entity.Type) {
    case "assumed-role": {
      if (rest.length < 2) {
        throw new Error(`Unrecognized ARN: "${resource}" contains fewer than 3 slash-separated parts`);
      }
      // assumed roles use a special format where the friendly name is the role name
      const [roleName, sessionId] = rest;
      entity.Type = "role"; // treat assumed role case as role
      entity.FriendlyName = roleName;
      entity.SessionInfo = sessionId;
      break;
    }
    case "user":
    case "role":
    case "instance-profile":
      // standard cases: just join back the path if there's any
      entity.Path = rest.slice(0, -1).join("/");
      break;
    default:
      throw new Error(`Unrecognized principal type: "${entity.Type}"`);
  }

  return `arn:aws:iam::${entity.AccountNumber}:${entity.Type}/${entity.FriendlyName}`;
};
