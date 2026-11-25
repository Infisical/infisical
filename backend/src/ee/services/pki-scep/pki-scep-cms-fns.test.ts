import crypto from "node:crypto";

import * as asn1js from "asn1js";
import { Attribute, SignedAndUnsignedAttributes } from "pkijs";

import { CmsSignedAttributesEncoding, CmsSignedAttributesFailure, verifyCmsSignedAttributes } from "./pki-scep-cms-fns";

const CONTENT = Buffer.from("signed content");

const buildSignedAttributes = ({
  messageDigest = crypto.createHash("sha256").update(CONTENT).digest(),
  hasIndefiniteLength = false
}: { messageDigest?: Buffer | null; hasIndefiniteLength?: boolean } = {}) => {
  const schema = new SignedAndUnsignedAttributes({
    type: 0,
    attributes: [
      new Attribute({
        type: "1.2.840.113549.1.9.3",
        values: [new asn1js.ObjectIdentifier({ value: "1.2.840.113549.1.7.1" })]
      }),
      ...(messageDigest
        ? [
            new Attribute({
              type: "1.2.840.113549.1.9.4",
              values: [new asn1js.OctetString({ valueHex: messageDigest })]
            })
          ]
        : [])
    ]
  }).toSchema();
  schema.lenBlock.isIndefiniteForm = hasIndefiniteLength;
  const received = Buffer.from(schema.toBER(false));
  return {
    received,
    signedAttributes: new SignedAndUnsignedAttributes({ type: 0, schema: asn1js.fromBER(received).result })
  };
};

describe("verifyCmsSignedAttributes", () => {
  test.each([
    [CmsSignedAttributesEncoding.Received, true],
    [CmsSignedAttributesEncoding.Reencoded, false]
  ])("signs over the %s signed attributes, tagged as a SET", (encoding, keepsSenderEncoding) => {
    const { received, signedAttributes } = buildSignedAttributes({ hasIndefiniteLength: true });

    const result = verifyCmsSignedAttributes({ signedAttributes, hash: "sha256", content: CONTENT, encoding });

    if (!("signedBytes" in result)) throw new Error("Expected signed bytes");
    expect(result.signedBytes[0]).toBe(0x31);
    expect(result.signedBytes.subarray(1).equals(received.subarray(1))).toBe(keepsSenderEncoding);
    expect(result.signedBytes[1]).toBe(keepsSenderEncoding ? 0x80 : received.length - 4);
  });

  test("refuses a message digest that does not match the content", () => {
    const { signedAttributes } = buildSignedAttributes({ messageDigest: Buffer.alloc(32, 0xab) });

    expect(
      verifyCmsSignedAttributes({
        signedAttributes,
        hash: "sha256",
        content: CONTENT,
        encoding: CmsSignedAttributesEncoding.Received
      })
    ).toEqual({ failure: CmsSignedAttributesFailure.MessageDigestMismatch });
  });

  test("refuses signed attributes without a message digest", () => {
    const { signedAttributes } = buildSignedAttributes({ messageDigest: null });

    expect(
      verifyCmsSignedAttributes({
        signedAttributes,
        hash: "sha256",
        content: null,
        encoding: CmsSignedAttributesEncoding.Reencoded
      })
    ).toEqual({ failure: CmsSignedAttributesFailure.MissingMessageDigest });
  });

  test("skips the digest comparison when there is no content to compare", () => {
    const { signedAttributes } = buildSignedAttributes({ messageDigest: Buffer.alloc(32, 0xab) });

    expect(
      verifyCmsSignedAttributes({
        signedAttributes,
        hash: "sha256",
        content: null,
        encoding: CmsSignedAttributesEncoding.Reencoded
      })
    ).toHaveProperty("signedBytes");
  });
});
