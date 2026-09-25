/* eslint-disable no-continue, no-await-in-loop */
import * as x509 from "@peculiar/x509";
import * as asn1js from "asn1js";
import { Certificate, ContentInfo, SignedData } from "pkijs";
import RE2 from "re2";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { createAdcsHttpClient } from "@app/services/app-connection/azure-adcs/azure-adcs-connection-fns";
import { constructPemChainFromCerts, splitPemChain } from "@app/services/certificate/certificate-fns";

const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 120;
const MAX_ADCS_CA_RENEWALS = 100;

// Pre-compiled regex patterns
const RE_NON_BASE64 = new RE2("[^A-Za-z0-9+/=\\s]", "g");
const RE_WHITESPACE = new RE2("\\s", "g");
const RE_BASE64_WRAP = new RE2("(.{64})", "g");
const RE_CSR_BEGIN = new RE2("-----BEGIN CERTIFICATE REQUEST-----", "g");
const RE_CSR_END = new RE2("-----END CERTIFICATE REQUEST-----", "g");
const RE_CSR_NEWLINES = new RE2("\\r?\\n", "g");
const RE_ESCAPED_CRLF = new RE2("\\\\r\\\\n", "g");
const RE_ESCAPED_CR = new RE2("\\\\r", "g");
const RE_CRLF = new RE2("[\\r\\n]", "g");
// Error detail extraction patterns for ADCS error pages
const RE_DISPOSITION_INLINE = new RE2('disposition\\s+message\\s+is\\s+"([^"]+)"', "i");
const RE_RESULT_FIELD = new RE2("<b>Result:</b>[^<]*(?:<[^>]*>)*\\s*([^<]+)", "i");
const RE_COM_ERROR = new RE2("<b>COM Error Info:</b>[^<]*(?:<[^>]*>)*\\s*([^<]+)", "i");
const RE_DISPOSITION_DD = new RE2("<b>Disposition message:</b>[^<]*(?:<[^>]*>)*\\s*([^<]+)", "i");
const RE_SUGGESTED_CAUSE = new RE2("<b>Suggested Cause:</b>[^<]*(?:<[^>]*>)*\\s*([^<]+)", "i");

const ADCS_ERROR_PATTERNS = [
  RE_DISPOSITION_INLINE,
  RE_DISPOSITION_DD,
  RE_RESULT_FIELD,
  RE_COM_ERROR,
  RE_SUGGESTED_CAUSE
];

const extractAdcsErrorDetail = (html: string): string => {
  for (const re of ADCS_ERROR_PATTERNS) {
    const match = html.match(re);
    const val = match?.[1]?.trim();
    if (val && !val.startsWith("(")) {
      return val;
    }
  }
  return "";
};

const REQUEST_ID_PATTERNS = [
  new RE2("reqid[=:](\\d+)", "i"),
  new RE2("request\\s+id[:\\s]+(\\d+)", "i"),
  new RE2("certificate\\s+request\\s+(\\d+)", "i"),
  new RE2("\\breqid=(\\d+)\\b", "i"),
  new RE2("requestid[:\\s]*(\\d+)", "i")
];

const RE_N_RENEWALS = new RE2("var\\s+nRenewals\\s*=\\s*(\\d+)\\s*;", "i");
const RE_PEM_MARKER = new RE2("-----(BEGIN|END)[^-]*-----", "g");

type TAdcsClient = {
  get: (endpoint: string, additionalHeaders?: Record<string, string>) => Promise<{ data: unknown }>;
};

const parseAdcsCertificateResponse = (data: string): x509.X509Certificate => {
  if (data.includes("-----BEGIN CERTIFICATE-----")) {
    return new x509.X509Certificate(data.trim());
  }

  const cleanData = data.trim().replace(RE_NON_BASE64, "").replace(RE_WHITESPACE, "");
  if (cleanData.length < 100) {
    throw new BadRequestError({ message: "Failed to retrieve CA certificate from ADCS: response too short" });
  }

  return new x509.X509Certificate(Buffer.from(cleanData, "base64"));
};

