/* eslint-disable no-await-in-loop */
import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { TableName } from "@app/db/schemas";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { OrgServiceActor } from "@app/lib/types";
import { TAppConnectionDALFactory } from "@app/services/app-connection/app-connection-dal";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { TAppConnectionServiceFactory } from "@app/services/app-connection/app-connection-service";
import {
  createAdcsHttpClient,
  getAzureADCSConnectionCredentials
} from "@app/services/app-connection/azure-adcs/azure-adcs-connection-fns";
import { TCertificateBodyDALFactory } from "@app/services/certificate/certificate-body-dal";
import { TCertificateDALFactory } from "@app/services/certificate/certificate-dal";
import { TCertificateSecretDALFactory } from "@app/services/certificate/certificate-secret-dal";
import {
  CertExtendedKeyUsage,
  CertKeyAlgorithm,
  CertKeyUsage,
  CertStatus,
  TAltNameType
} from "@app/services/certificate/certificate-types";
import { TCertificateProfileDALFactory } from "@app/services/certificate-profile/certificate-profile-dal";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TPkiSubscriberDALFactory } from "@app/services/pki-subscriber/pki-subscriber-dal";
import { TPkiSubscriberProperties } from "@app/services/pki-subscriber/pki-subscriber-types";
import { TPkiSyncDALFactory } from "@app/services/pki-sync/pki-sync-dal";
import { TPkiSyncQueueFactory } from "@app/services/pki-sync/pki-sync-queue";
import { triggerAutoSyncForSubscriber } from "@app/services/pki-sync/pki-sync-utils";
import { TProjectDALFactory } from "@app/services/project/project-dal";
import { getProjectKmsCertificateKeyId } from "@app/services/project/project-fns";

import { TCertificateAuthorityDALFactory } from "../certificate-authority-dal";
import { CaStatus, CaType } from "../certificate-authority-enums";
import { keyAlgorithmToAlgCfg } from "../certificate-authority-fns";
import { TExternalCertificateAuthorityDALFactory } from "../external-certificate-authority-dal";
import {
  TAzureAdCsCertificateAuthority,
  TCreateAzureAdCsCertificateAuthorityDTO,
  TUpdateAzureAdCsCertificateAuthorityDTO
} from "./azure-ad-cs-certificate-authority-types";

const parseTtlToDays = (ttl: string): number => {
  const match = ttl.match(new RE2("^(\\d+)([dhm])$"));
  if (!match) {
    throw new BadRequestError({ message: `Invalid TTL format: ${ttl}` });
  }

  const [, value, unit] = match;
  const num = parseInt(value, 10);

  switch (unit) {
    case "d":
      return num;
    case "h":
      return Math.ceil(num / 24);
    case "m":
      return Math.ceil(num / (24 * 60));
    default:
      throw new BadRequestError({ message: `Invalid TTL unit: ${unit}` });
  }
};

const calculateRenewalThreshold = (
  profileRenewBeforeDays: number | undefined,
  certificateTtlInDays: number
): number | undefined => {
  if (profileRenewBeforeDays === undefined) {
    return undefined;
  }

  if (profileRenewBeforeDays >= certificateTtlInDays) {
    return Math.max(1, certificateTtlInDays - 1);
  }

  return profileRenewBeforeDays;
};

const calculateFinalRenewBeforeDays = (
  profile: { apiConfig?: { autoRenew?: boolean; renewBeforeDays?: number } } | undefined,
  ttl: string
): number | undefined => {
  const hasAutoRenewEnabled = profile?.apiConfig?.autoRenew === true;
  if (!hasAutoRenewEnabled) {
    return undefined;
  }

  const profileRenewBeforeDays = profile?.apiConfig?.renewBeforeDays;
  if (profileRenewBeforeDays !== undefined) {
    const certificateTtlInDays = parseTtlToDays(ttl);
    return calculateRenewalThreshold(profileRenewBeforeDays, certificateTtlInDays);
  }

  return undefined;
};

type TAzureAdCsCertificateAuthorityFnsDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "updateById">;
  appConnectionService: Pick<TAppConnectionServiceFactory, "validateAppConnectionUsageById">;
  certificateAuthorityDAL: Pick<
    TCertificateAuthorityDALFactory,
    "create" | "transaction" | "findByIdWithAssociatedCa" | "updateById" | "findWithAssociatedCa" | "findById"
  >;
  externalCertificateAuthorityDAL: Pick<TExternalCertificateAuthorityDALFactory, "create" | "update">;
  certificateDAL: Pick<TCertificateDALFactory, "create" | "transaction" | "updateById">;
  certificateBodyDAL: Pick<TCertificateBodyDALFactory, "create">;
  certificateSecretDAL: Pick<TCertificateSecretDALFactory, "create">;
  kmsService: Pick<
    TKmsServiceFactory,
    "encryptWithKmsKey" | "generateKmsKey" | "createCipherPairWithDataKey" | "decryptWithKmsKey"
  >;
  pkiSubscriberDAL: Pick<TPkiSubscriberDALFactory, "findById">;
  pkiSyncDAL: Pick<TPkiSyncDALFactory, "find">;
  pkiSyncQueue: Pick<TPkiSyncQueueFactory, "queuePkiSyncSyncCertificatesById">;
  projectDAL: Pick<TProjectDALFactory, "findById" | "findOne" | "updateById" | "transaction">;
  certificateProfileDAL?: Pick<TCertificateProfileDALFactory, "findById">;
};

type AzureCertificateRequest = {
  csr: string;
  template: string;
  attributes?: Record<string, string | undefined>;
};

type AzureCertificateResponse = {
  certificateId: string;
  certificate: string;
  certificateChain?: string;
  status: "issued" | "pending" | "denied";
  disposition?: string;
};

