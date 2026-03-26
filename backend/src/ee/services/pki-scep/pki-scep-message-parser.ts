import nodeCrypto from "node:crypto";

import * as asn1js from "asn1js";
import { Certificate, ContentInfo, SignedData } from "pkijs";

import { BadRequestError } from "@app/lib/errors";

import { extractScepAttributes } from "./pki-scep-attributes";
import { rsaPkcs1Decrypt, rsaVerify, symmetricDecrypt } from "./pki-scep-crypto";
import { ScepMessageType, TParsedScepMessage } from "./pki-scep-types";

export const parseScepMessage = (derMessage: Buffer, raPrivateKeyDer: Buffer): TParsedScepMessage => {
  // Parse the outer ContentInfo
  const contentInfoAsn1 = asn1js.fromBER(derMessage);
  if (contentInfoAsn1.offset === -1) {
    throw new BadRequestError({ message: "Failed to parse SCEP message: invalid DER encoding" });
  }
  const contentInfo = new ContentInfo({ schema: contentInfoAsn1.result });

  if (contentInfo.contentType !== "1.2.840.113549.1.7.2") {
    throw new BadRequestError({ message: `Unexpected content type: ${contentInfo.contentType}, expected SignedData` });
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const signedData = new SignedData({ schema: contentInfo.content });

  if (!signedData.certificates || signedData.certificates.length === 0) {
    throw new BadRequestError({ message: "No certificates found in SCEP SignedData" });
  }

  const signerCert = signedData.certificates[0];
  if (!(signerCert instanceof Certificate)) {
    throw new BadRequestError({ message: "Invalid signer certificate in SCEP SignedData" });
  }
  const signerCertDer = Buffer.from(signerCert.toSchema().toBER(false));

  // Extract SCEP attributes
  if (!signedData.signerInfos || signedData.signerInfos.length === 0) {
    throw new BadRequestError({ message: "No signerInfos found in SCEP SignedData" });
  }

  const signerInfo = signedData.signerInfos[0];
  if (!signerInfo.signedAttrs) {
    throw new BadRequestError({ message: "No signed attributes found" });
  }

  const scepAttrs = extractScepAttributes(signerInfo.signedAttrs.attributes);

  // Verify messageDigest attribute matches the hash of the encapsulated content (RFC 5652 §11.2)
  const DIGEST_OID_TO_HASH: Record<string, string> = {
    "2.16.840.1.101.3.4.2.1": "sha256",
    "1.3.14.3.2.26": "sha1",
    "2.16.840.1.101.3.4.2.2": "sha384",
    "2.16.840.1.101.3.4.2.3": "sha512"
  };

  const messageDigestAttr = signerInfo.signedAttrs.attributes.find((a) => a.type === "1.2.840.113549.1.9.4");
  if (messageDigestAttr && messageDigestAttr.values.length > 0 && signedData.encapContentInfo?.eContent) {
    const claimedDigest = Buffer.from((messageDigestAttr.values[0] as asn1js.OctetString).valueBlock.valueHexView);
    const hashAlgo = DIGEST_OID_TO_HASH[signerInfo.digestAlgorithm.algorithmId];

    if (hashAlgo) {
      const eContentBer = signedData.encapContentInfo.eContent.toBER(false);
      const eContentParsed = asn1js.fromBER(Buffer.from(eContentBer));
      const eContentBytes =
        eContentParsed.result instanceof asn1js.OctetString
          ? Buffer.from(eContentParsed.result.getValue())
          : Buffer.from(eContentBer);
      const computedDigest = nodeCrypto.createHash(hashAlgo).update(eContentBytes).digest();

      if (!claimedDigest.equals(computedDigest)) {
        throw new BadRequestError({ message: "SCEP message integrity check failed: messageDigest mismatch" });
      }
    }
  }

  // Verify the signature over the signed attributes
  if (signerInfo.signature) {
    const signedAttrsDer = Buffer.from(signerInfo.signedAttrs.toSchema().toBER(false));
    // CMS spec (RFC 5652 §5.4): signed attributes are encoded as SET (0x31) for verification
    signedAttrsDer[0] = 0x31;
    const signatureBytes = Buffer.from(signerInfo.signature.valueBlock.valueHexView);

    // Extract the digest algorithm from SignerInfo per RFC 5652 §5.3
    const digestAlgoOid = signerInfo.digestAlgorithm.algorithmId;
    if (!rsaVerify(signedAttrsDer, signatureBytes, signerCertDer, digestAlgoOid)) {
      throw new BadRequestError({ message: "SCEP message signature verification failed" });
    }
  }

  // For PKCSReq and RenewalReq, decrypt the inner EnvelopedData
  let csr: Buffer | undefined;
  let clientCipherOid: string | undefined;

  if (scepAttrs.messageType === ScepMessageType.PKCSReq || scepAttrs.messageType === ScepMessageType.RenewalReq) {
    if (!signedData.encapContentInfo || !signedData.encapContentInfo.eContent) {
      throw new BadRequestError({ message: "No encapsulated content in SCEP SignedData for PKCSReq/RenewalReq" });
    }

    // Extract the raw DER bytes of the EnvelopedData from the eContent.
    // The eContent is an ASN.1 OctetString (possibly constructed) that wraps
    // the DER-encoded EnvelopedData. We serialize it to BER, then extract just
    // the value bytes (stripping the outer OctetString TLV wrapper).
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const envelopedDataDer = extractEContentBytes(signedData.encapContentInfo.eContent);

    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const decrypted = decryptEnvelopedDataRaw(envelopedDataDer, raPrivateKeyDer);
    csr = decrypted.plainText;
    clientCipherOid = decrypted.cipherOid;
  }

  return {
    messageType: scepAttrs.messageType,
    transactionId: scepAttrs.transactionId,
    senderNonce: scepAttrs.senderNonce,
    signerCertDer,
    csr,
    clientCipherOid
  };
};

const extractEContentBytes = (eContent: asn1js.BaseBlock): Buffer => {
  const berBytes = eContent.toBER(false);
  const fullBuf = Buffer.from(berBytes);

  // Parse it back to get just the value portion
  const parsed = asn1js.fromBER(fullBuf);
  if (parsed.offset === -1) {
    // If parsing fails, treat the whole thing as raw bytes
    return fullBuf;
  }

  const { result } = parsed;

  // If it's an OctetString, get its value bytes
  if (result instanceof asn1js.OctetString) {
    // For constructed OctetStrings, getValue() concatenates all chunks
    const valueBytes = result.getValue();
    return Buffer.from(valueBytes);
  }

  // If it's a context-specific tag (e.g., [0] EXPLICIT wrapping), get the inner content
  if (result.idBlock.tagClass === 3) {
    // Context-specific — get inner bytes by stripping the outer TLV
    // eslint-disable-next-line @typescript-eslint/no-use-before-define
    const innerBytes = extractTlvValueBytes(fullBuf);
    return innerBytes;
  }

  // Otherwise, return the raw BER bytes as-is
  return fullBuf;
};

/* eslint-disable no-bitwise */
const extractTlvValueBytes = (der: Buffer): Buffer => {
  if (der.length < 2) {
    throw new BadRequestError({ message: "DER TLV too short to parse" });
  }

  let offset = 0;

  // High-tag-number form: if lower 5 bits are all 1s, subsequent bytes encode the tag
  if ((der[offset] & 0x1f) === 0x1f) {
    offset += 1;
    while (offset < der.length && (der[offset] & 0x80) !== 0) {
      offset += 1;
    }
    offset += 1; // skip the last tag byte
  } else {
    offset += 1;
  }

  if (offset >= der.length) {
    throw new BadRequestError({ message: "DER TLV truncated: no length byte" });
  }

  // Parse length
  if (der[offset] & 0x80) {
    const numLengthBytes = der[offset] & 0x7f;
    offset += 1 + numLengthBytes;
  } else {
    offset += 1;
  }

  if (offset > der.length) {
    throw new BadRequestError({ message: "DER TLV truncated: offset exceeds buffer" });
  }

  return der.subarray(offset);
};
/* eslint-enable no-bitwise */

const extractRawBytes = (element: asn1js.BaseBlock): Buffer => {
  // Case 1: OctetString — use getValue() which handles both primitive and constructed forms
  if (element instanceof asn1js.OctetString) {
    return Buffer.from(element.getValue());
  }

  // Case 2: element has valueBlock with valueHexView
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const vb = element.valueBlock as any;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (vb.valueHexView instanceof Uint8Array && vb.valueHexView.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return Buffer.from(vb.valueHexView as Uint8Array);
  }

  // Case 3: element has valueBlock with valueHex
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (vb.valueHex instanceof ArrayBuffer && vb.valueHex.byteLength > 0) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return Buffer.from(vb.valueHex as ArrayBuffer);
  }

  // Case 4: Constructed type
  // Serialize to DER and strip the outer tag+length to get raw value bytes
  const fullDer = Buffer.from(element.toBER(false));
  return extractTlvValueBytes(fullDer);
};

