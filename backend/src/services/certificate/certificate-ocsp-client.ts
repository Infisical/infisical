import * as x509 from "@peculiar/x509";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";

import {
  OCSP_REQUEST_CONTENT_TYPE,
  OcspCertStatus,
  OcspResponseStatus
} from "@app/ee/services/certificate-authority-ocsp/certificate-authority-ocsp-enums";
import { BadRequestError } from "@app/lib/errors";
import { sanitizeUrlForLog } from "@app/lib/logger/sanitize-url";
import { safeRequest } from "@app/lib/validator/safe-request";

const OCSP_CLIENT_TIMEOUT_MS = 10_000;
const OCSP_CLIENT_MAX_RESPONSE_BYTES = 1024 * 1024;
const OCSP_CLOCK_SKEW_MS = 5 * 60 * 1000;
const OCSP_MAX_AGE_WITHOUT_NEXT_UPDATE_MS = 7 * 24 * 60 * 60 * 1000;
const PKIJS_CERT_STATUS: Record<number, OcspCertStatus> = {
  0: OcspCertStatus.Good,
  1: OcspCertStatus.Revoked,
  2: OcspCertStatus.Unknown
};

const toPkijsCertificate = (cert: x509.X509Certificate) =>
  pkijs.Certificate.fromBER(new Uint8Array(cert.rawData).buffer);

export const getCertificateOcspUrl = (cert: x509.X509Certificate) => {
  const authorityInfoAccess = cert.getExtension(x509.AuthorityInfoAccessExtension);
  return authorityInfoAccess?.ocsp.find((name) => name.type === "url")?.value;
};

const findSingleResponse = (basicResponse: pkijs.BasicOCSPResponse, certificate: pkijs.Certificate) => {
  const serialHex = Buffer.from(certificate.serialNumber.valueBlock.valueHexView).toString("hex");
  return basicResponse.tbsResponseData.responses.find(
    (response) => Buffer.from(response.certID.serialNumber.valueBlock.valueHexView).toString("hex") === serialHex
  );
};

const isWithinValidityWindow = (singleResponse: pkijs.SingleResponse, now: number) => {
  if (singleResponse.thisUpdate.getTime() > now + OCSP_CLOCK_SKEW_MS) return false;
  if (singleResponse.nextUpdate) return singleResponse.nextUpdate.getTime() >= now - OCSP_CLOCK_SKEW_MS;
  return singleResponse.thisUpdate.getTime() >= now - OCSP_MAX_AGE_WITHOUT_NEXT_UPDATE_MS;
};

const getRevocationTime = (singleResponse: pkijs.SingleResponse) => {
  const revokedInfo = singleResponse.certStatus as asn1js.Constructed | undefined;
  const revocationTime = revokedInfo?.valueBlock?.value?.[0];
  return revocationTime instanceof asn1js.GeneralizedTime ? revocationTime.toDate() : undefined;
};

export const getCertificateOcspStatus = async ({
  certificate,
  issuer
}: {
  certificate: x509.X509Certificate;
  issuer: x509.X509Certificate;
}): Promise<{ status: OcspCertStatus; revokedAt?: Date }> => {
  const ocspUrl = getCertificateOcspUrl(certificate);
  if (!ocspUrl) {
    throw new BadRequestError({ message: `Certificate ${certificate.serialNumber} has no OCSP responder URL` });
  }

  const responderUrl = sanitizeUrlForLog(ocspUrl);
  const pkijsCertificate = toPkijsCertificate(certificate);
  const pkijsIssuer = toPkijsCertificate(issuer);

  const ocspRequest = new pkijs.OCSPRequest();
  await ocspRequest.createForCertificate(pkijsCertificate, { hashAlgorithm: "SHA-1", issuerCertificate: pkijsIssuer });

  const { data } = await safeRequest.post<ArrayBuffer>(ocspUrl, Buffer.from(ocspRequest.toSchema(true).toBER(false)), {
    headers: { "Content-Type": OCSP_REQUEST_CONTENT_TYPE },
    responseType: "arraybuffer",
    timeout: OCSP_CLIENT_TIMEOUT_MS,
    maxContentLength: OCSP_CLIENT_MAX_RESPONSE_BYTES
  });

  const ocspResponse = pkijs.OCSPResponse.fromBER(new Uint8Array(data).buffer);
  const responseStatus = ocspResponse.responseStatus.valueBlock.valueDec;
  if (responseStatus !== OcspResponseStatus.Successful || !ocspResponse.responseBytes) {
    throw new BadRequestError({ message: `OCSP responder ${responderUrl} returned status ${responseStatus}` });
  }

  const basicResponse = pkijs.BasicOCSPResponse.fromBER(
    ocspResponse.responseBytes.response.valueBlock.valueHexView.slice().buffer
  );
  const isSignedByIssuer = await pkijs
    .getCrypto(true)
    .verifyWithPublicKey(
      new Uint8Array(basicResponse.tbsResponseData.tbsView),
      basicResponse.signature,
      pkijsIssuer.subjectPublicKeyInfo,
      basicResponse.signatureAlgorithm
    )
    .catch(() => false);
  const isSignatureValid =
    isSignedByIssuer ||
    (Boolean(basicResponse.certs?.length) &&
      (await basicResponse.verify({ trustedCerts: [pkijsIssuer] }).catch(() => false)));
  if (!isSignatureValid) {
    throw new BadRequestError({ message: `OCSP response from ${responderUrl} failed signature verification` });
  }

  const { isForCertificate, status } = await basicResponse.getCertificateStatus(pkijsCertificate, pkijsIssuer);
  if (!isForCertificate) {
    throw new BadRequestError({
      message: `OCSP response from ${responderUrl} does not cover the requested certificate`
    });
  }

  const singleResponse = findSingleResponse(basicResponse, pkijsCertificate);
  if (!singleResponse || !isWithinValidityWindow(singleResponse, Date.now())) {
    throw new BadRequestError({ message: `OCSP response from ${responderUrl} is outside its validity window` });
  }

  const certStatus = PKIJS_CERT_STATUS[status] ?? OcspCertStatus.Unknown;
  return certStatus === OcspCertStatus.Revoked
    ? { status: certStatus, revokedAt: getRevocationTime(singleResponse) }
    : { status: certStatus };
};
