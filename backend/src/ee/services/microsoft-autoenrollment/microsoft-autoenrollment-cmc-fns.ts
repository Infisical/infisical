import * as x509 from "@peculiar/x509";
import * as asn1js from "asn1js";
import { Certificate, ContentInfo, SignedData } from "pkijs";

import { CmsSignedAttributesEncoding, verifyCmsSignedAttributes } from "@app/ee/services/pki-scep/pki-scep-cms-fns";
import { DIGEST_OID_TO_HASH } from "@app/ee/services/pki-scep/pki-scep-types";
import { crypto } from "@app/lib/crypto/cryptography";
import { BadRequestError } from "@app/lib/errors";
import { asNonSharedBuffer } from "@app/lib/fn";

const SIGNED_DATA_OID = "1.2.840.113549.1.7.2";
const CMC_PKI_DATA_OID = "1.3.6.1.5.5.7.12.2";
const NO_SIGNATURE_ALGORITHM_OID = "1.3.6.1.5.5.7.6.2";

type TParsedEnrollmentRequest = {
  csr: x509.Pkcs10CertificateRequest;
  currentCertificate: x509.X509Certificate | null;
};

const parseDer = (der: ArrayBuffer | Buffer, what: string) => {
  const parsed = asn1js.fromBER(der);
  if (parsed.offset === -1) {
    throw new BadRequestError({ message: `The ${what} in the enrollment request is not valid DER.` });
  }
  return parsed.result;
};

const extractCsrFromPkiData = (pkiDataDer: Buffer): Buffer => {
  const pkiData = parseDer(pkiDataDer, "CMC request");
  const reqSequence = pkiData instanceof asn1js.Sequence ? pkiData.valueBlock.value[1] : undefined;
  const taggedRequest = reqSequence instanceof asn1js.Sequence ? reqSequence.valueBlock.value[0] : undefined;
  const certificationRequest =
    taggedRequest instanceof asn1js.Constructed ? taggedRequest.valueBlock.value[1] : undefined;
  if (!(certificationRequest instanceof asn1js.Sequence)) {
    throw new BadRequestError({ message: "The CMC request does not contain a certificate signing request." });
  }
  return Buffer.from(certificationRequest.valueBeforeDecodeView);
};

const verifySignature = (hash: string, data: Buffer, signature: Buffer, publicKeySpki: ArrayBuffer) => {
  try {
    return crypto.nativeCrypto.verify(
      hash,
      data,
      crypto.nativeCrypto.createPublicKey({ key: Buffer.from(publicKeySpki), format: "der", type: "spki" }),
      signature
    );
  } catch {
    return false;
  }
};

const parseSignedData = (top: asn1js.AsnType) => {
  let contentInfo: ContentInfo;
  try {
    contentInfo = new ContentInfo({ schema: top });
  } catch {
    throw new BadRequestError({ message: "The enrollment request is neither a PKCS#10 nor a PKCS#7 request." });
  }
  if (contentInfo.contentType !== SIGNED_DATA_OID) {
    throw new BadRequestError({
      message: `The enrollment request has content type '${contentInfo.contentType}', expected PKCS#7 signed data.`
    });
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    return new SignedData({ schema: contentInfo.content });
  } catch {
    throw new BadRequestError({ message: "The enrollment request's PKCS#7 signed data is not valid." });
  }
};

const parseSignedRequest = (top: asn1js.AsnType) => {
  const signedData = parseSignedData(top);
  const { eContent, eContentType } = signedData.encapContentInfo;
  if (!eContent) {
    throw new BadRequestError({ message: "The enrollment request has no signed content." });
  }
  const content = Buffer.from(eContent.getValue());
  const csrDer = eContentType === CMC_PKI_DATA_OID ? extractCsrFromPkiData(content) : content;

  return { signedData, content, csrDer };
};

export const parseEnrollmentRequestToken = async (token: Buffer): Promise<TParsedEnrollmentRequest> => {
  const top = parseDer(token, "token");
  const isPlainCsr = top instanceof asn1js.Sequence && !(top.valueBlock.value[0] instanceof asn1js.ObjectIdentifier);
  const signedRequest = isPlainCsr ? null : parseSignedRequest(top);
  const csrDer = signedRequest?.csrDer ?? token;

  let csr: x509.Pkcs10CertificateRequest;
  try {
    csr = new x509.Pkcs10CertificateRequest(asNonSharedBuffer(csrDer));
  } catch {
    throw new BadRequestError({
      message: "The enrollment request does not contain a valid certificate signing request."
    });
  }
  if (!(await csr.verify())) {
    throw new BadRequestError({
      message: "The certificate signing request's signature does not match its public key."
    });
  }

  if (!signedRequest) return { csr, currentCertificate: null };

  const { signedData, content } = signedRequest;
  const attachedCertificates = (signedData.certificates ?? [])
    .filter((certificate): certificate is Certificate => certificate instanceof Certificate)
    .map((certificate) => new x509.X509Certificate(certificate.toSchema().toBER(false)));

  let currentCertificate: x509.X509Certificate | null = null;
  for (const [signerIndex, signerInfo] of signedData.signerInfos.entries()) {
    const hash = DIGEST_OID_TO_HASH[signerInfo.digestAlgorithm.algorithmId];
    if (!hash) {
      throw new BadRequestError({
        message: `The enrollment request is signed with unsupported digest algorithm '${signerInfo.digestAlgorithm.algorithmId}'.`
      });
    }

    let signedBytes: Buffer = content;
    if (signerInfo.signedAttrs) {
      const signedAttributesCheck = verifyCmsSignedAttributes({
        signedAttributes: signerInfo.signedAttrs,
        hash,
        content,
        encoding: CmsSignedAttributesEncoding.Received
      });
      if ("failure" in signedAttributesCheck) {
        throw new BadRequestError({ message: "The enrollment request's message digest does not match its content." });
      }
      signedBytes = signedAttributesCheck.signedBytes;
    }

    const signature = Buffer.from(signerInfo.signature.getValue());
    if (signerIndex === 0 && signerInfo.signatureAlgorithm.algorithmId === NO_SIGNATURE_ALGORITHM_OID) {
      if (!crypto.nativeCrypto.createHash(hash).update(signedBytes).digest().equals(signature)) {
        throw new BadRequestError({
          message: "The enrollment request's unsigned signer does not carry the hash of the data it covers."
        });
      }
    } else {
      const signingCertificate = attachedCertificates.find((certificate) =>
        verifySignature(hash, signedBytes, signature, certificate.publicKey.rawData)
      );

      if (signingCertificate) {
        currentCertificate = signingCertificate;
      } else if (!verifySignature(hash, signedBytes, signature, csr.publicKey.rawData)) {
        throw new BadRequestError({
          message:
            "The enrollment request carries a signature that matches neither the new key nor an attached certificate."
        });
      }
    }
  }

  return { csr, currentCertificate };
};
