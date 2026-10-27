import { isValidAwsRegion } from "@app/lib/aws/region";
import { BadRequestError } from "@app/lib/errors";

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

// Login only checks the lists that are set, so an empty pair would admit any valid AWS principal.
export const hasAwsTrustBinding = ({
  allowedAccountIds,
  allowedPrincipalArns
}: {
  allowedAccountIds?: string | null;
  allowedPrincipalArns?: string | null;
}) => Boolean(allowedAccountIds?.trim()) || Boolean(allowedPrincipalArns?.trim());

export const AWS_TRUST_BINDING_REQUIRED_MESSAGE = "Configure at least one allowed AWS account ID or principal ARN.";

// Credential=<access-key-id>/<date>/<region>/<service>/aws4_request
const awsRegionFromAuthorizationHeader = (authorizationHeader: string): string | null => {
  const credentialField = authorizationHeader.split(" ").find((field) => field.startsWith("Credential="));
  const credentialParts = credentialField?.split("/");
  return credentialParts && credentialParts.length >= 3 ? credentialParts[2] : null;
};

// Left to the HTTP client, which derives them from the body it sends; forwarding them lets the caller leave bytes on a
// pooled connection that the next request on it would pick up
const STRIPPED_STS_HEADERS = new Set([
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "proxy-connection",
  "te",
  "trailer",
  "upgrade",
  "expect"
]);

const GLOBAL_STS_HOST = "sts.amazonaws.com";
const GLOBAL_STS_SIGNING_REGION = "us-east-1";

// The caller's input is replayed to STS and the answer is trusted, so it is narrowed to the one request STS must answer
export const parseSignedGetCallerIdentityRequest = ({
  iamHttpRequestMethod,
  iamRequestBody,
  iamRequestHeaders
}: {
  iamHttpRequestMethod: string;
  iamRequestBody: string;
  iamRequestHeaders: string;
}) => {
  let rawHeaders: unknown;
  try {
    rawHeaders = JSON.parse(Buffer.from(iamRequestHeaders, "base64").toString());
  } catch {
    throw new BadRequestError({ message: "Signed STS request headers must be base64-encoded JSON" });
  }
  if (!rawHeaders || typeof rawHeaders !== "object" || Array.isArray(rawHeaders)) {
    throw new BadRequestError({ message: "Signed STS request headers must be a JSON object" });
  }

  const body = Buffer.from(iamRequestBody, "base64").toString();
  const actions = new URLSearchParams(body).getAll("Action");
  if (iamHttpRequestMethod.toUpperCase() !== "POST" || actions.length !== 1 || actions[0] !== "GetCallerIdentity") {
    throw new BadRequestError({ message: "Signed STS request must be a POST of Action=GetCallerIdentity" });
  }

  const headers: Record<string, string> = {};
  let signedHost: string | undefined;
  Object.entries(rawHeaders).forEach(([name, value]) => {
    // The HTTP client trims names too, so " Host " would otherwise slip past the checks below and still be sent
    const headerName = name.trim().toLowerCase();
    if (headerName === "host") {
      if (signedHost !== undefined || typeof value !== "string") {
        throw new BadRequestError({ message: "Signed STS request has an invalid host header" });
      }
      signedHost = value.trim().toLowerCase();
      return;
    }
    if (STRIPPED_STS_HEADERS.has(headerName)) return;
    // A second spelling of a name would let the value that is validated differ from the one that is sent
    if (headerName in headers || typeof value !== "string") {
      throw new BadRequestError({ message: `Signed STS request has an invalid ${headerName} header` });
    }
    headers[headerName] = value;
  });

  const region = headers.authorization ? awsRegionFromAuthorizationHeader(headers.authorization) : null;
  if (!isValidAwsRegion(region)) {
    throw new BadRequestError({ message: "Invalid AWS region" });
  }

  // SigV4 always signs Host, so the URL is built from the signed value; only the two names STS answers on are allowed
  const regionalStsHost = `sts.${region}.amazonaws.com`;
  let stsHost: string;
  if (signedHost === undefined || signedHost === regionalStsHost) {
    stsHost = regionalStsHost;
  } else if (signedHost === GLOBAL_STS_HOST && region === GLOBAL_STS_SIGNING_REGION) {
    stsHost = GLOBAL_STS_HOST;
  } else {
    throw new BadRequestError({ message: "Signed STS request has an invalid host header" });
  }

  return { url: `https://${stsHost}`, headers, body };
};
