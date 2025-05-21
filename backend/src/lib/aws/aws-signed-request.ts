import crypto from "crypto";
import https from "https";

export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
}

export interface AwsRequestOptions {
  region: string;
  service: string;
  method: string;
  host: string;
  path: string;
  body?: string;
  headers?: Record<string, string>;
  credentials: AwsCredentials;
}

function hash(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmac(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function getSignatureKey(key: string, date: string, region: string, service: string) {
  const kDate = hmac("AWS4" + key, date);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  return kSigning;
}

export async function awsSignedRequest<T = any>(options: AwsRequestOptions): Promise<T> {
  const { region, service, method, host, path, body = "{}", headers = {}, credentials } = options;
  const now = new Date();
  const amzDate =
    now
      .toISOString()
      .replace(/[:-]|\..*$/g, "")
      .slice(0, 15) + "Z";
  const dateStamp = amzDate.slice(0, 8);

  // Canonical headers and signed headers use lowercase
  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-date:${amzDate}\n` +
    (credentials.sessionToken ? `x-amz-security-token:${credentials.sessionToken}\n` : "");
  const signedHeaders = "host;x-amz-date" + (credentials.sessionToken ? ";x-amz-security-token" : "");
  const payloadHash = hash(body);
  const canonicalRequest = [method, path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hash(canonicalRequest)].join("\n");

  const signingKey = getSignatureKey(credentials.secretAccessKey, dateStamp, region, service);
  const signature = hmac(signingKey, stringToSign).toString("hex");

  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`;

  // Actual HTTP headers: use correct case for session token
  const requestHeaders: Record<string, string> = {
    ...headers,
    Host: host,
    "X-Amz-Date": amzDate,
    Authorization: authorizationHeader,
    "X-Amz-Target": "secretsmanager.ListSecrets",
    "Content-Type": "application/x-amz-json-1.1"
  };
  if (credentials.sessionToken) {
    requestHeaders["X-Amz-Security-Token"] = credentials.sessionToken;
  }

  return new Promise<T>((resolve, reject) => {
    const req = https.request(
      {
        host,
        path,
        method,
        headers: requestHeaders
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(data));
            } catch {
              resolve(data as any);
            }
          } else {
            // Enhanced error diagnostics
            console.error("AWS Request Failed:", res.statusCode, data);
            try {
              const parsed = JSON.parse(data);
              console.error("Parsed AWS Error Response:", parsed);
            } catch {}
            reject(new Error(`AWS request failed: ${res.statusCode} ${data}`));
          }
        });
      }
    );
    req.on("error", (err) => {
      console.error("AWS Request Error (network or client):", err);
      reject(err);
    });
    if (body) req.write(body);
    req.end();
  });
}
