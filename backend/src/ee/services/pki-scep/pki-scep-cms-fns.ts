import * as asn1js from "asn1js";
import { SignedAndUnsignedAttributes } from "pkijs";

import { crypto } from "@app/lib/crypto/cryptography";

const MESSAGE_DIGEST_ATTRIBUTE_OID = "1.2.840.113549.1.9.4";
const SIGNED_ATTRIBUTES_SET_TAG = 0x31;

export enum CmsSignedAttributesEncoding {
  Received = "received",
  Reencoded = "reencoded"
}

export enum CmsSignedAttributesFailure {
  MissingMessageDigest = "missing-message-digest",
  MessageDigestMismatch = "message-digest-mismatch"
}

export const verifyCmsSignedAttributes = ({
  signedAttributes,
  hash,
  content,
  encoding
}: {
  signedAttributes: SignedAndUnsignedAttributes;
  hash: string;
  content: Buffer | null;
  encoding: CmsSignedAttributesEncoding;
}): { signedBytes: Buffer } | { failure: CmsSignedAttributesFailure } => {
  const messageDigest: unknown = signedAttributes.attributes.find(
    (attribute) => attribute.type === MESSAGE_DIGEST_ATTRIBUTE_OID
  )?.values[0];
  if (!(messageDigest instanceof asn1js.OctetString)) {
    return { failure: CmsSignedAttributesFailure.MissingMessageDigest };
  }
  if (
    content &&
    !crypto.nativeCrypto.createHash(hash).update(content).digest().equals(Buffer.from(messageDigest.getValue()))
  ) {
    return { failure: CmsSignedAttributesFailure.MessageDigestMismatch };
  }

  const signedBytes =
    encoding === CmsSignedAttributesEncoding.Received
      ? Buffer.from(new Uint8Array(signedAttributes.encodedValue))
      : Buffer.from(signedAttributes.toSchema().toBER(false));
  signedBytes[0] = SIGNED_ATTRIBUTES_SET_TAG;
  return { signedBytes };
};
