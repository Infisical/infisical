import * as x509 from "@peculiar/x509";

const MAX_SUBJECT_LENGTH = 512;

export type TCertificatePemSummary = {
  subject: string;
  commonName: string | null;
  altNames: string | null;
  keyAlgorithm: string;
  serialNumber: string;
  notBefore: string;
  notAfter: string;
};

const describePublicKey = (cert: x509.X509Certificate) => {
  const algorithm = cert.publicKey.algorithm as {
    name: string;
    modulusLength?: number;
    namedCurve?: string;
  };
  if (algorithm.modulusLength) return `RSA ${algorithm.modulusLength}`;
  if (algorithm.namedCurve) return `EC ${algorithm.namedCurve}`;
  return algorithm.name;
};

const readAltNames = (cert: x509.X509Certificate) => {
  const extension = cert.extensions.find((ext) => ext.type === "2.5.29.17");
  if (!extension) return null;

  try {
    return new x509.GeneralNames(extension.value).items
      .map((name) => name.value)
      .join(", ")
      .slice(0, MAX_SUBJECT_LENGTH);
  } catch {
    return null;
  }
};

export const summarizeCertificatePem = (pem: string): TCertificatePemSummary | null => {
  try {
    const cert = new x509.X509Certificate(pem.trim());
    return {
      subject: cert.subject.slice(0, MAX_SUBJECT_LENGTH),
      commonName: cert.subjectName.getField("CN")[0]?.slice(0, MAX_SUBJECT_LENGTH) ?? null,
      altNames: readAltNames(cert),
      keyAlgorithm: describePublicKey(cert),
      serialNumber: cert.serialNumber,
      notBefore: cert.notBefore.toISOString(),
      notAfter: cert.notAfter.toISOString()
    };
  } catch {
    return null;
  }
};
