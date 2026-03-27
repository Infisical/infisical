import * as asn1js from "asn1js";
import {
  AlgorithmIdentifier,
  Attribute,
  Certificate,
  ContentInfo,
  EncapsulatedContentInfo,
  IssuerAndSerialNumber,
  SignedAndUnsignedAttributes,
  SignedData,
  SignerInfo
} from "pkijs";

import { crypto } from "@app/lib/crypto/cryptography";

import { buildResponseAttributes } from "./pki-scep-attributes";
import { rsaPkcs1Encrypt, rsaSign, symmetricEncryptWithOid } from "./pki-scep-crypto";
import { ScepFailInfo, ScepPkiStatus } from "./pki-scep-types";

export const buildCertRepSuccess = ({
  issuedCertDer,
  recipientCertDer,
  raCertDer,
  raPrivateKeyDer,
  transactionId,
  recipientNonce,
  clientCipherOid
}: {
  issuedCertDer: Buffer;
  recipientCertDer: Buffer;
  raCertDer: Buffer;
  raPrivateKeyDer: Buffer;
  transactionId: string;
  recipientNonce: Buffer;
  clientCipherOid?: string;
}): Buffer => {
  // Step 1: Wrap the issued certificate in a degenerate PKCS#7 (cert-only SignedData)
  const issuedCertAsn1 = asn1js.fromBER(issuedCertDer);
  const issuedCert = new Certificate({ schema: issuedCertAsn1.result });
  const degenerateSignedData = new SignedData({
    version: 1,
    encapContentInfo: new EncapsulatedContentInfo({
      eContentType: "1.2.840.113549.1.7.1" // id-data
    }),
    certificates: [issuedCert]
  });
  const degenerateContent = new ContentInfo({
    contentType: "1.2.840.113549.1.7.2", // id-signedData
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    content: degenerateSignedData.toSchema()
  });
  const certPayload = Buffer.from(degenerateContent.toSchema().toBER(false));

  // Step 2: Encrypt the cert payload in an EnvelopedData for the device
  // Extract the device's public key from its self-signed certificate
  const recipientCert = new crypto.nativeCrypto.X509Certificate(recipientCertDer);
  const recipientPublicKeyDer = Buffer.from(recipientCert.publicKey.export({ type: "spki", format: "der" }));

  const { encryptedContent, key: cek, iv, cipherOid } = symmetricEncryptWithOid(certPayload, clientCipherOid);
  const encryptedCek = rsaPkcs1Encrypt(cek, recipientPublicKeyDer);

  // Build EnvelopedData ASN.1 manually and wrap in ContentInfo
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const envelopedDataDer = buildEnvelopedDataDer(encryptedCek, encryptedContent, iv, cipherOid, recipientCertDer);

  // Wrap the EnvelopedData in a ContentInfo (PKCS#7 wrapper)
  const innerContentInfo = new asn1js.Sequence({
    value: [
      new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.3" }), // id-envelopedData
      new asn1js.Constructed({
        idBlock: { tagClass: 3, tagNumber: 0 }, // [0] EXPLICIT
        value: [asn1js.fromBER(envelopedDataDer).result]
      })
    ]
  });
  const innerContentInfoDer = Buffer.from(innerContentInfo.toBER(false));

  // Step 3: Build the outer SignedData
  const senderNonce = crypto.randomBytes(16);
  const responseAttrs = buildResponseAttributes({
    transactionId,
    recipientNonce,
    senderNonce,
    pkiStatus: ScepPkiStatus.SUCCESS
  });

  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  return buildSignedCertRep(innerContentInfoDer, responseAttrs, raCertDer, raPrivateKeyDer);
};

export const buildCertRepPending = ({
  raCertDer,
  raPrivateKeyDer,
  transactionId,
  recipientNonce
}: {
  raCertDer: Buffer;
  raPrivateKeyDer: Buffer;
  transactionId: string;
  recipientNonce: Buffer;
}): Buffer => {
  const senderNonce = crypto.randomBytes(16);
  const responseAttrs = buildResponseAttributes({
    transactionId,
    recipientNonce,
    senderNonce,
    pkiStatus: ScepPkiStatus.PENDING
  });

  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  return buildSignedCertRep(null, responseAttrs, raCertDer, raPrivateKeyDer);
};

export const buildCertRepFailure = ({
  raCertDer,
  raPrivateKeyDer,
  transactionId,
  recipientNonce,
  failInfo
}: {
  raCertDer: Buffer;
  raPrivateKeyDer: Buffer;
  transactionId: string;
  recipientNonce: Buffer;
  failInfo: ScepFailInfo;
}): Buffer => {
  const senderNonce = crypto.randomBytes(16);
  const responseAttrs = buildResponseAttributes({
    transactionId,
    recipientNonce,
    senderNonce,
    pkiStatus: ScepPkiStatus.FAILURE,
    failInfo
  });

  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  return buildSignedCertRep(null, responseAttrs, raCertDer, raPrivateKeyDer);
};