const parseAdcsPkcs7Response = (data: string): x509.X509Certificate[] => {
  const cleanData = data.replace(RE_PEM_MARKER, "").replace(RE_NON_BASE64, "").replace(RE_WHITESPACE, "");
  const der = Buffer.from(cleanData, "base64");

  const asn1 = asn1js.fromBER(der);
  if (asn1.offset === -1) {
    throw new BadRequestError({ message: "Failed to parse the CA certificate chain from ADCS: invalid DER encoding" });
  }

  const contentInfo = new ContentInfo({ schema: asn1.result });
  if (contentInfo.contentType !== "1.2.840.113549.1.7.2") {
    throw new BadRequestError({
      message: "Failed to parse the CA certificate chain from ADCS: expected PKCS#7 SignedData"
    });
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const signedData = new SignedData({ schema: contentInfo.content });

  return (signedData.certificates ?? []).flatMap((item) =>
    item instanceof Certificate ? [new x509.X509Certificate(item.toSchema().toBER(false))] : []
  );
};

/**
 * certcarc.asp publishes the index of the CA's current certificate as nRenewals; renewal N is
 * fetched with certnew.cer?ReqID=CACert&Renewal=N, where 0 is the CA's original certificate.
 * When the page cannot be fetched at all, only renewal 0 is tried, which still cannot select
 * a stale certificate because every candidate is verified against the issued certificate.
 */
export const getAdcsRenewalCount = async (adcsClient: TAdcsClient): Promise<number> => {
  let html: string;
  try {
    const response = await adcsClient.get("/certsrv/certcarc.asp", { Accept: "text/html,*/*" });
    html = String(response.data);
  } catch (error) {
    logger.warn(
      { error },
      "ADCS: failed to read certcarc.asp, only the original CA certificate (Renewal=0) will be tried"
    );
    return 0;
  }

  const match = html.match(RE_N_RENEWALS);
  if (!match?.[1]) {
    throw new BadRequestError({
      message: "Failed to determine the current CA certificate from ADCS: certcarc.asp did not report nRenewals"
    });
  }

  const renewalCount = parseInt(match[1], 10);
  if (!Number.isSafeInteger(renewalCount) || renewalCount > MAX_ADCS_CA_RENEWALS) {
    throw new BadRequestError({
      message: `Failed to determine the current CA certificate from ADCS: certcarc.asp reported ${match[1]} renewals, expected at most ${MAX_ADCS_CA_RENEWALS}`
    });
  }

  return renewalCount;
};

const isIssuedBy = async (issuedCert: x509.X509Certificate, caCert: x509.X509Certificate) => {
  try {
    return await issuedCert.verify({ publicKey: caCert, signatureOnly: true });
  } catch (error) {
    logger.warn(
      { error, caSubject: caCert.subject },
      "ADCS: could not verify the issued certificate against a CA certificate"
    );
    return false;
  }
};

/**
 * Fetch the chain of the CA certificate that issued `issuedCertificate` from ADCS web enrollment,
 * issuing CA first. A CA renewed with a new key keeps every previous certificate available, so
 * renewals are tried newest first and each candidate is verified against the issued certificate.
 * The chain comes from certnew.p7b; when it cannot be fetched or parsed only the issuing CA
 * certificate is returned.
 */
export const fetchAdcsCaChain = async (adcsClient: TAdcsClient, issuedCertificate: string): Promise<string> => {
  const issuedCert = new x509.X509Certificate(issuedCertificate);
  const renewalCount = await getAdcsRenewalCount(adcsClient);

  for (let renewal = renewalCount; renewal >= 0; renewal -= 1) {
    let caCert: x509.X509Certificate;
    try {
      const response = await adcsClient.get(`/certsrv/certnew.cer?ReqID=CACert&Renewal=${renewal}&Enc=b64`, {
        Accept: "application/pkix-cert,application/x-x509-ca-cert,*/*"
      });
      caCert = parseAdcsCertificateResponse(String(response.data));
    } catch (error) {
      logger.warn({ error, renewal }, "ADCS: failed to fetch CA certificate for renewal index");
      continue;
    }

    if (!(await isIssuedBy(issuedCert, caCert))) {
      continue;
    }

    let chain: x509.X509Certificate[] = [];
    try {
      const response = await adcsClient.get(`/certsrv/certnew.p7b?ReqID=CACert&Renewal=${renewal}&Enc=b64`, {
        Accept: "application/x-pkcs7-certificates,application/pkcs7-mime,*/*"
      });
      chain = parseAdcsPkcs7Response(String(response.data));
    } catch (error) {
      logger.warn(
        { error, renewal },
        "ADCS: failed to fetch CA certificate chain, storing the issuing CA certificate only"
      );
    }

    return constructPemChainFromCerts([caCert, ...chain.filter((cert) => !cert.equal(caCert))]);
  }

  throw new BadRequestError({
    message: `None of the ${renewalCount + 1} CA certificate(s) published by ADCS issued the certificate. Verify that the ADCS URL points at the CA that signed the request.`
  });
};

export const submitCsrToAdcs = async (params: {
  credentials: { username: string; password: string; sslRejectUnauthorized?: boolean; sslCertificate?: string };
  adcsUrl: string;
  csr: string;
  template: string;
  validityPeriod?: number;
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
  const cleanCsr = csr.replace(RE_CSR_BEGIN, "").replace(RE_CSR_END, "").replace(RE_CSR_NEWLINES, "");

  // Build certificate attributes
  const sanitizedTemplate = RE_CRLF.replace(template.trim(), "");
  const certAttribParts: string[] = [`CertificateTemplate:${sanitizedTemplate}`];

  if (validityPeriod) {
    const ttlMs = validityPeriod * 86400000;
    const expirationDate = new Date(Date.now() + ttlMs);
    const rfc2616Date = expirationDate.toUTCString();
    certAttribParts.push(`ExpirationDate:${rfc2616Date}`);
  }

  const certAttrib = `${certAttribParts.join("\r\n")}\r\n`;

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

  for (const regex of REQUEST_ID_PATTERNS) {
    const match = responseText.match(regex);
    if (match) {
      [, requestId] = match;
      break;
    }
  }

  // Check for immediate certificate issuance
  const [certMatch] = splitPemChain(responseText);
  if (certMatch) {
    certificate = certMatch.replace(RE_ESCAPED_CRLF, "\n").replace(RE_ESCAPED_CR, "\n").trim();
    status = "issued";
  }

  // Check disposition message (only if we didn't already extract a certificate)
  if (!certificate) {
    if (responseText.includes("taken under submission") || responseText.includes("pending")) {
      status = "pending";
    } else if (responseText.includes("denied") || responseText.includes("rejected")) {
      status = "denied";
    } else if (responseText.includes("issued")) {
      status = "issued";
    }
  }

  if (status === "denied") {
    const detail = extractAdcsErrorDetail(responseText);
    throw new BadRequestError({
      message: detail ? `Certificate request was denied by ADCS: ${detail}` : "Certificate request was denied by ADCS"
    });
  }

  if (status === "issued" && certificate) {
    const certificateChain = await fetchAdcsCaChain(adcsClient, certificate);
    return { certificate, certificateChain };
  }

  // If pending, poll for the certificate
  if (!requestId) {
    const detail = extractAdcsErrorDetail(responseText);
    throw new BadRequestError({
      message: detail
        ? `Certificate request failed: ${detail}`
        : "Certificate request failed: could not parse request ID or certificate from ADCS response"
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
        const certificateChain = await fetchAdcsCaChain(adcsClient, polledCert);
        return { certificate: polledCert, certificateChain };
      }

      // Handle base64-encoded certificate data
      let cleanCertData = certData.trim();
      cleanCertData = cleanCertData.replace(RE_NON_BASE64, "").replace(RE_WHITESPACE, "");

      if (cleanCertData.length < 100) {
        continue;
      }

      const formattedCert = cleanCertData.replace(RE_BASE64_WRAP, "$1\n").trim();
      const pemCert = `-----BEGIN CERTIFICATE-----\n${formattedCert}\n-----END CERTIFICATE-----`;

      // Validate the PEM (throws on invalid input)
      // eslint-disable-next-line no-new
      new x509.X509Certificate(pemCert);
      const certificateChain = await fetchAdcsCaChain(adcsClient, pemCert);
      return { certificate: pemCert, certificateChain };
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
