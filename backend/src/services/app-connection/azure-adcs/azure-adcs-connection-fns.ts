/* eslint-disable no-case-declarations, @typescript-eslint/no-unsafe-assignment, no-await-in-loop, no-continue */
// @ts-expect-error: No types available for httpntlm
import * as httpntlm from "httpntlm";

import { getConfig } from "@app/lib/config/env";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { blockLocalAndPrivateIpAddresses } from "@app/lib/validator/validate-url";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { AppConnection } from "../app-connection-enums";
import { AzureADCSConnectionMethod } from "./azure-adcs-connection-enums";
import { TAzureADCSConnectionConfig } from "./azure-adcs-connection-types";

// Type definitions for httpntlm module
interface HttpNtlmRequestOptions {
  url: string;
  username: string;
  password: string;
  domain: string;
  workstation?: string;
  method?: string;
  body?: string;
  headers?: Record<string, string>;
  rejectUnauthorized?: boolean;
}

interface HttpNtlmResponse {
  statusCode: number;
  body: string;
  headers: Record<string, string>;
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
const ntlmRequest = (options: HttpNtlmRequestOptions): Promise<HttpNtlmResponse> => {
  return new Promise((resolve, reject) => {
    const method = options.method || "GET";

    if (method.toLowerCase() === "get") {
      httpntlm.get(options, (err: Error | null, res: HttpNtlmResponse) => {
        if (err) reject(err);
        else resolve(res);
      });
    } else if (method.toLowerCase() === "post") {
      httpntlm.post(options, (err: Error | null, res: HttpNtlmResponse) => {
        if (err) reject(err);
        else resolve(res);
      });
    } else {
      reject(new Error(`Unsupported HTTP method: ${method}`));
    }
  });
};

// Test ADCS connectivity and authentication using NTLM
const testAdcsConnection = async (
  credentials: ParsedCredentials,
  password: string,
  baseUrl: string
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

      const response = await ntlmRequest({
        url: testUrl,
        username: credentials.username,
        password,
        domain: credentials.domain,
        workstation: "",
        rejectUnauthorized: !getConfig().isDevelopmentMode // Only allow unauthorized SSL in development
      });

      // Check if we got a successful response
      if (response.statusCode === 200) {
        const responseText = response.body;

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

      // Handle authentication failures
      if (response.statusCode === 401) {
        throw new BadRequestError({
          message: "Authentication failed. Please verify your username, password, and domain are correct."
        });
      }

      if (response.statusCode === 403) {
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
        if (error.message.includes("ETIMEDOUT")) {
          throw new BadRequestError({
            message: "Connection timeout. Please verify the server is accessible and not blocked by firewall."
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
const createNtlmClient = (username: string, password: string, baseUrl: string) => {
  const parsedCredentials = parseCredentials(username);
  const normalizedUrl = normalizeAdcsUrl(baseUrl);

  return {
    get: (endpoint: string, additionalOptions: Partial<HttpNtlmRequestOptions> = {}) => {
      return ntlmRequest({
        url: `${normalizedUrl}${endpoint}`,
        username: parsedCredentials.username,
        password,
        domain: parsedCredentials.domain,
        workstation: "",
        rejectUnauthorized: !getConfig().isDevelopmentMode, // Only allow unauthorized SSL in development,
        ...additionalOptions
      });
    },
    post: (endpoint: string, body: string, additionalOptions: Partial<HttpNtlmRequestOptions> = {}) => {
      return ntlmRequest({
        method: "POST",
        url: `${normalizedUrl}${endpoint}`,
        username: parsedCredentials.username,
        password,
        domain: parsedCredentials.domain,
        workstation: "",
        rejectUnauthorized: !getConfig().isDevelopmentMode, // Only allow unauthorized SSL in development,
        body,
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          ...additionalOptions.headers
        },
        ...additionalOptions
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
      })) as { username: string; password: string; adcsUrl: string };

      return {
        username: credentials.username,
        password: credentials.password,
        adcsUrl: credentials.adcsUrl
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
    await testAdcsConnection(parsedCredentials, credentials.password, normalizedUrl);

    // If we get here, authentication was successful
    return {
      username: credentials.username,
      password: credentials.password,
      adcsUrl: credentials.adcsUrl
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
        error.message.includes("TLS")
      ) {
        errorMessage = "SSL/TLS certificate error. The server certificate may be self-signed or invalid.";
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
export const createAdcsHttpClient = (username: string, password: string, baseUrl: string) => {
  return createNtlmClient(username, password, baseUrl);
};