const buildSignedCertRep = (
  innerContent: Buffer | null,
  responseAttrs: Attribute[],
  raCertDer: Buffer,
  raPrivateKeyDer: Buffer
): Buffer => {
  const raCertAsn1 = asn1js.fromBER(raCertDer);
  const raCert = new Certificate({ schema: raCertAsn1.result });

  const encapContentInfo = new EncapsulatedContentInfo({
    eContentType: "1.2.840.113549.1.7.1" // id-data
  });

  if (innerContent) {
    encapContentInfo.eContent = new asn1js.OctetString({ valueHex: innerContent });
  }

  const signedAttrs = new SignedAndUnsignedAttributes({
    type: 0, // signedAttrs
    attributes: [
      // Content type attribute (required for signed attributes)
      new Attribute({
        type: "1.2.840.113549.1.9.3", // contentType
        values: [new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.1" })] // id-data
      }),
      // Message digest attribute
      new Attribute({
        type: "1.2.840.113549.1.9.4", // messageDigest
        values: [
          new asn1js.OctetString({
            valueHex: crypto.nativeCrypto
              .createHash("sha256")
              .update(Buffer.from(innerContent || Buffer.alloc(0)))
              .digest()
          })
        ]
      }),
      // SCEP response attributes
      ...responseAttrs
    ]
  });

  // Sign the signed attributes
  const signedAttrsDer = Buffer.from(signedAttrs.toSchema().toBER(false));
  signedAttrsDer[0] = 0x31; // Replace [0] IMPLICIT tag with SET tag for signing
  const signature = rsaSign(signedAttrsDer, raPrivateKeyDer);

  // Build SignerInfo
  const signerInfo = new SignerInfo({
    version: 1,
    sid: new IssuerAndSerialNumber({
      issuer: raCert.issuer,
      serialNumber: raCert.serialNumber
    }),
    digestAlgorithm: new AlgorithmIdentifier({
      algorithmId: "2.16.840.1.101.3.4.2.1" // SHA-256
    }),
    signedAttrs,
    signatureAlgorithm: new AlgorithmIdentifier({
      algorithmId: "1.2.840.113549.1.1.11" // sha256WithRSAEncryption
    }),
    signature: new asn1js.OctetString({ valueHex: signature })
  });

  // Build the SignedData
  const signedData = new SignedData({
    version: 1,
    digestAlgorithms: [
      new AlgorithmIdentifier({
        algorithmId: "2.16.840.1.101.3.4.2.1" // SHA-256
      })
    ],
    encapContentInfo,
    certificates: [raCert],
    signerInfos: [signerInfo]
  });

  // Wrap in ContentInfo
  const contentInfo = new ContentInfo({
    contentType: "1.2.840.113549.1.7.2", // id-signedData
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    content: signedData.toSchema()
  });

  return Buffer.from(contentInfo.toSchema().toBER(false));
};

const buildEnvelopedDataDer = (
  encryptedCek: Buffer,
  encryptedContent: Buffer,
  iv: Buffer,
  cipherOid: string,
  recipientCertDer: Buffer
): Buffer => {
  const recipientCertAsn1 = asn1js.fromBER(recipientCertDer);
  const recipientCert = new Certificate({ schema: recipientCertAsn1.result });

  // Build KeyTransRecipientInfo
  const ktri = new asn1js.Sequence({
    value: [
      // version
      new asn1js.Integer({ value: 0 }),
      // rid
      new IssuerAndSerialNumber({
        issuer: recipientCert.issuer,
        serialNumber: recipientCert.serialNumber
      }).toSchema(),
      // keyEncryptionAlgorithm
      new AlgorithmIdentifier({
        algorithmId: "1.2.840.113549.1.1.1" // rsaEncryption
      }).toSchema(),
      // encryptedKey
      new asn1js.OctetString({ valueHex: encryptedCek })
    ]
  });

  // Build EncryptedContentInfo
  const encryptedContentInfo = new asn1js.Sequence({
    value: [
      // contentType (id-data)
      new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.1" }),
      // contentEncryptionAlgorithm
      new AlgorithmIdentifier({
        algorithmId: cipherOid,
        algorithmParams: new asn1js.OctetString({ valueHex: iv })
      }).toSchema(),
      // encryptedContent
      new asn1js.Primitive({
        idBlock: { tagClass: 3, tagNumber: 0 }, // context-specific [0]
        valueHex: encryptedContent
      })
    ]
  });

  // Build EnvelopedData
  const envelopedData = new asn1js.Sequence({
    value: [
      // version
      new asn1js.Integer({ value: 0 }),
      // recipientInfos
      new asn1js.Set({ value: [ktri] }),
      // encryptedContentInfo
      encryptedContentInfo
    ]
  });

  return Buffer.from(envelopedData.toBER(false));
};
