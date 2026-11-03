import * as x509 from "@peculiar/x509";
import * as asn1js from "asn1js";
import * as pkijs from "pkijs";

import {
  OCSP_REQUEST_CONTENT_TYPE,
  OcspCertStatus,
  OcspResponseStatus
} from "@app/ee/services/certificate-authority-ocsp/certificate-authority-ocsp-enums";
import { BadRequestError } from "@app/lib/errors";
import { safeRequest } from "@app/lib/validator/safe-request";

const OCSP_CLIENT_TIMEOUT_MS = 10_000;
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

const getRevocationTime = (basicResponse: pkijs.BasicOCSPResponse, certificate: pkijs.Certificate) => {
  const serialHex = Buffer.from(certificate.serialNumber.valueBlock.valueHexView).toString("hex");
  const singleResponse = basicResponse.tbsResponseData.responses.find(
    (response) => Buffer.from(response.certID.serialNumber.valueBlock.valueHexView).toString("hex") === serialHex
  );
  const revokedInfo = singleResponse?.certStatus as asn1js.Constructed | undefined;
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

  const pkijsCertificate = toPkijsCertificate(certificate);
  const pkijsIssuer = toPkijsCertificate(issuer);

  const ocspRequest = new pkijs.OCSPRequest();
  await ocspRequest.createForCertificate(pkijsCertificate, { hashAlgorithm: "SHA-1", issuerCertificate: pkijsIssuer });

  const { data } = await safeRequest.post<ArrayBuffer>(ocspUrl, Buffer.from(ocspRequest.toSchema(true).toBER(false)), {
    headers: { "Content-Type": OCSP_REQUEST_CONTENT_TYPE },
    responseType: "arraybuffer",
    timeout: OCSP_CLIENT_TIMEOUT_MS
  });

  const ocspResponse = pkijs.OCSPResponse.fromBER(new Uint8Array(data).buffer);
  const responseStatus = ocspResponse.responseStatus.valueBlock.valueDec;
  if (responseStatus !== OcspResponseStatus.Successful || !ocspResponse.responseBytes) {
    throw new BadRequestError({ message: `OCSP responder ${ocspUrl} returned status ${responseStatus}` });
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
    throw new BadRequestError({ message: `OCSP response from ${ocspUrl} failed signature verification` });
  }

  const { isForCertificate, status } = await basicResponse.getCertificateStatus(pkijsCertificate, pkijsIssuer);
  if (!isForCertificate) {
    throw new BadRequestError({ message: `OCSP response from ${ocspUrl} does not cover the requested certificate` });
  }

  const certStatus = PKIJS_CERT_STATUS[status] ?? OcspCertStatus.Unknown;
  return certStatus === OcspCertStatus.Revoked
    ? { status: certStatus, revokedAt: getRevocationTime(basicResponse, pkijsCertificate) }
    : { status: certStatus };
};