const buildSubjectDN = (commonName: string, properties?: TPkiSubscriberProperties): string => {
  // Validate and sanitize common name - it's required and cannot be empty
  if (!commonName || !commonName.trim()) {
    throw new BadRequestError({ message: "Common Name is required and cannot be empty" });
  }

  const trimmedCN = commonName.trim();

  const invalidCharsRegex = new RE2("[,=+<>#;\\\\\\]]");
  if (invalidCharsRegex.test(trimmedCN)) {
    throw new BadRequestError({
      message: "Common Name contains invalid characters: , = + < > # ; \\ ]"
    });
  }

  let subject = `CN=${trimmedCN}`;

  const validateComponent = (value: string | undefined, componentName: string): string | null => {
    if (!value || typeof value !== "string") return null;
    const trimmed = value.trim();
    if (!trimmed) return null;

    const componentInvalidCharsRegex = new RE2('[,=+<>#;\\\\"\\/\\r\\n\\t]');
    if (componentInvalidCharsRegex.test(trimmed)) {
      throw new BadRequestError({
        message: `${componentName} contains invalid characters: , = + < > # ; \\ " / \\r \\n \\t`
      });
    }

    const problematicCharsRegex = new RE2("^[\\\\s\\\\-_.]+|[\\\\s\\\\-_.]+$");
    if (problematicCharsRegex.test(trimmed)) {
      throw new BadRequestError({
        message: `${componentName} cannot start or end with spaces, hyphens, underscores, or periods`
      });
    }

    return trimmed;
  };

  const emailAddress = validateComponent(properties?.emailAddress, "Email Address");
  if (emailAddress) {
    const emailRegex = new RE2(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/);
    if (!emailRegex.test(emailAddress) || emailAddress.length <= 5 || emailAddress.length >= 64) {
      throw new BadRequestError({
        message: "Email Address must be a valid email format between 5 and 64 characters"
      });
    }
    subject += `,E=${emailAddress}`;
  }

  const organizationalUnit = validateComponent(properties?.organizationalUnit, "Organizational Unit");
  if (organizationalUnit) {
    if (organizationalUnit.length > 64) {
      throw new BadRequestError({
        message: "Organizational Unit cannot exceed 64 characters"
      });
    }
    subject += `,OU=${organizationalUnit}`;
  }

  const organization = validateComponent(properties?.organization, "Organization");
  if (organization) {
    if (organization.length > 64) {
      throw new BadRequestError({
        message: "Organization cannot exceed 64 characters"
      });
    }
    subject += `,O=${organization}`;
  }

  const locality = validateComponent(properties?.locality, "Locality");
  if (locality) {
    if (locality.length > 64) {
      throw new BadRequestError({
        message: "Locality cannot exceed 64 characters"
      });
    }
    subject += `,L=${locality}`;
  }

  const state = validateComponent(properties?.state, "State");
  if (state) {
    if (state.length > 64) {
      throw new BadRequestError({
        message: "State cannot exceed 64 characters"
      });
    }
    subject += `,ST=${state}`;
  }

  const country = validateComponent(properties?.country, "Country");
  if (country) {
    // Country code must be exactly 2 uppercase letters
    const countryCode = country.toUpperCase();
    const invalidCountryRegex = new RE2("[^A-Z]");
    if (invalidCountryRegex.test(countryCode)) {
      throw new BadRequestError({
        message: "Country must contain only uppercase letters"
      });
    }
    if (countryCode.length !== 2) {
      throw new BadRequestError({
        message: "Country must be exactly 2 characters"
      });
    }
    subject += `,C=${countryCode}`;
  }

  return subject;
};

export const castDbEntryToAzureAdCsCertificateAuthority = (
  ca: Awaited<ReturnType<TCertificateAuthorityDALFactory["findByIdWithAssociatedCa"]>>
): TAzureAdCsCertificateAuthority & { credentials: Buffer | null | undefined } => {
  if (!ca.externalCa?.id) {
    throw new BadRequestError({ message: "Malformed Active Directory Certificate Service certificate authority" });
  }

  if (!ca.externalCa.dnsAppConnectionId) {
    throw new BadRequestError({
      message: "Azure ADCS connection ID is missing from certificate authority configuration"
    });
  }

  return {
    id: ca.id,
    type: CaType.AZURE_AD_CS,
    enableDirectIssuance: ca.enableDirectIssuance,
    name: ca.name,
    projectId: ca.projectId,
    credentials: ca.externalCa.credentials,
    configuration: {
      azureAdcsConnectionId: ca.externalCa.dnsAppConnectionId
    },
    status: ca.status as CaStatus
  };
};

