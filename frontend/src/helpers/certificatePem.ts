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

const normalizePemText = (pemText: string) => {
  const cleaned = pemText
    .replace(/\\r\\n|\\n|\\r/g, "\n")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/[\u00a0\u2007\u202f]/g, " ")
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, "");

  const blocks = Array.from(
    cleaned.matchAll(/-----BEGIN ([A-Z0-9 ]+)-----([A-Za-z0-9+/=\s]*)-----END ([A-Z0-9 ]+)-----/g)
  )
    .filter(([, beginLabel, , endLabel]) => beginLabel === endLabel)
    .map(([, label, body]) => {
      const lines = body.replace(/\s/g, "").match(/.{1,64}/g) ?? [];
      return [`-----BEGIN ${label}-----`, ...lines, `-----END ${label}-----`].join("\n");
    });

  const beginMarkerCount = (cleaned.match(/-----BEGIN /g) ?? []).length;
  return blocks.length && blocks.length === beginMarkerCount ? blocks.join("\n") : pemText.trim();
};

export const summarizeCertificatePem = (pem: string): TCertificatePemSummary | null => {
  try {
    const cert = new x509.X509Certificate(normalizePemText(pem));
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
