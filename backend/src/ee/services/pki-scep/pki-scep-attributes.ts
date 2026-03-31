import * as asn1js from "asn1js";
import { Attribute } from "pkijs";

import { BadRequestError } from "@app/lib/errors";

import { SCEP_OIDS, ScepFailInfo, ScepMessageType, ScepPkiStatus } from "./pki-scep-types";

const findAttributeValue = (attributes: Attribute[], oid: string): asn1js.BaseBlock | undefined => {
  const attr = attributes.find((a) => a.type === oid);
  if (!attr || !attr.values || attr.values.length === 0) return undefined;
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return attr.values[0];
};

export const extractScepAttributes = (
  attributes: Attribute[]
): {
  messageType: ScepMessageType;
  transactionId: string;
  senderNonce: Buffer;
} => {
  const messageTypeValue = findAttributeValue(attributes, SCEP_OIDS.messageType);
  if (!messageTypeValue) throw new BadRequestError({ message: "Missing SCEP messageType attribute" });
  const messageType = (messageTypeValue as asn1js.PrintableString).getValue() as ScepMessageType;

  const transactionIdValue = findAttributeValue(attributes, SCEP_OIDS.transactionId);
  if (!transactionIdValue) throw new BadRequestError({ message: "Missing SCEP transactionId attribute" });
  const transactionId = (transactionIdValue as asn1js.PrintableString).getValue();

  const senderNonceValue = findAttributeValue(attributes, SCEP_OIDS.senderNonce);
  if (!senderNonceValue) throw new BadRequestError({ message: "Missing SCEP senderNonce attribute" });
  const senderNonce = Buffer.from((senderNonceValue as asn1js.OctetString).getValue());

  return { messageType, transactionId, senderNonce };
};

export const buildResponseAttributes = ({
  transactionId,
  recipientNonce,
  senderNonce,
  pkiStatus,
  failInfo
}: {
  transactionId: string;
  recipientNonce: Buffer;
  senderNonce: Buffer;
  pkiStatus: ScepPkiStatus;
  failInfo?: ScepFailInfo;
}): Attribute[] => {
  const attrs: Attribute[] = [
    new Attribute({
      type: SCEP_OIDS.messageType,
      values: [new asn1js.PrintableString({ value: ScepMessageType.CertRep })]
    }),
    new Attribute({
      type: SCEP_OIDS.transactionId,
      values: [new asn1js.PrintableString({ value: transactionId })]
    }),
    new Attribute({
      type: SCEP_OIDS.pkiStatus,
      values: [new asn1js.PrintableString({ value: pkiStatus })]
    }),
    new Attribute({
      type: SCEP_OIDS.recipientNonce,
      values: [new asn1js.OctetString({ valueHex: recipientNonce })]
    }),
    new Attribute({
      type: SCEP_OIDS.senderNonce,
      values: [new asn1js.OctetString({ valueHex: senderNonce })]
    })
  ];

  if (failInfo !== undefined && pkiStatus === ScepPkiStatus.FAILURE) {
    attrs.push(
      new Attribute({
        type: SCEP_OIDS.failInfo,
        values: [new asn1js.PrintableString({ value: failInfo })]
      })
    );
  }

  return attrs;
};