const submitCertificateRequest = async (
  credentials: { username: string; password: string; sslRejectUnauthorized?: boolean; sslCertificate?: string },
  caServiceUrl: string,
  certificateRequest: AzureCertificateRequest
): Promise<AzureCertificateResponse> => {
  try {
    const adcsClient = createAdcsHttpClient(
      credentials.username,
      credentials.password,
      caServiceUrl,
      credentials.sslRejectUnauthorized ?? true,
      credentials.sslCertificate
    );

    // Clean CSR by removing headers and newlines for ADCS submission
    const cleanCsr = certificateRequest.csr
      .replace(new RE2("-----BEGIN CERTIFICATE REQUEST-----", "g"), "")
      .replace(new RE2("-----END CERTIFICATE REQUEST-----", "g"), "")
      .replace(new RE2("\\\\r?\\\\n", "g"), "");

    // Build certificate attributes including template and validity period
    const certAttribParts: string[] = [];

    // Add template - this is required
    if (certificateRequest.template && certificateRequest.template.trim()) {
      certAttribParts.push(`CertificateTemplate:${certificateRequest.template.trim()}`);
    }

    // Add validity period if specified by the user
    if (certificateRequest.attributes?.validityPeriod) {
      try {
        const ttlMs = ms(certificateRequest.attributes.validityPeriod);
        const expirationDate = new Date(Date.now() + ttlMs);

        // Format expiration date in RFC 2616 format for ADCS
        const rfc2616Date = expirationDate.toUTCString();

        // Add ExpirationDate attribute (requires EDITF_ATTRIBUTEENDDATE flag on CA)
        certAttribParts.push(`ExpirationDate:${rfc2616Date}`);
      } catch (error) {
        throw new BadRequestError({
          message: "Invalid validity period format"
        });
      }
    }

    // Join all attributes with proper CRLF ending
    const certAttrib = certAttribParts.length > 0 ? `${certAttribParts.join("\r\n")}\r\n` : "";

    // Prepare form data for ADCS web interface - these parameters are required by Microsoft ADCS
    // Mode: "newreq" indicates a new certificate request
    // CertRequest: the base64-encoded CSR without headers
    // CertAttrib: certificate template and other attributes in CRLF format
    // FriendlyType: display name for the certificate type
    // TargetStoreFlags: certificate store flags (0 = default)
    // SaveCert: "yes" to save the certificate to the server
    const formData = new URLSearchParams({
      Mode: "newreq",
      CertRequest: cleanCsr,
      CertAttrib: certAttrib,
      FriendlyType: "Saved-Request Certificate",
      TargetStoreFlags: "0",
      SaveCert: "yes"
    });

    const response = await adcsClient.post("/certsrv/certfnsh.asp", formData.toString());

    const responseText = response.data;

    // Parse the HTML response to extract certificate information
    let requestId: string | undefined;
    let status: "issued" | "pending" | "denied" = "pending";
    let certificate = "";

    // Look for request ID in various formats
    const requestIdMatches = [
      new RE2("reqid[=:](\\d+)", "i"),
      new RE2("request\\s+id[:\\s]+(\\d+)", "i"),
      new RE2("certificate\\s+request\\s+(\\d+)", "i"),
      new RE2("\\breqid=(\\d+)\\b", "i"),
      new RE2("requestid[:\\s]*(\\d+)", "i")
    ];

    for (const regex of requestIdMatches) {
      const match = responseText.match(regex);
      if (match) {
        [, requestId] = match;
        break;
      }
    }

    // Check for immediate certificate issuance
    const certMatch = responseText.match(new RE2("-----BEGIN CERTIFICATE-----[\\s\\S]*?-----END CERTIFICATE-----"));
    if (certMatch) {
      // Clean up the certificate format
      certificate = certMatch[0].replace(new RE2("\\\\r\\\\n", "g"), "\n").replace(new RE2("\\\\r", "g"), "\n").trim();

      // Validate the certificate format before using it
      try {
        status = "issued";
      } catch (error) {
        certificate = "";
        status = "pending";
      }
    }

    // Check disposition message for status
    if (responseText.includes("taken under submission") || responseText.includes("pending")) {
      status = "pending";
    } else if (responseText.includes("denied") || responseText.includes("rejected")) {
      status = "denied";
    } else if (responseText.includes("issued") || certificate) {
      status = "issued";
    }

    // If we couldn't parse a request ID and don't have a certificate, something went wrong
    if (!requestId && !certificate) {
      // Check for specific error types first
      let errorMessage = "Unknown error occurred";

      // ASN.1 parsing errors (CSR format issues)
      if (
        responseText.includes("ASN1") ||
        responseText.includes("Error Parsing Request") ||
        responseText.includes("unexpected end of data") ||
        responseText.includes("bad tag value met") ||
        responseText.includes("0x80093102")
      ) {
        const asn1Patterns = [
          new RE2("Error Parsing Request\\s+ASN1[^.]*\\.?", "i"),
          new RE2("ASN1[^.]*\\.?", "i"),
          new RE2("Error Parsing Request[^.]*\\.?", "i")
        ];

        for (const pattern of asn1Patterns) {
          const match = responseText.match(pattern);
          if (match) {
            errorMessage = match[0].trim();
            break;
          }
        }

        errorMessage = `Certificate request format error: ${errorMessage}. This indicates the CSR (Certificate Signing Request) format is incompatible with ADCS.`;
      }
      // Template permission errors (policy denials)
      else if (
        responseText.includes("Denied by Policy Module") ||
        responseText.includes("0x80094800") ||
        responseText.includes("template that is not supported")
      ) {
        const policyMatch =
          responseText.match(new RE2('Denied by Policy Module[^"]*"([^"]*)')) ||
          responseText.match(new RE2('The disposition message is "([^"]*)'));

        if (policyMatch) {
          errorMessage = policyMatch[1].trim();
        }

        errorMessage = `Certificate template permission error: ${errorMessage}. Verify that the connection account has enrollment permissions for the selected certificate template.`;
      }
      // General error extraction
      else {
        const errorPatterns = [
          new RE2('The disposition message is "([^"]*)"', "i"),
          new RE2('Denied by Policy Module[^"]*"([^"]*)"', "i"),
          new RE2("<p[^>]*class[^>]*error[^>]*>(.*?)<\\/p>", "i"),
          new RE2("<div[^>]*class[^>]*error[^>]*>(.*?)<\\/div>", "i"),
          new RE2("<span[^>]*class[^>]*error[^>]*>(.*?)<\\/span>", "i"),
          new RE2("error[^<]*:([^<]*)", "i"),
          new RE2("denied[^<]*:([^<]*)", "i"),
          new RE2("The\\s+request\\s+contains\\s+no\\s+certificate\\s+template\\s+information", "i"),
          new RE2("The\\s+template\\s+is\\s+missing", "i")
        ];

        // Try each pattern to find the error message
        for (const pattern of errorPatterns) {
          const match = responseText.match(pattern);
          if (match) {
            errorMessage = match[1] ? match[1].trim() : match[0].trim();
            break;
          }
        }
      }

      // Clean up HTML entities and tags from error message
      errorMessage = errorMessage
        .replace(new RE2("&quot;", "g"), '"')
        .replace(new RE2("&lt;", "g"), "<")
        .replace(new RE2("&gt;", "g"), ">")
        .replace(new RE2("&amp;", "g"), "&")
        .replace(new RE2("<[^>]*>", "g"), "") // Remove HTML tags
        .replace(new RE2("\\r\\n", "g"), " ")
        .replace(new RE2("\\n", "g"), " ")
        .replace(new RE2("\\r", "g"), " ")
        .replace(new RE2("\\s+", "g"), " ")
        .replace(new RE2('\\s*[".]*\\s*[".]*\\s*$'), "") // Remove trailing quotes and periods
        .replace(new RE2('^\\s*[".]*\\s*'), "") // Remove leading quotes and periods
        .trim();

      // Handle specific Microsoft ADCS OID-related errors
      if (
        responseText.includes("Cannot get OID for name type") ||
        responseText.includes("OID for name type") ||
        responseText.includes("name type ''")
      ) {
        errorMessage =
          "Certificate template OID resolution error. This may be caused by: " +
          "1) Certificate template name doesn't exist or is not published, " +
          "2) ADCS OID cache needs refresh, or " +
          "3) Template permissions are insufficient. " +
          "Please verify the template exists, is published, and you have enrollment permissions.";
      } else if (responseText.includes("template") && responseText.includes("not found")) {
        errorMessage = `Certificate template not found. Please verify the template name '${certificateRequest.template}' exists and is published on the ADCS server.`;
      } else if (responseText.includes("access denied") || responseText.includes("permission")) {
        errorMessage = "Access denied. You may not have permission to request certificates with this template.";
      } else if (responseText.includes("subject") || responseText.includes("DN")) {
        errorMessage =
          "Invalid subject DN format. Please check that all subject field values contain only valid characters.";
      } else if (responseText.includes("Computer") && responseText.includes("Machine")) {
        errorMessage =
          "Computer/Machine template error. These templates may require domain-joined machines or specific subject name formats.";
      } else if (
        certificateRequest.template.toLowerCase().includes("computer") ||
        certificateRequest.template.toLowerCase().includes("machine")
      ) {
        errorMessage =
          `Template '${certificateRequest.template}' failed because it requires domain authentication and automatic enrollment. ` +
          `Computer/Machine templates are designed for domain-joined computers, not manual requests. ` +
          `Solutions: 1) Use 'User' or 'WebServer' templates instead, 2) Create a custom template based on ${certificateRequest.template} but configured for manual enrollment, ` +
          `3) Ask your ADCS administrator to modify the template to allow manual enrollment and 'Supply subject in request'.`;
      } else if (errorMessage.length < 10 || errorMessage === certificateRequest.template) {
        errorMessage = `Certificate request failed with template '${certificateRequest.template}'. This may indicate a template configuration issue, permission problem, or invalid subject information.`;
      }

      throw new BadRequestError({
        message: `Certificate request failed: ${errorMessage}`
      });
    }

    return {
      certificateId: requestId || "immediate",
      certificate,
      certificateChain: "",
      status
    };
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    if (error instanceof Error) {
      let errorMessage = `Failed to submit certificate request to ADCS: ${error.message}`;

      if (error.message.includes("401") || error.message.includes("Unauthorized")) {
        errorMessage = "Authentication failed. Please verify your username and password are correct.";
      } else if (error.message.includes("403") || error.message.includes("Forbidden")) {
        errorMessage = "Access denied. You may not have permission to request certificates with this template.";
      } else if (error.message.includes("404") || error.message.includes("Not Found")) {
        errorMessage = "ADCS endpoint not found. Please verify the ADCS URL is correct.";
      } else if (error.message.includes("ENOTFOUND")) {
        errorMessage = "Cannot connect to ADCS server. Please verify the server URL and network connectivity.";
      } else if (error.message.includes("ETIMEDOUT")) {
        errorMessage = "Request timed out. The ADCS server may be overloaded or unreachable.";
      }

      throw new BadRequestError({ message: errorMessage });
    }

    throw new BadRequestError({
      message: `Failed to submit certificate request to ADCS: ${error instanceof Error ? error.message : "Unknown error"}`
    });
  }
};