const decryptEnvelopedDataRaw = (
  envelopedDataDer: Buffer,
  raPrivateKeyDer: Buffer
): { plainText: Buffer; cipherOid: string } => {
  const asn1 = asn1js.fromBER(envelopedDataDer);
  if (asn1.offset === -1) {
    throw new BadRequestError({ message: "Failed to parse EnvelopedData DER" });
  }

  let seq = asn1.result as asn1js.Sequence;
  let valueBlock = seq.valueBlock.value;

  // The eContent may be wrapped in a ContentInfo SEQUENCE:
  //   SEQUENCE { OID(envelopedData), [0] EXPLICIT { SEQUENCE(EnvelopedData) } }
  if (
    valueBlock.length === 2 &&
    valueBlock[0] instanceof asn1js.ObjectIdentifier &&
    valueBlock[0].getValue() === "1.2.840.113549.1.7.3" // id-envelopedData
  ) {
    // Extract the EnvelopedData from inside
    const contextWrapper = valueBlock[1];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const innerElements = (contextWrapper.valueBlock as any).value as asn1js.BaseBlock[];
    if (innerElements && innerElements.length > 0) {
      seq = innerElements[0] as asn1js.Sequence;
      valueBlock = seq.valueBlock.value;
    }
  }

  // valueBlock[0] = version (Integer)
  // valueBlock[1] = recipientInfos (Set)
  // valueBlock[2] = encryptedContentInfo (Sequence)

  if (valueBlock.length < 3) {
    throw new BadRequestError({
      message: `EnvelopedData has unexpected structure: expected >= 3 elements, got ${valueBlock.length}`
    });
  }

  // Extract encrypted key from first RecipientInfo
  const recipientInfosSet = valueBlock[1] as asn1js.Set;
  if (
    !recipientInfosSet.valueBlock ||
    !recipientInfosSet.valueBlock.value ||
    recipientInfosSet.valueBlock.value.length === 0
  ) {
    throw new BadRequestError({ message: "No RecipientInfo found in EnvelopedData" });
  }

  const firstRecipientInfo = recipientInfosSet.valueBlock.value[0] as asn1js.Sequence;
  const ktri = firstRecipientInfo.valueBlock.value;

  // The encryptedKey is the LAST element of KeyTransRecipientInfo
  // Per RFC 5652: version, rid, keyEncryptionAlgorithm, encryptedKey
  // The encryptedKey is an OCTET STRING, but some encoders may produce it differently.
  const encryptedKeyElement = ktri[ktri.length - 1];
  const encryptedKey = extractRawBytes(encryptedKeyElement);

  if (encryptedKey.length === 0) {
    throw new BadRequestError({ message: "Failed to extract encrypted key from KeyTransRecipientInfo" });
  }

  // Decrypt the content-encryption key using RSA PKCS1v1.5
  const contentEncryptionKey = rsaPkcs1Decrypt(encryptedKey, raPrivateKeyDer);

  // Extract encrypted content info
  const encContentInfo = (valueBlock[2] as asn1js.Sequence).valueBlock.value;

  if (encContentInfo.length < 3) {
    throw new BadRequestError({
      message: `EncryptedContentInfo has unexpected structure: expected >= 3 elements, got ${encContentInfo.length}`
    });
  }

  // encContentInfo[0] = contentType OID
  // encContentInfo[1] = contentEncryptionAlgorithm (SEQUENCE { OID, params })
  // encContentInfo[2] = encryptedContent

  // Get cipher algorithm OID and IV from AlgorithmIdentifier
  const algoSeq = (encContentInfo[1] as asn1js.Sequence).valueBlock.value;
  const cipherOid = (algoSeq[0] as asn1js.ObjectIdentifier).getValue();

  // IV is the second element of the AlgorithmIdentifier
  const ivElement = algoSeq[1];
  const iv = extractRawBytes(ivElement);

  if (iv.length === 0) {
    throw new BadRequestError({ message: "Failed to extract IV from content encryption algorithm" });
  }

  // Get the encrypted content
  const encContentElement = encContentInfo[2];
  // eslint-disable-next-line @typescript-eslint/no-use-before-define
  const encryptedContent = extractEncryptedContent(encContentElement);

  if (encryptedContent.length === 0) {
    throw new BadRequestError({ message: "Failed to extract encrypted content from EncryptedContentInfo" });
  }

  // Decrypt the content
  return {
    plainText: symmetricDecrypt(encryptedContent, contentEncryptionKey, iv, cipherOid),
    cipherOid
  };
};

const extractEncryptedContent = (element: asn1js.BaseBlock): Buffer => {
  if (element instanceof asn1js.OctetString) {
    return Buffer.from(element.getValue());
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const vb = element.valueBlock as any;

  // Check if it's a constructed type with sub-elements
  // Constructed context-specific tags have valueBlock.value as an array of sub-elements
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (Array.isArray(vb.value) && (vb.value as asn1js.BaseBlock[]).length > 0) {
    const chunks: Buffer[] = [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    for (const sub of vb.value as asn1js.BaseBlock[]) {
      chunks.push(extractRawBytes(sub));
    }
    return Buffer.concat(chunks);
  }

  // Primitive context-specific raw value bytes are in valueHexView or valueHex
  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (vb.valueHexView instanceof Uint8Array && vb.valueHexView.length > 0) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return Buffer.from(vb.valueHexView as Uint8Array);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
  if (vb.valueHex instanceof ArrayBuffer && vb.valueHex.byteLength > 0) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return Buffer.from(vb.valueHex as ArrayBuffer);
  }

  // Last resort: serialize to DER and strip the tag+length
  const fullDer = Buffer.from(element.toBER(false));
  return extractTlvValueBytes(fullDer);
};
