import * as x509 from "@peculiar/x509";

import { TAssertCrossSignedCertsAllowSubCaDTO } from "@app/ee/services/certificate-authority-cross-signed-cert/certificate-authority-cross-signed-cert-types";
import { BadRequestError } from "@app/lib/errors";
import {
  hasSamePublicKey,
  isSameCertificateIdentity
} from "@app/services/certificate-authority/certificate-authority-fns";
import { constructPemChainFromCerts, parsePemCertificateChain } from "@app/services/certificate/certificate-fns";

const formatCertificateDate = (date: Date) =>
  date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" });

const getCertificateLabel = (cert: x509.X509Certificate) => cert.subjectName.getField("CN")[0] ?? cert.subject;

const MAX_CROSS_SIGNED_CHAIN_CERTIFICATES = 10;

const isSignedBy = (cert: x509.X509Certificate, signerCert: x509.X509Certificate) =>
  cert.verify({ publicKey: signerCert.publicKey, signatureOnly: true }).catch(() => false);

const canSignCertificates = (cert: x509.X509Certificate) => {
  const keyUsages = cert.getExtension(x509.KeyUsagesExtension);
  // eslint-disable-next-line no-bitwise
  return !keyUsages || Boolean(keyUsages.usages & x509.KeyUsageFlags.keyCertSign);
};

const isSelfIssued = (cert: x509.X509Certificate) => cert.subject === cert.issuer;

const getPathLength = (cert: x509.X509Certificate) => cert.getExtension(x509.BasicConstraintsExtension)?.pathLength;

const getCaLevelsAllowedBelowCopy = (
  crossSignedCertObj: x509.X509Certificate,
  chainCertObjs: x509.X509Certificate[]
) => {
  const pathCertObjs = [crossSignedCertObj, ...chainCertObjs];
  return pathCertObjs.map((certObj, index) => {
    const pathLength = getPathLength(certObj);
    if (pathLength === undefined) return undefined;
    const countedLevelsAboveCopy = pathCertObjs.slice(0, index).filter((below) => !isSelfIssued(below)).length;
    return pathLength - countedLevelsAboveCopy;
  });
};

