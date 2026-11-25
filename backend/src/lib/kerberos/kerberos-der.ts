/* eslint-disable no-bitwise */
import * as asn1js from "asn1js";

export const GSS_TOKEN_TAG = 0x60;
export const DER_LONG_LENGTH_FLAG = 0x80;

export enum Asn1TagClass {
  Application = 2,
  Context = 3
}

export const encodeDerLength = (length: number) => {
  if (length < DER_LONG_LENGTH_FLAG) return Buffer.from([length]);
  const lengthBytes: number[] = [];
  for (let remaining = length; remaining > 0; remaining = Math.floor(remaining / 256)) {
    lengthBytes.unshift(remaining % 256);
  }
  return Buffer.from([DER_LONG_LENGTH_FLAG | lengthBytes.length, ...lengthBytes]);
};

export const toDer = (block: asn1js.BaseBlock) => Buffer.from(block.toBER());

export const contextTag = (tagNumber: number, value: asn1js.BaseBlock) =>
  new asn1js.Constructed({
    idBlock: { tagClass: Asn1TagClass.Context, tagNumber },
    value: [value]
  });

export const applicationTag = (tagNumber: number, value: asn1js.BaseBlock) =>
  new asn1js.Constructed({
    idBlock: { tagClass: Asn1TagClass.Application, tagNumber },
    value: [value]
  });

export const buildGssFrame = (mechanismOid: string, body: Buffer) => {
  const content = Buffer.concat([toDer(new asn1js.ObjectIdentifier({ value: mechanismOid })), body]);
  return Buffer.concat([Buffer.from([GSS_TOKEN_TAG]), encodeDerLength(content.length), content]);
};
