/* eslint-disable no-case-declarations, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-var-requires, no-await-in-loop, no-continue */
import { NtlmClient } from "axios-ntlm";
import https from "https";

import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator/validate-url";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { AppConnection } from "../app-connection-enums";
import { AzureADCSConnectionMethod } from "./azure-adcs-connection-enums";
import { TAzureADCSConnectionConfig } from "./azure-adcs-connection-types";

// Type definitions for axios-ntlm
interface AxiosNtlmConfig {
  ntlm: {
    domain: string;
    username: string;
    password: string;
  };
  httpsAgent?: https.Agent;
  url: string;
  method?: string;
  data?: string;
  headers?: Record<string, string>;
}

interface AxiosNtlmResponse {
  status: number;
  data: string;
  headers: unknown;
}

// Types for credential parsing
interface ParsedCredentials {
  domain: string;
  username: string;
  fullUsername: string; // domain\username format
}

// Helper function to parse and normalize credentials for Windows authentication
const parseCredentials = (inputUsername: string): ParsedCredentials => {
  // Ensure inputUsername is a string
  if (typeof inputUsername !== "string" || !inputUsername.trim()) {
    throw new BadRequestError({
      message: "Username must be a non-empty string"
    });
  }

  let domain = "";
  let username = "";
  let fullUsername = "";

  if (inputUsername.includes("\\")) {
    // Already in domain\username format
    const parts = inputUsername.split("\\");
    if (parts.length === 2) {
      [domain, username] = parts;
      fullUsername = inputUsername;
    } else {
      throw new BadRequestError({
        message: "Invalid domain\\username format. Expected format: DOMAIN\\username"
      });
    }
  } else if (inputUsername.includes("@")) {
    // UPN format: user@domain.com
    const [user, domainPart] = inputUsername.split("@");
    if (!user || !domainPart) {
      throw new BadRequestError({
        message: "Invalid UPN format. Expected format: user@domain.com"
      });
    }

    username = user;
    // Extract NetBIOS name from FQDN
    domain = domainPart.split(".")[0].toUpperCase();
    fullUsername = `${domain}\\${username}`;
  } else {
    // Plain username - assume local account or current domain
    username = inputUsername;
    domain = "";
    fullUsername = inputUsername;
  }

  return { domain, username, fullUsername };
};

// Helper to normalize URL
const normalizeAdcsUrl = (url: string): string => {
  let normalizedUrl = url.trim();

  // Remove trailing slash
  normalizedUrl = normalizedUrl.replace(/\/$/, "");

  // Ensure HTTPS protocol
  if (normalizedUrl.startsWith("http://")) {
    normalizedUrl = normalizedUrl.replace("http://", "https://");
  } else if (!normalizedUrl.startsWith("https://")) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  return normalizedUrl;
};

// NTLM request wrapper
const createHttpsAgent = (sslRejectUnauthorized: boolean, sslCertificate?: string): https.Agent => {
  const agentOptions: https.AgentOptions = {
    rejectUnauthorized: sslRejectUnauthorized,
    keepAlive: true, // axios-ntlm needs keepAlive for NTLM handshake
    ca: sslCertificate ? [sslCertificate.trim()] : undefined,
    // Disable hostname verification as Microsoft servers by default use local IPs for certificates
    // which may not match the hostname used to connect
    checkServerIdentity: () => undefined
  };

  return new https.Agent(agentOptions);
};

const axiosNtlmRequest = async (config: AxiosNtlmConfig): Promise<AxiosNtlmResponse> => {
  const method = config.method || "GET";

  const credentials = {
    username: config.ntlm.username,
    password: config.ntlm.password,
    domain: config.ntlm.domain || "",
    workstation: ""
  };

  const axiosConfig = {
    httpsAgent: config.httpsAgent,
    timeout: 30000
  };

  const client = NtlmClient(credentials, axiosConfig);

  const requestOptions: { url: string; method: string; data?: string; headers?: Record<string, string> } = {
    url: config.url,
    method
  };

  if (config.data) {
    requestOptions.data = config.data;
  }

  if (config.headers) {
    requestOptions.headers = config.headers;
  }

  const response = await client(requestOptions);

  return {
    status: response.status,
    data: response.data,
    headers: response.headers
  };
};