export const validateCrossSignedCertificate = async ({
  caCertificate,
  caCertificateChain,
  subCaDepth,
  certificate,
  certificateChain
}: {
  caCertificate: string;
  caCertificateChain: string;
  subCaDepth: number;
  certificate: string;
  certificateChain: string;
}) => {
  const parsedCertificates = parsePemCertificateChain(certificate);
  if (!parsedCertificates || parsedCertificates.length !== 1) {
    throw new BadRequestError({
      message: "Paste a single PEM-encoded certificate, including its BEGIN and END lines."
    });
  }
  const [crossSignedCertObj] = parsedCertificates;

  const chainCertObjs = parsePemCertificateChain(certificateChain);
  if (!chainCertObjs) {
    throw new BadRequestError({
      message:
        "The certificate chain contains a block that is not a valid certificate. Paste each certificate in full, including its BEGIN and END lines."
    });
  }

  const caCertObj = new x509.X509Certificate(caCertificate);

  if (!isSameCertificateIdentity(crossSignedCertObj, caCertObj)) {
    throw new BadRequestError({
      message: hasSamePublicKey(crossSignedCertObj, caCertObj)
        ? "This certificate's subject doesn't match this CA. Have the old CA sign the CSR from this CA."
        : "This certificate's key doesn't match this CA. Have the old CA sign the CSR from this CA."
    });
  }

  const subjectKeyIdentifier = crossSignedCertObj.getExtension(x509.SubjectKeyIdentifierExtension);
  if (subjectKeyIdentifier) {
    const { keyId: caKeyIdentifier } = await x509.SubjectKeyIdentifierExtension.create(caCertObj.publicKey);
    if (subjectKeyIdentifier.keyId.toLowerCase() !== caKeyIdentifier.toLowerCase()) {
      throw new BadRequestError({
        message:
          "This certificate's key identifier doesn't match this CA. Have the old CA keep the key identifier from the CSR."
      });
    }
  }

  if (await isSignedBy(crossSignedCertObj, crossSignedCertObj)) {
    throw new BadRequestError({
      message: "This certificate is self-signed. Have the old CA sign the CSR from this CA."
    });
  }

  const [caParentCertObj] = parsePemCertificateChain(caCertificateChain) ?? [];
  const isCaOwnCertificate =
    Buffer.from(crossSignedCertObj.rawData).equals(Buffer.from(caCertObj.rawData)) ||
    (caParentCertObj !== undefined && (await isSignedBy(crossSignedCertObj, caParentCertObj)));
  if (isCaOwnCertificate) {
    throw new BadRequestError({
      message: "This is the CA's own certificate. Import the cross-signed certificate your old CA signed."
    });
  }

  const basicConstraints = crossSignedCertObj.getExtension(x509.BasicConstraintsExtension);
  if (!basicConstraints?.ca) {
    throw new BadRequestError({
      message: "This isn't a CA certificate. Have the old CA sign the CSR as a CA certificate."
    });
  }

  const caLevelsBelowCopy = getPathLength(caCertObj) ?? subCaDepth;
  const copyPathLength = getPathLength(crossSignedCertObj);
  if (copyPathLength !== undefined && copyPathLength < caLevelsBelowCopy) {
    throw new BadRequestError({
      message:
        "This certificate allows fewer CA levels below it than the CAs under this CA need. Have the old CA keep the path length from the CSR."
    });
  }

  if (!canSignCertificates(crossSignedCertObj)) {
    throw new BadRequestError({
      message: "This certificate can't sign certificates. Have the old CA include the Certificate Sign key usage."
    });
  }

  if (crossSignedCertObj.notAfter.getTime() <= Date.now()) {
    throw new BadRequestError({
      message: `This certificate expired on ${formatCertificateDate(crossSignedCertObj.notAfter)}. Have the old CA sign a new one.`
    });
  }

  if (!chainCertObjs.length) {
    throw new BadRequestError({
      message:
        "Paste the old CA's certificates in the certificate chain, starting with the CA that signed this certificate and ending with its root."
    });
  }

  if (chainCertObjs.length > MAX_CROSS_SIGNED_CHAIN_CERTIFICATES) {
    throw new BadRequestError({
      message: `The chain has ${chainCertObjs.length} certificates. Paste only the old CA's certificates, from the one that signed this certificate up to its root (at most ${MAX_CROSS_SIGNED_CHAIN_CERTIFICATES}).`
    });
  }

  const [issuerCertObj] = chainCertObjs;
  const isSignedByIssuer =
    issuerCertObj.subject === crossSignedCertObj.issuer && (await isSignedBy(crossSignedCertObj, issuerCertObj));
  if (!isSignedByIssuer) {
    throw new BadRequestError({
      message:
        "The first certificate in the chain didn't sign this certificate. Start the chain with the old CA that signed it."
    });
  }

  const isSelfSignedChainCert = await Promise.all(
    chainCertObjs.map(async (chainCertObj) => isSelfIssued(chainCertObj) && isSignedBy(chainCertObj, chainCertObj))
  );
  const caLevelsAllowed = getCaLevelsAllowedBelowCopy(crossSignedCertObj, chainCertObjs);

  const now = Date.now();
  chainCertObjs.forEach((chainCertObj, index) => {
    const chainCertLabel = `Certificate ${index + 1} in the chain (${getCertificateLabel(chainCertObj)})`;

    if (index < chainCertObjs.length - 1 && isSelfSignedChainCert[index]) {
      throw new BadRequestError({
        message: `${chainCertLabel} is a root certificate. Put the old root once, at the end of the chain.`
      });
    }

    if (!chainCertObj.getExtension(x509.BasicConstraintsExtension)?.ca) {
      throw new BadRequestError({
        message: `${chainCertLabel} isn't a CA certificate. Paste only the old CA's certificates up to its root.`
      });
    }

    if (!canSignCertificates(chainCertObj)) {
      throw new BadRequestError({
        message: `${chainCertLabel} can't sign certificates. Have an old CA that can sign certificates sign the CSR.`
      });
    }

    if (chainCertObj.notBefore.getTime() > now) {
      throw new BadRequestError({
        message: `${chainCertLabel} isn't valid until ${formatCertificateDate(chainCertObj.notBefore)}. Paste its current certificate.`
      });
    }

    if (chainCertObj.notAfter.getTime() <= now) {
      throw new BadRequestError({
        message: `${chainCertLabel} expired on ${formatCertificateDate(chainCertObj.notAfter)}. Paste its current certificate.`
      });
    }

    if (chainCertObj.notAfter.getTime() < crossSignedCertObj.notAfter.getTime()) {
      throw new BadRequestError({
        message: `${chainCertLabel} expires on ${formatCertificateDate(chainCertObj.notAfter)}, before this cross-signed certificate. Have the old CA sign a cross-signed certificate that expires by then.`
      });
    }

    const chainCertLevelsAllowed = caLevelsAllowed[index + 1];
    if (chainCertLevelsAllowed !== undefined && chainCertLevelsAllowed < caLevelsBelowCopy) {
      throw new BadRequestError({
        message: `${chainCertLabel} allows fewer CA levels below it than this CA needs. Have an old CA without that path length limit sign the CSR.`
      });
    }
  });

  const chainLinks = await Promise.all(
    chainCertObjs
      .slice(1)
      .map(
        async (signerCertObj, index) =>
          chainCertObjs[index].issuer === signerCertObj.subject && isSignedBy(chainCertObjs[index], signerCertObj)
      )
  );
  const brokenLinkIndex = chainLinks.indexOf(false);
  if (brokenLinkIndex !== -1) {
    throw new BadRequestError({
      message: `Certificate ${brokenLinkIndex + 2} in the chain didn't sign certificate ${brokenLinkIndex + 1}. Paste the old CA's certificates in order, up to its root.`
    });
  }

  if (!isSelfSignedChainCert[chainCertObjs.length - 1]) {
    throw new BadRequestError({
      message: "The chain doesn't end with a root certificate. Add the old CA's root certificate at the end."
    });
  }

  const definedCaLevelsAllowed = caLevelsAllowed.filter((levels): levels is number => levels !== undefined);

  return {
    crossSignedCertObj,
    crossSignedCertChainPem: constructPemChainFromCerts(chainCertObjs),
    maxPathLength: definedCaLevelsAllowed.length ? Math.min(...definedCaLevelsAllowed) : null
  };
};

