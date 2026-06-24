import { AwsClient, JWT } from "google-auth-library";

import { buildGcpSourceCredential } from "./gcp-connection-fns";

// A workload-identity-federation config as downloaded from GCP for an AWS provider. Note the
// `credential_source` pointing at the EC2 metadata endpoint (169.254.169.254) - the address that is
// unreachable on ECS Fargate / Lambda / EKS and produced the original "unable to impersonate" error.
const awsExternalAccountJson = JSON.stringify({
  type: "external_account",
  audience:
    "//iam.googleapis.com/projects/123456789/locations/global/workloadIdentityPools/test-pool/providers/aws-provider",
  subject_token_type: "urn:ietf:params:aws:token-type:aws4_request",
  token_url: "https://sts.googleapis.com/v1/token",
  service_account_impersonation_url:
    "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/broker@proj.iam.gserviceaccount.com:generateAccessToken",
  credential_source: {
    environment_id: "aws1",
    region_url: "http://169.254.169.254/latest/meta-data/placement/availability-zone",
    url: "http://169.254.169.254/latest/meta-data/iam/security-credentials",
    regional_cred_verification_url: "https://sts.{region}.amazonaws.com?Action=GetCallerIdentity&Version=2011-06-15",
    imdsv2_session_token_url: "http://169.254.169.254/latest/api/token"
  }
});

const serviceAccountKeyJson = JSON.stringify({
  type: "service_account",
  client_email: "sa@proj.iam.gserviceaccount.com",
  // Test-only RSA key (not a real credential).
  private_key:
    "-----BEGIN PRIVATE KEY-----\nMIIBVAIBADANBgkqhkiG9w0BAQEFAASCAT4wggE6AgEAAkEAuKKMfyqM\n-----END PRIVATE KEY-----\n"
});

describe("buildGcpSourceCredential", () => {
  const AWS_ENV_KEYS = ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY", "AWS_SESSION_TOKEN", "AWS_REGION"];
  const savedEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    AWS_ENV_KEYS.forEach((key) => {
      savedEnv[key] = process.env[key];
    });
  });

  afterEach(() => {
    AWS_ENV_KEYS.forEach((key) => {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    });
  });

  it("sources AWS credentials via the AWS SDK chain (never the EC2 metadata endpoint) for AWS external_account configs", async () => {
    // Simulate the instance's AWS identity being resolvable without metadata (as on Fargate, where the
    // container provider resolves credentials). If the client fell back to the EC2 metadata default, this
    // call would instead try to connect to 169.254.169.254 and fail.
    process.env.AWS_ACCESS_KEY_ID = "AKIATESTEXAMPLE";
    process.env.AWS_SECRET_ACCESS_KEY = "secretexample";
    process.env.AWS_SESSION_TOKEN = "sessiontoken";
    process.env.AWS_REGION = "us-east-1";

    const client = buildGcpSourceCredential(awsExternalAccountJson);
    expect(client).toBeInstanceOf(AwsClient);

    // retrieveSubjectToken() resolves credentials through the supplier and signs the STS request locally.
    // It completes offline here precisely because credentials come from the SDK chain, not metadata.
    const subjectToken = await (client as AwsClient).retrieveSubjectToken();
    expect(typeof subjectToken).toBe("string");
    expect(subjectToken.length).toBeGreaterThan(0);
  });

  it("builds a JWT client for service-account-key credentials", () => {
    const client = buildGcpSourceCredential(serviceAccountKeyJson);
    expect(client).toBeInstanceOf(JWT);
  });
});
