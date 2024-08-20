import { X509Certificate } from "@peculiar/x509";
import { Certificate, ContentInfo, EncapsulatedContentInfo, SignedData } from "pkijs";

export const convertRawCertToPkcs7 = (rawCertificate: ArrayBuffer) => {
  const cert = Certificate.fromBER(rawCertificate);
  const cmsSigned = new SignedData({
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: "1.2.840.113549.1.7.1" // not encrypted and not compressed data
    }),
    certificates: [cert]
  });

  const cmsContent = new ContentInfo({
    contentType: "1.2.840.113549.1.7.2", // SignedData
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    content: cmsSigned.toSchema()
  });

  const derBuffer = cmsContent.toSchema().toBER(false);
  const base64Pkcs7 = Buffer.from(derBuffer).toString("base64");

  return base64Pkcs7;
};

export const checkCertValidityAgainstChain = async (cert: X509Certificate, chainCerts: X509Certificate[]) => {
  let isSslClientCertValid = true;
  let certToVerify = cert;

  for await (const issuerCert of chainCerts) {
    if (
      await certToVerify.verify({
        publicKey: issuerCert.publicKey
      })
    ) {
      certToVerify = issuerCert; // Move to the next certificate in the chain
    } else {
      isSslClientCertValid = false;
    }
  }

  return isSslClientCertValid;
};