export const assertCrossSignedCertsAllowSubCa = async ({
  parentCaId,
  attachedCaId,
  certificateAuthorityDAL,
  certificateAuthorityCrossSignedCertDAL,
  tx
}: TAssertCrossSignedCertsAllowSubCaDTO) => {
  const crossSignedCerts = await certificateAuthorityCrossSignedCertDAL.lockCaHierarchyAndFindUnexpired(parentCaId, tx);
  const limitedCrossSignedCerts = crossSignedCerts.filter(
    (crossSignedCert) => crossSignedCert.maxPathLength !== null && crossSignedCert.maxPathLength !== undefined
  );
  if (!limitedCrossSignedCerts.length) return;

  const attachedCaSubCaDepth = await certificateAuthorityDAL.findMaxSubCaDepth(attachedCaId, tx);
  const blockingCrossSignedCert = limitedCrossSignedCerts.find(
    (crossSignedCert) => crossSignedCert.depth + 1 + attachedCaSubCaDepth > (crossSignedCert.maxPathLength as number)
  );
  if (blockingCrossSignedCert) {
    throw new BadRequestError({
      message: `The cross-signed certificate of CA '${blockingCrossSignedCert.caName}' doesn't allow another CA level below it, so this CA can't be added under it. Replace that cross-signed certificate with one that allows more levels, or remove it first.`
    });
  }
};
