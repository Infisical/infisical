import { Attributes, CertificationRequest, CertificationRequestInfo } from "@peculiar/asn1-csr";
import { ECDSASigValue, id_ecdsaWithSHA256, id_ecdsaWithSHA384 } from "@peculiar/asn1-ecc";
import { id_sha256WithRSAEncryption, id_sha384WithRSAEncryption } from "@peculiar/asn1-rsa";
import { AsnConvert, OctetString } from "@peculiar/asn1-schema";
import {
  AlgorithmIdentifier,
  Attribute,
  BasicConstraints,
  ExtendedKeyUsage,
  Extension,
  Extensions,
  GeneralName,
  id_ce_basicConstraints,
  id_ce_extKeyUsage,
  id_ce_keyUsage,
  id_ce_subjectAltName,
  id_kp_codeSigning,
  KeyUsage,
  KeyUsageFlags,
  Name,
  SubjectAlternativeName,
  SubjectPublicKeyInfo
} from "@peculiar/asn1-x509";
import * as x509 from "@peculiar/x509";

import { BadRequestError } from "@app/lib/errors";
import { HsmKeyAlgorithm } from "@app/services/signer/signer-enums";

export type BuildCsrInput = {
  publicKeySpkiDer: Buffer;
  keyAlgorithm: HsmKeyAlgorithm;
  subjectCommonName: string;
  subjectAltNames?: string[];
  signCallback: (tbsBytes: Buffer, mechanism: string, isDigest: boolean) => Promise<Buffer>;
};

export type BuiltCsr = {
  csrPem: string;
  csrDer: Buffer;
  signatureAlgorithmName: string;
};

const pickAlgorithmShape = (
  keyAlgorithm: HsmKeyAlgorithm
): {
  mechanism: string;
  pk11SignsDigest: boolean;
  isEcdsa: boolean;
  oid: string;
  parameters?: ArrayBuffer;
} => {
  const nullParams = new Uint8Array([0x05, 0x00]).buffer as ArrayBuffer;
  switch (keyAlgorithm) {
    case HsmKeyAlgorithm.RSA_2048:
      return {
        mechanism: "CKM_SHA256_RSA_PKCS",
        pk11SignsDigest: false,
        isEcdsa: false,
        oid: id_sha256WithRSAEncryption,
        parameters: nullParams
      };
    case HsmKeyAlgorithm.RSA_4096:
      return {
        mechanism: "CKM_SHA384_RSA_PKCS",
        pk11SignsDigest: false,
        isEcdsa: false,
        oid: id_sha384WithRSAEncryption,
        parameters: nullParams
      };
    case HsmKeyAlgorithm.ECC_P256:
      return {
        mechanism: "CKM_ECDSA_SHA256",
        pk11SignsDigest: false,
        isEcdsa: true,
        oid: id_ecdsaWithSHA256
      };
    case HsmKeyAlgorithm.ECC_P384:
      return {
        mechanism: "CKM_ECDSA_SHA384",
        pk11SignsDigest: false,
        isEcdsa: true,
        oid: id_ecdsaWithSHA384
      };
    default: {
      throw new BadRequestError({ message: `Unsupported keyAlgorithm for CSR: ${keyAlgorithm as string}` });
    }
  }
};

const bufferToArrayBuffer = (buf: Buffer): ArrayBuffer => {
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return ab;
};

const buildCodeSigningExtensions = (subjectAltNames?: string[]): Extensions => {
  const extensions: Extension[] = [];

  // RFC 5280 requires basicConstraints critical on code-signing leaves.
  const basic = AsnConvert.serialize(new BasicConstraints({ cA: false }));
  extensions.push(
    new Extension({
      extnID: id_ce_basicConstraints,
      critical: true,
      extnValue: new OctetString(basic)
    })
  );

  const ku = AsnConvert.serialize(new KeyUsage(KeyUsageFlags.digitalSignature));
  extensions.push(
    new Extension({
      extnID: id_ce_keyUsage,
      critical: true,
      extnValue: new OctetString(ku)
    })
  );

  const eku = AsnConvert.serialize(new ExtendedKeyUsage([id_kp_codeSigning]));
  extensions.push(
    new Extension({
      extnID: id_ce_extKeyUsage,
      critical: true,
      extnValue: new OctetString(eku)
    })
  );

  if (subjectAltNames && subjectAltNames.length > 0) {
    const san = new SubjectAlternativeName(subjectAltNames.map((dns) => new GeneralName({ dNSName: dns })));
    const sanDer = AsnConvert.serialize(san);
    extensions.push(
      new Extension({
        extnID: id_ce_subjectAltName,
        critical: false,
        extnValue: new OctetString(sanDer)
      })
    );
  }

  return new Extensions(extensions);
};

// PKCS#11 emits raw `r || s`; X.509 expects DER ECDSASigValue.
const rawRsToDer = (raw: Buffer): Buffer => {
  if (raw.length % 2 !== 0) {
    throw new BadRequestError({ message: `Unexpected ECDSA signature length: ${raw.length}` });
  }
  const half = raw.length / 2;
  const r = raw.subarray(0, half);
  const s = raw.subarray(half);
  const sig = new ECDSASigValue({
    r: bufferToArrayBuffer(r),
    s: bufferToArrayBuffer(s)
  });
  return Buffer.from(AsnConvert.serialize(sig));
};

export const buildCsrWithExternalSigner = async (input: BuildCsrInput): Promise<BuiltCsr> => {
  const shape = pickAlgorithmShape(input.keyAlgorithm);

  const spki = AsnConvert.parse(bufferToArrayBuffer(input.publicKeySpkiDer), SubjectPublicKeyInfo);

  const nameDer = new x509.Name([{ CN: [input.subjectCommonName] }]).toArrayBuffer();
  const subject = AsnConvert.parse(nameDer, Name);

  // extensionRequest (RFC 2985 OID 1.2.840.113549.1.9.14) carries EKU + SAN + KU + BC.
  const exts = buildCodeSigningExtensions(input.subjectAltNames);
  const extReqAttr = new Attribute({
    type: "1.2.840.113549.1.9.14",
    values: [AsnConvert.serialize(exts)]
  });

  const tbs = new CertificationRequestInfo({
    version: 0,
    subject,
    subjectPKInfo: spki,
    attributes: new Attributes([extReqAttr])
  });
  const tbsDer = Buffer.from(AsnConvert.serialize(tbs));

  // isDigest=false: HSM hashes via *_SHA<NN>_* so the wire payload stays raw TBS.
  let signatureBytes = await input.signCallback(tbsDer, shape.mechanism, shape.pk11SignsDigest);
  if (shape.isEcdsa) {
    signatureBytes = rawRsToDer(signatureBytes);
  }

  const sigAlg = new AlgorithmIdentifier({
    algorithm: shape.oid,
    parameters: shape.parameters
  });

  const csr = new CertificationRequest({
    certificationRequestInfo: tbs,
    signatureAlgorithm: sigAlg,
    signature: bufferToArrayBuffer(signatureBytes)
  });
  const csrDer = Buffer.from(AsnConvert.serialize(csr));
  const csrPem = x509.PemConverter.encode(csrDer, "CERTIFICATE REQUEST");

  return { csrPem, csrDer, signatureAlgorithmName: shape.mechanism };
};