const retrieveCertificate = async (
  credentials: { username: string; password: string; sslRejectUnauthorized?: boolean; sslCertificate?: string },
  caServiceUrl: string,
  certificateId: string
): Promise<string> => {
  try {
    const adcsClient = createAdcsHttpClient(
      credentials.username,
      credentials.password,
      caServiceUrl,
      credentials.sslRejectUnauthorized ?? true,
      credentials.sslCertificate
    );

    const response = await adcsClient.get(`/certsrv/certnew.cer?ReqID=${certificateId}&Enc=b64`, {
      Accept: "application/pkix-cert,application/x-x509-ca-cert,application/octet-stream,*/*"
    });

    const certData = response.data;

    // Check if the response contains HTML indicating the certificate is not ready
    if (certData.includes("<html>") || certData.includes("taken under submission") || certData.includes("pending")) {
      throw new BadRequestError({
        message: `Certificate with ID ${certificateId} is still pending approval or processing`
      });
    }

    // If certificate is already in PEM format, return as-is
    if (certData.includes("-----BEGIN CERTIFICATE-----")) {
      return certData.trim();
    }

    // Handle base64-encoded certificate data
    let cleanCertData = certData.trim();

    // Remove any HTML artifacts or unwanted characters, keeping only base64
    cleanCertData = cleanCertData.replace(new RE2("[^A-Za-z0-9+/=\\s]", "g"), "").replace(new RE2("\\s", "g"), "");

    if (cleanCertData.length < 100) {
      throw new BadRequestError({
        message: `Certificate data appears invalid or too short (${cleanCertData.length} characters). The certificate may still be pending.`
      });
    }

    // Format as proper PEM certificate with 64 character lines
    const formattedCert = cleanCertData.replace(new RE2("(.{64})", "g"), "$1\n").trim();
    const pemCert = `-----BEGIN CERTIFICATE-----\n${formattedCert}\n-----END CERTIFICATE-----`;

    // Validate the constructed PEM before returning
    try {
      // Test parse to ensure it's valid
      const testCert = new x509.X509Certificate(pemCert);
      // If we get here, the certificate is valid
      if (testCert) {
        return pemCert;
      }
      throw new Error("Certificate validation failed");
    } catch (error) {
      throw new BadRequestError({
        message: `Failed to format certificate data from ADCS into valid PEM format: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  } catch (error) {
    if (error instanceof BadRequestError) {
      throw error;
    }

    if (error instanceof Error) {
      let errorMessage = `Failed to retrieve certificate with ID ${certificateId} from ADCS: ${error.message}`;

      if (error.message.includes("404") || error.message.includes("Not Found")) {
        errorMessage = `Certificate with ID ${certificateId} not found. It may have been rejected or the ID is invalid.`;
      } else if (error.message.includes("401") || error.message.includes("Unauthorized")) {
        errorMessage = "Authentication failed while retrieving certificate. Please verify your credentials.";
      } else if (error.message.includes("403") || error.message.includes("Forbidden")) {
        errorMessage =
          "Access denied while retrieving certificate. You may not have permission to access this certificate.";
      } else if (error.message.includes("ETIMEDOUT")) {
        errorMessage = "Timeout while retrieving certificate. The ADCS server may be overloaded.";
      }

      throw new BadRequestError({ message: errorMessage });
    }

    throw new BadRequestError({
      message: `Failed to retrieve certificate with ID ${certificateId} from ADCS: ${error instanceof Error ? error.message : "Unknown error"}`
    });
  }
};

export const AzureAdCsCertificateAuthorityFns = ({
  appConnectionDAL,
  appConnectionService,
  certificateAuthorityDAL,
  externalCertificateAuthorityDAL,
  certificateDAL,
  certificateBodyDAL,
  certificateSecretDAL,
  kmsService,
  projectDAL,
  pkiSubscriberDAL,
  pkiSyncDAL,
  pkiSyncQueue,
  certificateProfileDAL
}: TAzureAdCsCertificateAuthorityFnsDeps) => {
  const createCertificateAuthority = async ({
    name,
    projectId,
    configuration,
    actor,
    status
  }: {
    status: CaStatus;
    name: string;
    projectId: string;
    configuration: TCreateAzureAdCsCertificateAuthorityDTO["configuration"];
    actor: OrgServiceActor;
  }) => {
    const { azureAdcsConnectionId } = configuration;
    const appConnection = await appConnectionDAL.findById(azureAdcsConnectionId);

    if (!appConnection) {
      throw new NotFoundError({ message: `App connection with ID '${azureAdcsConnectionId}' not found` });
    }

    if (appConnection.app !== AppConnection.AzureADCS) {
      throw new BadRequestError({
        message: `App connection with ID '${azureAdcsConnectionId}' is not an Azure ADCS connection`
      });
    }

    await appConnectionService.validateAppConnectionUsageById(
      appConnection.app as AppConnection,
      { connectionId: azureAdcsConnectionId, projectId },
      actor
    );

    const caEntity = await certificateAuthorityDAL.transaction(async (tx) => {
      try {
        const ca = await certificateAuthorityDAL.create(
          {
            projectId,
            enableDirectIssuance: false, // Always false for Azure ADCS CAs
            name,
            status
          },
          tx
        );

        await externalCertificateAuthorityDAL.create(
          {
            caId: ca.id,
            dnsAppConnectionId: azureAdcsConnectionId,
            type: CaType.AZURE_AD_CS,
            configuration: {}
          },
          tx
        );

        return await certificateAuthorityDAL.findByIdWithAssociatedCa(ca.id, tx);
      } catch (error) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        if ((error as any)?.error?.code === "23505") {
          throw new BadRequestError({
            message: "Certificate authority with the same name already exists in your project"
          });
        }
        throw error;
      }
    });

    if (!caEntity.externalCa?.id) {
      throw new BadRequestError({ message: "Failed to create external certificate authority" });
    }

    return castDbEntryToAzureAdCsCertificateAuthority(caEntity);
  };

  const updateCertificateAuthority = async ({
    id,
    status,
    configuration,
    actor,
    name
  }: {
    id: string;
    status?: CaStatus;
    configuration: TUpdateAzureAdCsCertificateAuthorityDTO["configuration"];
    actor: OrgServiceActor;
    name?: string;
  }) => {
    const updatedCa = await certificateAuthorityDAL.transaction(async (tx) => {
      if (configuration) {
        const { azureAdcsConnectionId } = configuration;
        const appConnection = await appConnectionDAL.findById(azureAdcsConnectionId);

        if (!appConnection) {
          throw new NotFoundError({ message: `App connection with ID '${azureAdcsConnectionId}' not found` });
        }

        if (appConnection.app !== AppConnection.AzureADCS) {
          throw new BadRequestError({
            message: `App connection with ID '${azureAdcsConnectionId}' is not an Azure ADCS connection`
          });
        }

        const ca = await certificateAuthorityDAL.findById(id);

        if (!ca) {
          throw new NotFoundError({ message: `Could not find Certificate Authority with ID "${id}"` });
        }

        await appConnectionService.validateAppConnectionUsageById(
          appConnection.app as AppConnection,
          { connectionId: azureAdcsConnectionId, projectId: ca.projectId },
          actor
        );

        await externalCertificateAuthorityDAL.update(
          {
            caId: id,
            type: CaType.AZURE_AD_CS
          },
          {
            appConnectionId: azureAdcsConnectionId,
            configuration: {}
          },
          tx
        );
      }

      if (name || status) {
        await certificateAuthorityDAL.updateById(
          id,
          {
            name,
            status
          },
          tx
        );
      }

      return certificateAuthorityDAL.findByIdWithAssociatedCa(id, tx);
    });

    if (!updatedCa.externalCa?.id) {
      throw new BadRequestError({ message: "Failed to update external certificate authority" });
    }

    return castDbEntryToAzureAdCsCertificateAuthority(updatedCa);
  };

  const listCertificateAuthorities = async ({ projectId }: { projectId: string }) => {
    const cas = await certificateAuthorityDAL.findWithAssociatedCa({
      [`${TableName.CertificateAuthority}.projectId` as "projectId"]: projectId,
      [`${TableName.ExternalCertificateAuthority}.type` as "type"]: CaType.AZURE_AD_CS
    });

    return cas.map(castDbEntryToAzureAdCsCertificateAuthority);
  };

  const orderSubscriberCertificate = async (subscriberId: string) => {
    const subscriber = await pkiSubscriberDAL.findById(subscriberId);
    if (!subscriber.caId) {
      throw new BadRequestError({ message: "Subscriber does not have a CA" });
    }

    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(subscriber.caId);
    if (!ca.externalCa || ca.externalCa.type !== CaType.AZURE_AD_CS) {
      throw new BadRequestError({ message: "CA is not an Active Directory Certificate Service CA" });
    }

    const azureCa = castDbEntryToAzureAdCsCertificateAuthority(ca);
    if (azureCa.status !== CaStatus.ACTIVE) {
      throw new BadRequestError({ message: "CA is disabled" });
    }

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    // Get credentials from the Azure ADCS connection
    const { username, password, adcsUrl, sslRejectUnauthorized, sslCertificate } =
      await getAzureADCSConnectionCredentials(
        azureCa.configuration.azureAdcsConnectionId,
        appConnectionDAL,
        kmsService
      );

    const credentials: {
      username: string;
      password: string;
      sslRejectUnauthorized?: boolean;
      sslCertificate?: string;
    } = {
      username,
      password,
      sslRejectUnauthorized,
      sslCertificate
    };

    const alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
    const leafKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
    const skLeaf = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

    const subjectDN = buildSubjectDN(
      subscriber.commonName,
      subscriber.properties as TPkiSubscriberProperties | undefined
    );

    const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
      name: subjectDN,
      keys: leafKeys,
      signingAlgorithm: alg
    });

    const csrPem = csrObj.toString("pem");

    const properties = subscriber.properties as TPkiSubscriberProperties | undefined;
    const azureTemplateType = properties?.azureTemplateType;
    if (!azureTemplateType || typeof azureTemplateType !== "string") {
      throw new BadRequestError({
        message: "Subscriber must have an Azure certificate template configured for Azure ADCS CA"
      });
    }

    const templateInput = azureTemplateType.trim();
    if (!templateInput || templateInput.length === 0) {
      throw new BadRequestError({
        message: "Certificate template name cannot be empty"
      });
    }

    const templateValue = templateInput;

    const certificateRequest: AzureCertificateRequest = {
      csr: csrPem,
      template: templateValue,
      attributes: {
        subject: buildSubjectDN(subscriber.commonName, subscriber.properties as TPkiSubscriberProperties | undefined),
        subjectAlternativeName: subscriber.subjectAlternativeNames.join(","),
        ...(subscriber.ttl && { validityPeriod: subscriber.ttl })
      }
    };

    // Add retry logic for OID caching issues
    let submissionResponse;
    const maxOidRetries = 3;
    let oidRetryCount = 0;

    while (oidRetryCount <= maxOidRetries) {
      try {
        submissionResponse = await submitCertificateRequest(credentials, adcsUrl, certificateRequest);
        break; // Success, exit retry loop
      } catch (error) {
        const isOidError =
          error instanceof BadRequestError &&
          (error.message.includes("OID resolution error") || error.message.includes("Cannot get OID for name type"));

        if (isOidError && oidRetryCount < maxOidRetries) {
          oidRetryCount += 1;

          // Wait before retry with increasing delays: 3s, 6s, 9s
          const delay = 3000 * oidRetryCount;
          await new Promise((resolve) => {
            setTimeout(resolve, delay);
          });
          // eslint-disable-next-line no-continue
          continue;
        }

        // If not an OID error or we've exhausted retries, re-throw the error
        throw error;
      }
    }

    if (!submissionResponse) {
      throw new BadRequestError({
        message: "Failed to submit certificate request after multiple attempts due to OID resolution issues"
      });
    }

    // Handle both "issued" and "pending" status - ADCS may auto-approve or require manual approval
    if (submissionResponse.status === "denied") {
      throw new BadRequestError({ message: "Certificate request was denied by ADCS" });
    }

    let certificatePem = "";

    if (submissionResponse.status === "issued" && submissionResponse.certificate) {
      certificatePem = submissionResponse.certificate;
    } else {
      // For pending certificates, implement a retry mechanism with exponential backoff
      const maxRetries = 5;
      const initialDelay = 2000; // 2 seconds
      let retryCount = 0;
      let lastError: Error | null = null;

      // eslint-disable-next-line no-await-in-loop
      while (retryCount < maxRetries) {
        try {
          // eslint-disable-next-line no-await-in-loop
          certificatePem = await retrieveCertificate(credentials, adcsUrl, submissionResponse.certificateId);
          break; // Success, exit retry loop
        } catch (error) {
          lastError = error as Error;
          // eslint-disable-next-line no-plusplus
          retryCount++;

          if (retryCount < maxRetries) {
            // Wait with exponential backoff: 2s, 4s, 8s, 16s, 32s
            const delay = initialDelay * 2 ** (retryCount - 1);
            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => {
              setTimeout(resolve, delay);
            });
          }
        }
      }

      if (retryCount === maxRetries) {
        throw new BadRequestError({
          message: `Certificate request submitted with ID ${submissionResponse.certificateId} but failed to retrieve after ${maxRetries} attempts. The certificate may still be pending approval or processing. Last error: ${lastError?.message || "Unknown error"}.`
        });
      }
    }

    // Ensure we have a valid certificate before proceeding
    if (!certificatePem) {
      throw new BadRequestError({
        message: "Failed to obtain certificate from ADCS. The certificate may still be pending processing."
      });
    }

    // Clean and validate the certificate PEM format
    let cleanedCertificatePem = certificatePem.trim();

    // Ensure proper PEM format
    if (!cleanedCertificatePem.includes("-----BEGIN CERTIFICATE-----")) {
      throw new BadRequestError({
        message: "Invalid certificate format received from ADCS. Expected PEM format."
      });
    }

    // Remove any extra whitespace and ensure proper line endings
    cleanedCertificatePem = cleanedCertificatePem
      .replace(new RE2("\\r\\n", "g"), "\n")
      .replace(new RE2("\\r", "g"), "\n")
      .trim();

    // Validate that we have both begin and end markers
    if (!cleanedCertificatePem.includes("-----END CERTIFICATE-----")) {
      throw new BadRequestError({
        message: "Invalid certificate format received from ADCS. Missing end marker."
      });
    }

    let certObj: x509.X509Certificate;
    try {
      certObj = new x509.X509Certificate(cleanedCertificatePem);
    } catch (error) {
      throw new BadRequestError({
        message: `Failed to parse certificate from ADCS: ${error instanceof Error ? error.message : "Unknown error"}. Certificate data may be corrupted.`
      });
    }

    const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(certObj.rawData))
    });

    const certificateChainPem = submissionResponse.certificateChain || "";

    const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
      plainText: Buffer.from(certificateChainPem)
    });

    const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({
      plainText: Buffer.from(skLeaf)
    });

    await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: ca.id,
          pkiSubscriberId: subscriber.id,
          status: CertStatus.ACTIVE,
          friendlyName: subscriber.commonName,
          commonName: subscriber.commonName,
          altNames: subscriber.subjectAlternativeNames.join(","),
          serialNumber: certObj.serialNumber,
          notBefore: certObj.notBefore,
          notAfter: certObj.notAfter,
          keyUsages: subscriber.keyUsages as CertKeyUsage[],
          extendedKeyUsages: subscriber.extendedKeyUsages as CertExtendedKeyUsage[],
          projectId: ca.projectId
        },
        tx
      );

      await certificateBodyDAL.create(
        {
          certId: cert.id,
          encryptedCertificate,
          encryptedCertificateChain
        },
        tx
      );

      await certificateSecretDAL.create(
        {
          certId: cert.id,
          encryptedPrivateKey
        },
        tx
      );
    });

    await triggerAutoSyncForSubscriber(subscriber.id, { pkiSyncDAL, pkiSyncQueue });

    return {
      certificate: certificatePem,
      certificateChain: certificateChainPem,
      privateKey: skLeaf,
      serialNumber: certObj.serialNumber,
      ca: azureCa,
      subscriber
    };
  };

  const orderCertificateFromProfile = async ({
    caId,
    profileId,
    commonName,
    altNames = [],
    keyUsages = [],
    extendedKeyUsages = [],
    template,
    validity,
    notBefore,
    notAfter,
    signatureAlgorithm,
    keyAlgorithm = CertKeyAlgorithm.RSA_2048,
    isRenewal,
    originalCertificateId
  }: {
    caId: string;
    profileId: string;
    commonName: string;
    altNames?: string[];
    keyUsages?: CertKeyUsage[];
    extendedKeyUsages?: CertExtendedKeyUsage[];
    template?: string;
    validity: { ttl: string };
    notBefore?: Date;
    notAfter?: Date;
    signatureAlgorithm?: string;
    keyAlgorithm?: CertKeyAlgorithm;
    isRenewal?: boolean;
    originalCertificateId?: string;
  }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca.externalCa || ca.externalCa.type !== CaType.AZURE_AD_CS) {
      throw new BadRequestError({ message: "CA is not an Active Directory Certificate Service CA" });
    }

    const azureCa = castDbEntryToAzureAdCsCertificateAuthority(ca);
    if (azureCa.status !== CaStatus.ACTIVE) {
      throw new BadRequestError({ message: "CA is disabled" });
    }

    const certificateManagerKmsId = await getProjectKmsCertificateKeyId({
      projectId: ca.projectId,
      projectDAL,
      kmsService
    });

    const kmsEncryptor = await kmsService.encryptWithKmsKey({
      kmsId: certificateManagerKmsId
    });

    const { username, password, adcsUrl, sslRejectUnauthorized, sslCertificate } =
      await getAzureADCSConnectionCredentials(
        azureCa.configuration.azureAdcsConnectionId,
        appConnectionDAL,
        kmsService
      );

    const credentials: {
      username: string;
      password: string;
      sslRejectUnauthorized?: boolean;
      sslCertificate?: string;
    } = {
      username,
      password,
      sslRejectUnauthorized,
      sslCertificate
    };

    let alg;
    if (signatureAlgorithm) {
      switch (signatureAlgorithm.toUpperCase()) {
        case "RSA-SHA256":
        case "SHA256WITHRSA":
          alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_2048);
          break;
        case "RSA-SHA384":
        case "SHA384WITHRSA":
          alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_3072);
          break;
        case "RSA-SHA512":
        case "SHA512WITHRSA":
          alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.RSA_4096);
          break;
        case "ECDSA-SHA256":
        case "SHA256WITHECDSA":
          alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.ECDSA_P256);
          break;
        case "ECDSA-SHA384":
        case "SHA384WITHECDSA":
          alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.ECDSA_P384);
          break;
        case "ECDSA-SHA512":
        case "SHA512WITHECDSA":
          alg = keyAlgorithmToAlgCfg(CertKeyAlgorithm.ECDSA_P521);
          break;
        default:
          alg = keyAlgorithmToAlgCfg(keyAlgorithm);
          break;
      }
    } else {
      alg = keyAlgorithmToAlgCfg(keyAlgorithm);
    }

    const leafKeys = await crypto.nativeCrypto.subtle.generateKey(alg, true, ["sign", "verify"]);
    const skLeafObj = crypto.nativeCrypto.KeyObject.from(leafKeys.privateKey);
    const skLeaf = skLeafObj.export({ format: "pem", type: "pkcs8" }) as string;

    const subjectDN = buildSubjectDN(commonName);

    let sanExtension = "";
    if (altNames && altNames.length > 0) {
      sanExtension = altNames.join(",");
    }

    const csrObj = await x509.Pkcs10CertificateRequestGenerator.create({
      name: subjectDN,
      keys: leafKeys,
      signingAlgorithm: alg,
      ...(sanExtension && {
        extensions: [
          new x509.SubjectAlternativeNameExtension(
            altNames.map((name) => ({ type: "dns" as TAltNameType, value: name })),
            false
          )
        ]
      })
    });

    const csrPem = csrObj.toString("pem");

    let templateValue = template;
    if (!templateValue) {
      templateValue = "WebServer";
    }

    const templateInput = templateValue.trim();
    if (!templateInput || templateInput.length === 0) {
      throw new BadRequestError({
        message: "Certificate template name cannot be empty"
      });
    }

    let validityPeriod: string | undefined;
    if (notBefore && notAfter) {
      if (notAfter <= notBefore) {
        throw new BadRequestError({
          message: "Certificate notAfter date must be after notBefore date"
        });
      }

      const diffMs = notAfter.getTime() - notBefore.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      validityPeriod = `${diffDays}d`;
    } else if (notAfter) {
      const diffMs = notAfter.getTime() - Date.now();
      if (diffMs <= 0) {
        throw new BadRequestError({
          message: "Certificate notAfter date must be in the future"
        });
      }
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      validityPeriod = `${diffDays}d`;
    } else if (validity.ttl) {
      validityPeriod = validity.ttl;
    }

    const certificateRequest: AzureCertificateRequest = {
      csr: csrPem,
      template: templateInput,
      attributes: {
        subject: subjectDN,
        ...(sanExtension && { subjectAlternativeName: sanExtension }),
        ...(validityPeriod && { validityPeriod })
      }
    };

    let submissionResponse;
    const maxOidRetries = 3;
    let oidRetryCount = 0;

    while (oidRetryCount <= maxOidRetries) {
      try {
        submissionResponse = await submitCertificateRequest(credentials, adcsUrl, certificateRequest);
        break;
      } catch (error) {
        const isOidError =
          error instanceof BadRequestError &&
          (error.message.includes("OID resolution error") || error.message.includes("Cannot get OID for name type"));

        if (isOidError && oidRetryCount < maxOidRetries) {
          oidRetryCount += 1;

          const delay = 3000 * oidRetryCount;
          await new Promise((resolve) => {
            setTimeout(resolve, delay);
          });
          // eslint-disable-next-line no-continue
          continue;
        }

        throw error;
      }
    }

    if (!submissionResponse) {
      throw new BadRequestError({
        message: "Failed to submit certificate request after multiple attempts due to OID resolution issues"
      });
    }

    if (submissionResponse.status === "denied") {
      throw new BadRequestError({ message: "Certificate request was denied by ADCS" });
    }

    let certificatePem = "";

    if (submissionResponse.status === "issued" && submissionResponse.certificate) {
      certificatePem = submissionResponse.certificate;
    } else {
      const maxRetries = 5;
      const initialDelay = 2000;
      let retryCount = 0;
      let lastError: Error | null = null;

      // eslint-disable-next-line no-await-in-loop
      while (retryCount < maxRetries) {
        try {
          // eslint-disable-next-line no-await-in-loop
          certificatePem = await retrieveCertificate(credentials, adcsUrl, submissionResponse.certificateId);
          break;
        } catch (error) {
          lastError = error as Error;
          // eslint-disable-next-line no-plusplus
          retryCount++;

          if (retryCount < maxRetries) {
            // Wait with exponential backoff: 2s, 4s, 8s, 16s, 32s
            const delay = initialDelay * 2 ** (retryCount - 1);
            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => {
              setTimeout(resolve, delay);
            });
          }
        }
      }

      if (retryCount === maxRetries) {
        throw new BadRequestError({
          message: `Certificate request submitted with ID ${submissionResponse.certificateId} but failed to retrieve after ${maxRetries} attempts. The certificate may still be pending approval or processing. Last error: ${lastError?.message || "Unknown error"}.`
        });
      }
    }

    if (!certificatePem) {
      throw new BadRequestError({
        message: "Failed to obtain certificate from ADCS. The certificate may still be pending processing."
      });
    }

    let cleanedCertificatePem = certificatePem.trim();

    if (!cleanedCertificatePem.includes("-----BEGIN CERTIFICATE-----")) {
      throw new BadRequestError({
        message: "Invalid certificate format received from ADCS. Expected PEM format."
      });
    }

    cleanedCertificatePem = cleanedCertificatePem
      .replace(new RE2("\\r\\n", "g"), "\n")
      .replace(new RE2("\\r", "g"), "\n")
      .trim();

    if (!cleanedCertificatePem.includes("-----END CERTIFICATE-----")) {
      throw new BadRequestError({
        message: "Invalid certificate format received from ADCS. Missing end marker."
      });
    }

    let certObj: x509.X509Certificate;
    try {
      certObj = new x509.X509Certificate(cleanedCertificatePem);
    } catch (error) {
      throw new BadRequestError({
        message: `Failed to parse certificate from ADCS: ${error instanceof Error ? error.message : "Unknown error"}. Certificate data may be corrupted.`
      });
    }

    const { cipherTextBlob: encryptedCertificate } = await kmsEncryptor({
      plainText: Buffer.from(new Uint8Array(certObj.rawData))
    });

    const certificateChainPem = submissionResponse.certificateChain || "";

    const { cipherTextBlob: encryptedCertificateChain } = await kmsEncryptor({
      plainText: Buffer.from(certificateChainPem)
    });

    const { cipherTextBlob: encryptedPrivateKey } = await kmsEncryptor({
      plainText: Buffer.from(skLeaf)
    });

    let certificateId: string;

    await certificateDAL.transaction(async (tx) => {
      const cert = await certificateDAL.create(
        {
          caId: ca.id,
          profileId,
          status: CertStatus.ACTIVE,
          friendlyName: commonName,
          commonName,
          altNames: altNames.join(","),
          serialNumber: certObj.serialNumber,
          notBefore: certObj.notBefore,
          notAfter: certObj.notAfter,
          keyUsages,
          extendedKeyUsages,
          keyAlgorithm,
          signatureAlgorithm,
          projectId: ca.projectId,
          renewedFromCertificateId: isRenewal && originalCertificateId ? originalCertificateId : null
        },
        tx
      );

      certificateId = cert.id;

      if (isRenewal && originalCertificateId) {
        await certificateDAL.updateById(originalCertificateId, { renewedByCertificateId: cert.id }, tx);
      }

      await certificateBodyDAL.create(
        {
          certId: cert.id,
          encryptedCertificate,
          encryptedCertificateChain
        },
        tx
      );

      await certificateSecretDAL.create(
        {
          certId: cert.id,
          encryptedPrivateKey
        },
        tx
      );

      if (profileId && validity?.ttl && certificateProfileDAL) {
        const profile = await certificateProfileDAL.findById(profileId, tx);
        if (profile) {
          const finalRenewBeforeDays = calculateFinalRenewBeforeDays(undefined, validity.ttl);

          if (finalRenewBeforeDays !== undefined) {
            await certificateDAL.updateById(
              cert.id,
              {
                renewBeforeDays: finalRenewBeforeDays
              },
              tx
            );
          }
        }
      }
    });

    return {
      certificate: cleanedCertificatePem,
      certificateChain: certificateChainPem,
      privateKey: skLeaf,
      serialNumber: certObj.serialNumber,
      certificateId: certificateId!,
      ca: azureCa
    };
  };

  const getTemplates = async ({ caId, projectId }: { caId: string; projectId: string }) => {
    const ca = await certificateAuthorityDAL.findByIdWithAssociatedCa(caId);
    if (!ca || ca.projectId !== projectId) {
      throw new NotFoundError({ message: "Certificate Authority not found" });
    }

    const azureCa = castDbEntryToAzureAdCsCertificateAuthority(ca);
    const { azureAdcsConnectionId } = azureCa.configuration;

    const appConnection = await appConnectionDAL.findById(azureAdcsConnectionId);
    if (!appConnection) {
      throw new NotFoundError({ message: `App connection with ID '${azureAdcsConnectionId}' not found` });
    }

    // Get credentials from the Azure ADCS connection
    const { username, password, adcsUrl, sslRejectUnauthorized, sslCertificate } =
      await getAzureADCSConnectionCredentials(azureAdcsConnectionId, appConnectionDAL, kmsService);

    const credentials: {
      username: string;
      password: string;
      sslRejectUnauthorized?: boolean;
      sslCertificate?: string;
    } = {
      username,
      password,
      sslRejectUnauthorized,
      sslCertificate
    };

    const client = createAdcsHttpClient(
      credentials.username,
      credentials.password,
      adcsUrl,
      credentials.sslRejectUnauthorized ?? true,
      credentials.sslCertificate
    );

    try {
      // Get available templates from ADCS web interface and filter to only usable ones
      let availableTemplates: Array<{ id: string; name: string; description: string }> = [];

      try {
        const requestFormResponse = await client.get("/certsrv/certrqxt.asp");
        const responseText = requestFormResponse.data;

        // ADCS returns JavaScript-based template info instead of HTML options
        // Look for patterns like: getTemplateStringInfo(CTINFO_INDEX_REALNAME, null) and sRealName assignments
        const parsedTemplates: Array<{ id: string; name: string }> = [];

        // Extract template names from JavaScript variable assignments like sRealName="WebServer"
        const nameRegex = new RE2('sRealName\\s*=\\s*"([^"]+)"', "gi");
        const names: string[] = [];
        let nameMatch = nameRegex.exec(responseText);
        while (nameMatch !== null) {
          names.push(nameMatch[1]);
          nameMatch = nameRegex.exec(responseText);
        }

        // Extract template IDs/values from encoded strings or other patterns
        const valueRegex = new RE2('CertificateTemplate\\s*\\+\\s*"([^"]+)"', "gi");
        const values: string[] = [];
        let valueMatch = valueRegex.exec(responseText);
        while (valueMatch !== null) {
          values.push(valueMatch[1]);
          valueMatch = valueRegex.exec(responseText);
        }

        // Also look for any remaining HTML option patterns as fallback
        const optionRegex = new RE2('<option[^>]+value="([^"]*)"[^>]*>([^<]*)</option>', "gi");
        let optionMatch = optionRegex.exec(responseText);
        while (optionMatch !== null) {
          const templateValue = optionMatch[1].trim();
          const templateDisplayName = optionMatch[2].trim();

          if (
            templateValue &&
            templateDisplayName &&
            templateValue !== "" &&
            templateValue !== "0" &&
            !templateDisplayName.toLowerCase().includes("select")
          ) {
            // Parse the encoded template value format: "E;User;1;1;41;16;-1509949440;0;..."
            // The template ID is the second semicolon-delimited value
            const templateParts = templateValue.split(";");
            const templateId = templateParts.length >= 2 ? templateParts[1] : templateDisplayName;

            parsedTemplates.push({
              id: templateId,
              name: templateDisplayName
            });
          }
          optionMatch = optionRegex.exec(responseText);
        }

        // Combine JavaScript-extracted names with any found values
        if (names.length > 0) {
          names.forEach((name) => {
            parsedTemplates.push({
              id: name,
              name
            });
          });
        }

        // If we successfully parsed templates, use them; otherwise fall back to common ones
        if (parsedTemplates.length > 0) {
          availableTemplates = parsedTemplates.map((template) => ({
            id: template.id,
            name: template.name,
            description: `Certificate template: ${template.name}`
          }));
        } else {
          // Fallback to known working templates
          availableTemplates = [
            { id: "User", name: "User", description: "User authentication certificate" },
            { id: "WebServer", name: "Web Server", description: "Web server certificate" }
          ];
        }
      } catch (requestError) {
        // Fallback to known working templates if we can't parse the form
        availableTemplates = [
          { id: "User", name: "User", description: "User authentication certificate" },
          { id: "WebServer", name: "Web Server", description: "Web server certificate" }
        ];
      }

      // Return all available templates - let user decide what to use
      return availableTemplates;
    } catch (error) {
      throw new BadRequestError({ message: "Failed to retrieve certificate templates from Azure ADCS" });
    }
  };

  return {
    createCertificateAuthority,
    updateCertificateAuthority,
    listCertificateAuthorities,
    orderSubscriberCertificate,
    orderCertificateFromProfile,
    getTemplates
  };
};
