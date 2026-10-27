import * as x509 from "@peculiar/x509";

export type TCertificateSource = Buffer | x509.X509Certificate;

export const toX509Certificate = (source: TCertificateSource): x509.X509Certificate =>
  source instanceof x509.X509Certificate ? source : new x509.X509Certificate(source);