// Test ADCS connectivity and authentication using NTLM
const testAdcsConnection = async (
  credentials: ParsedCredentials,
  password: string,
  baseUrl: string,
  sslRejectUnauthorized: boolean = true,
  sslCertificate?: string
): Promise<boolean> => {
  // Test endpoints in order of preference
  const testEndpoints = [
    "/certsrv/certrqus.asp", // Certificate request status (most reliable)
    "/certsrv/certfnsh.asp", // Certificate finalization
    "/certsrv/default.asp", // Main ADCS page
    "/certsrv/" // Root certsrv
  ];

  for (const endpoint of testEndpoints) {
    try {
      const testUrl = `${baseUrl}${endpoint}`;

      const shouldRejectUnauthorized = sslRejectUnauthorized;

      const httpsAgent = createHttpsAgent(shouldRejectUnauthorized, sslCertificate);

      const response = await axiosNtlmRequest({
        url: testUrl,
        method: "GET",
        httpsAgent,
        ntlm: {
          domain: credentials.domain,
          username: credentials.username,
          password
        }
      });

      // Check if we got a successful response
      if (response.status === 200) {
        const responseText = response.data;

        // Verify this is actually an ADCS server by checking content
        const adcsIndicators = [
          "Microsoft Active Directory Certificate Services",
          "Certificate Services",
          "Request a certificate",
          "certsrv",
          "Certificate Template",
          "Web Enrollment"
        ];

        const isAdcsServer = adcsIndicators.some((indicator) =>
          responseText.toLowerCase().includes(indicator.toLowerCase())
        );

        if (isAdcsServer) {
          // Successfully authenticated and confirmed ADCS
          return true;
        }
      }

      if (response.status === 401) {
        throw new BadRequestError({
          message: "Authentication failed. Please verify your credentials are correct."
        });
      }

      if (response.status === 403) {
        throw new BadRequestError({
          message: "Access denied. Your account may not have permission to access ADCS web enrollment."
        });
      }
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error;
      }

      // Handle network and connection errors
      if (error instanceof Error) {
        if (error.message.includes("ENOTFOUND")) {
          throw new BadRequestError({
            message: "Cannot resolve ADCS server hostname. Please verify the URL is correct."
          });
        }
        if (error.message.includes("ECONNREFUSED")) {
          throw new BadRequestError({
            message: "Connection refused by ADCS server. Please verify the server is running and accessible."
          });
        }
        if (error.message.includes("ETIMEDOUT") || error.message.includes("timeout")) {
          throw new BadRequestError({
            message: "Connection timeout. Please verify the server is accessible and not blocked by firewall."
          });
        }
        if (error.message.includes("certificate") || error.message.includes("SSL") || error.message.includes("TLS")) {
          throw new BadRequestError({
            message: `SSL/TLS certificate error: ${error.message}. This may indicate a certificate verification failure.`
          });
        }
        if (error.message.includes("DEPTH_ZERO_SELF_SIGNED_CERT")) {
          throw new BadRequestError({
            message:
              "Self-signed certificate detected. Either provide the server's certificate or set 'sslRejectUnauthorized' to false."
          });
        }
        if (error.message.includes("UNABLE_TO_VERIFY_LEAF_SIGNATURE")) {
          throw new BadRequestError({
            message: "Unable to verify certificate signature. Please provide the correct CA certificate."
          });
        }
      }

      // Continue to next endpoint for other errors
      continue;
    }
  }

  // If we get here, no endpoint worked
  throw new BadRequestError({
    message: "Could not connect to ADCS server. Please verify the server URL and that Web Enrollment is enabled."
  });
};

// Create authenticated NTLM client for ADCS operations
const createNtlmClient = (
  username: string,
  password: string,
  baseUrl: string,
  sslRejectUnauthorized: boolean = true,
  sslCertificate?: string
) => {
  const parsedCredentials = parseCredentials(username);
  const normalizedUrl = normalizeAdcsUrl(baseUrl);

  return {
    get: async (endpoint: string, additionalHeaders: Record<string, string> = {}) => {
      const shouldRejectUnauthorized = sslRejectUnauthorized;

      const httpsAgent = createHttpsAgent(shouldRejectUnauthorized, sslCertificate);

      return axiosNtlmRequest({
        url: `${normalizedUrl}${endpoint}`,
        method: "GET",
        httpsAgent,
        headers: additionalHeaders,
        ntlm: {
          domain: parsedCredentials.domain,
          username: parsedCredentials.username,
          password
        }
      });
    },
    post: async (endpoint: string, body: string, additionalHeaders: Record<string, string> = {}) => {
      const shouldRejectUnauthorized = sslRejectUnauthorized;

      const httpsAgent = createHttpsAgent(shouldRejectUnauthorized, sslCertificate);

      return axiosNtlmRequest({
        url: `${normalizedUrl}${endpoint}`,
        method: "POST",
        httpsAgent,
        data: body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...additionalHeaders
        },
        ntlm: {
          domain: parsedCredentials.domain,
          username: parsedCredentials.username,
          password
        }
      });
    },
    baseUrl: normalizedUrl,
    credentials: parsedCredentials
  };
};

