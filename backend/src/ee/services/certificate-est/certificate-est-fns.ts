import { Certificate, ContentInfo, EncapsulatedContentInfo, SignedData } from "pkijs";

export const convertRawCertsToPkcs7 = (rawCertificate: ArrayBuffer[]) => {
  const certs = rawCertificate.map((rawCert) => Certificate.fromBER(rawCert));
  const cmsSigned = new SignedData({
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: "1.2.840.113549.1.7.1" // not encrypted and not compressed data
    }),
    certificates: certs
  });

  const cmsContent = new ContentInfo({
    contentType: "1.2.840.113549.1.7.2", // SignedData
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    content: cmsSigned.toSchema()
  });

  const derBuffer = cmsContent.toSchema().toBER(false);
  const base64Pkcs7 = Buffer.from(derBuffer)
    .toString("base64")
    .replace(/(.{64})/g, "$1\n"); // we add a linebreak for CURL clients

  return base64Pkcs7;
};
