/* eslint-disable no-continue, no-await-in-loop */
import * as x509 from "@peculiar/x509";
import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { ms } from "@app/lib/ms";
import { createAdcsHttpClient } from "@app/services/app-connection/azure-adcs/azure-adcs-connection-fns";

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 60;

/**
 * Fetch the issuing CA certificate from ADCS web enrollment.
 * Uses the /certsrv/certnew.cer endpoint which returns an X.509 certificate,
 * NOT the .p7b endpoint which returns a PKCS#7 container that cannot be
 * parsed as individual X.509 certs.
 */
const fetchAdcsCaChain = async (adcsClient: ReturnType<typeof createAdcsHttpClient>): Promise<string> => {
  const caCertResponse = await adcsClient.get("/certsrv/certnew.cer?ReqID=CACert&Renewal=0&Enc=b64", {
    Accept: "application/pkix-cert,application/x-x509-ca-cert,*/*"
  });

  const caCertData: string = caCertResponse.data;

  // Already PEM-formatted
  if (caCertData.includes("-----BEGIN CERTIFICATE-----")) {
    const pemCert = caCertData.trim();
    // Validate it's actually parseable as X.509
    const parsed = new x509.X509Certificate(pemCert);
    if (!parsed) throw new BadRequestError({ message: "Failed to parse CA certificate from ADCS" });
    return pemCert;
  }

  // Raw base64 — convert to PEM
  let cleanData = caCertData.trim();
  cleanData = cleanData.replace(new RE2("[^A-Za-z0-9+/=\\s]", "g"), "").replace(new RE2("\\s", "g"), "");

  if (cleanData.length < 100) {
    throw new BadRequestError({ message: "Failed to retrieve CA certificate from ADCS: response too short" });
  }

  const formatted = cleanData.replace(new RE2("(.{64})", "g"), "$1\n").trim();
  const pemCert = `-----BEGIN CERTIFICATE-----\n${formatted}\n-----END CERTIFICATE-----`;

  // Validate it's actually parseable as X.509
  const parsed = new x509.X509Certificate(pemCert);
  if (!parsed) throw new BadRequestError({ message: "Failed to parse CA certificate from ADCS" });

  return pemCert;
};

export const submitCsrToAdcs = async (params: {
  credentials: { username: string; password: string; sslRejectUnauthorized?: boolean; sslCertificate?: string };
  adcsUrl: string;
  csr: string;
  template: string;
  validityPeriod?: string;
}): Promise<{ certificate: string; certificateChain: string }> => {
  const { credentials, adcsUrl, csr, template, validityPeriod } = params;

  const adcsClient = createAdcsHttpClient(
    credentials.username,
    credentials.password,
    adcsUrl,
    credentials.sslRejectUnauthorized ?? true,
    credentials.sslCertificate
  );

  // Clean CSR by removing headers and newlines for ADCS submission
  const cleanCsr = csr
    .replace(new RE2("-----BEGIN CERTIFICATE REQUEST-----", "g"), "")
    .replace(new RE2("-----END CERTIFICATE REQUEST-----", "g"), "")
    .replace(new RE2("\\r?\\n", "g"), "");

  // Build certificate attributes
  const certAttribParts: string[] = [];

  certAttribParts.push(`CertificateTemplate:${template.trim()}`);

  if (validityPeriod) {
    try {
      const ttlMs = ms(validityPeriod);
      const expirationDate = new Date(Date.now() + ttlMs);
      const rfc2616Date = expirationDate.toUTCString();
      certAttribParts.push(`ExpirationDate:${rfc2616Date}`);
    } catch {
      throw new BadRequestError({ message: "Invalid validity period format" });
    }
  }

  const certAttrib = certAttribParts.length > 0 ? `${certAttribParts.join("\r\n")}\r\n` : "";

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

  // Parse request ID
  let requestId: string | undefined;
  let status: "issued" | "pending" | "denied" = "pending";
  let certificate = "";

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
    certificate = certMatch[0].replace(new RE2("\\\\r\\\\n", "g"), "\n").replace(new RE2("\\\\r", "g"), "\n").trim();
    status = "issued";
  }

  // Check disposition message
  if (responseText.includes("taken under submission") || responseText.includes("pending")) {
    status = "pending";
  } else if (responseText.includes("denied") || responseText.includes("rejected")) {
    status = "denied";
  } else if (responseText.includes("issued") || certificate) {
    status = "issued";
  }

  if (status === "denied") {
    throw new BadRequestError({ message: "Certificate request was denied by ADCS" });
  }

  if (status === "issued" && certificate) {
    const certificateChain = await fetchAdcsCaChain(adcsClient);
    return { certificate, certificateChain };
  }

  // If pending, poll for the certificate
  if (!requestId) {
    throw new BadRequestError({
      message: "Certificate request failed: could not parse request ID or certificate from ADCS response"
    });
  }

  logger.info({ requestId }, "ADCS certificate request pending, polling for completion");

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });

    try {
      const certResponse = await adcsClient.get(`/certsrv/certnew.cer?ReqID=${requestId}&Enc=b64`, {
        Accept: "application/pkix-cert,application/x-x509-ca-cert,application/octet-stream,*/*"
      });

      const certData = certResponse.data;

      // Still pending
      if (certData.includes("<html>") || certData.includes("taken under submission") || certData.includes("pending")) {
        continue;
      }

      // Certificate in PEM format
      if (certData.includes("-----BEGIN CERTIFICATE-----")) {
        const polledCert = certData.trim();
        const certificateChain = await fetchAdcsCaChain(adcsClient);
        return { certificate: polledCert, certificateChain };
      }

      // Handle base64-encoded certificate data
      let cleanCertData = certData.trim();
      cleanCertData = cleanCertData.replace(new RE2("[^A-Za-z0-9+/=\\s]", "g"), "").replace(new RE2("\\s", "g"), "");

      if (cleanCertData.length < 100) {
        continue;
      }

      const formattedCert = cleanCertData.replace(new RE2("(.{64})", "g"), "$1\n").trim();
      const pemCert = `-----BEGIN CERTIFICATE-----\n${formattedCert}\n-----END CERTIFICATE-----`;

      // Validate the PEM
      const testCert = new x509.X509Certificate(pemCert);
      if (testCert) {
        const certificateChain = await fetchAdcsCaChain(adcsClient);
        return { certificate: pemCert, certificateChain };
      }
    } catch (error) {
      if (error instanceof BadRequestError) {
        throw error;
      }
      // Continue polling on transient errors
      logger.warn({ requestId, attempt, error }, "ADCS poll attempt failed, retrying");
    }
  }

  throw new BadRequestError({
    message: `Certificate request ${requestId} did not complete within the polling timeout`
  });
};