export const getAzureADCSConnectionCredentials = async (
  connectionId: string,
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById">,
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">
) => {
  const appConnection = await appConnectionDAL.findById(connectionId);

  if (!appConnection) {
    throw new NotFoundError({ message: `Connection with ID '${connectionId}' not found` });
  }

  if (appConnection.app !== AppConnection.AzureADCS) {
    throw new BadRequestError({ message: `Connection with ID '${connectionId}' is not an Azure ADCS connection` });
  }

  switch (appConnection.method) {
    case AzureADCSConnectionMethod.UsernamePassword:
      const credentials = (await decryptAppConnectionCredentials({
        orgId: appConnection.orgId,
        kmsService,
        encryptedCredentials: appConnection.encryptedCredentials
      })) as {
        username: string;
        password: string;
        adcsUrl: string;
        sslRejectUnauthorized?: boolean;
        sslCertificate?: string;
      };

      return {
        username: credentials.username,
        password: credentials.password,
        adcsUrl: credentials.adcsUrl,
        sslRejectUnauthorized: credentials.sslRejectUnauthorized ?? true,
        sslCertificate: credentials.sslCertificate
      };

    default:
      throw new BadRequestError({
        message: `Unsupported Azure ADCS connection method: ${appConnection.method}`
      });
  }
};

export const validateAzureADCSConnectionCredentials = async (appConnection: TAzureADCSConnectionConfig) => {
  const { credentials } = appConnection;

  try {
    // Parse and validate credentials
    const parsedCredentials = parseCredentials(credentials.username);
    const normalizedUrl = normalizeAdcsUrl(credentials.adcsUrl);

    // Validate URL to prevent DNS manipulation attacks and SSRF
    await blockLocalAndPrivateIpAddresses(normalizedUrl);

    // Test the connection using NTLM
    await testAdcsConnection(
      parsedCredentials,
      credentials.password,
      normalizedUrl,
      credentials.sslRejectUnauthorized ?? true,
      credentials.sslCertificate
    );

    // If we get here, authentication was successful
    return {
      username: credentials.username,
      password: credentials.password,
      adcsUrl: credentials.adcsUrl,
      sslRejectUnauthorized: credentials.sslRejectUnauthorized ?? true,
      sslCertificate: credentials.sslCertificate
    };
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    // Handle unexpected errors
    let errorMessage = "Unable to validate ADCS connection.";
    if (error instanceof Error) {
      if (error.message.includes("401") || error.message.includes("Unauthorized")) {
        errorMessage = "NTLM authentication failed. Please verify your username, password, and domain are correct.";
      } else if (error.message.includes("ENOTFOUND") || error.message.includes("ECONNREFUSED")) {
        errorMessage = "Cannot connect to the ADCS server. Please verify the server URL is correct and accessible.";
      } else if (error.message.includes("timeout")) {
        errorMessage = "Connection to ADCS server timed out. Please verify the server is accessible.";
      } else if (
        error.message.includes("certificate") ||
        error.message.includes("SSL") ||
        error.message.includes("TLS") ||
        error.message.includes("DEPTH_ZERO_SELF_SIGNED_CERT") ||
        error.message.includes("UNABLE_TO_VERIFY_LEAF_SIGNATURE")
      ) {
        errorMessage = `SSL/TLS certificate error: ${error.message}. The server certificate may be self-signed or the CA certificate may be incorrect.`;
      }
    }

    throw new BadRequestError({
      message: `Failed to validate Azure ADCS connection: ${errorMessage} Details: ${
        error instanceof Error ? error.message : "Unknown error"
      }`
    });
  }
};

export const getAzureADCSConnectionListItem = () => ({
  name: "Azure ADCS" as const,
  app: AppConnection.AzureADCS as const,
  methods: [AzureADCSConnectionMethod.UsernamePassword] as [AzureADCSConnectionMethod.UsernamePassword]
});

// Export helper functions for use in certificate ordering
export const createAdcsHttpClient = (
  username: string,
  password: string,
  baseUrl: string,
  sslRejectUnauthorized: boolean = true,
  sslCertificate?: string
) => {
  return createNtlmClient(username, password, baseUrl, sslRejectUnauthorized, sslCertificate);
};
