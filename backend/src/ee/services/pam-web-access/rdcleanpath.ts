/**
 * RDCleanPath codec.
 *
 * Matches the wire format defined by the `ironrdp-rdcleanpath` crate in
 * github.com/Devolutions/IronRDP. Context-specific EXPLICIT tags are
 * used throughout.
 *
 * ASN.1 schema:
 *
 *   RDCleanPathPdu ::= SEQUENCE {
 *     version              [0] EXPLICIT INTEGER,
 *     error                [1] EXPLICIT RDCleanPathErr OPTIONAL,
 *     destination          [2] EXPLICIT UTF8String OPTIONAL,
 *     proxyAuth            [3] EXPLICIT UTF8String OPTIONAL,
 *     serverAuth           [4] EXPLICIT UTF8String OPTIONAL,
 *     preconnectionBlob    [5] EXPLICIT UTF8String OPTIONAL,
 *     x224ConnectionPdu    [6] EXPLICIT OCTET STRING OPTIONAL,
 *     serverCertChain      [7] EXPLICIT SEQUENCE OF OCTET STRING OPTIONAL,
 *     serverAddr           [9] EXPLICIT UTF8String OPTIONAL
 *   }
 */
import {
  AsnArray,
  AsnParser,
  AsnProp,
  AsnPropTypes,
  AsnSerializer,
  AsnType,
  AsnTypeTypes,
  OctetString
} from "@peculiar/asn1-schema";

export const RDCLEAN_PATH_VERSION_1 = 3390;

export const RDCLEAN_PATH_GENERAL_ERROR = 1;
export const RDCLEAN_PATH_NEGOTIATION_ERROR = 2;

@AsnType({ type: AsnTypeTypes.Sequence })
export class RDCleanPathErr {
  @AsnProp({ type: AsnPropTypes.Integer, context: 0, implicit: false })
  public errorCode = 0;

  @AsnProp({ type: AsnPropTypes.Integer, context: 1, optional: true, implicit: false })
  public httpStatusCode?: number;

  @AsnProp({ type: AsnPropTypes.Integer, context: 2, optional: true, implicit: false })
  public wsaLastError?: number;

  @AsnProp({ type: AsnPropTypes.Integer, context: 3, optional: true, implicit: false })
  public tlsAlertCode?: number;
}

@AsnType({ type: AsnTypeTypes.Sequence, itemType: OctetString })
export class CertChain extends AsnArray<OctetString> {}

@AsnType({ type: AsnTypeTypes.Sequence })
export class RDCleanPathPdu {
  @AsnProp({ type: AsnPropTypes.Integer, context: 0, implicit: false })
  public version: number = RDCLEAN_PATH_VERSION_1;

  @AsnProp({ type: RDCleanPathErr, context: 1, optional: true, implicit: false })
  public error?: RDCleanPathErr;

  @AsnProp({ type: AsnPropTypes.Utf8String, context: 2, optional: true, implicit: false })
  public destination?: string;

  @AsnProp({ type: AsnPropTypes.Utf8String, context: 3, optional: true, implicit: false })
  public proxyAuth?: string;

  @AsnProp({ type: AsnPropTypes.Utf8String, context: 4, optional: true, implicit: false })
  public serverAuth?: string;

  @AsnProp({ type: AsnPropTypes.Utf8String, context: 5, optional: true, implicit: false })
  public preconnectionBlob?: string;

  @AsnProp({ type: OctetString, context: 6, optional: true, implicit: false })
  public x224ConnectionPdu?: OctetString;

  @AsnProp({ type: CertChain, context: 7, optional: true, implicit: false })
  public serverCertChain?: CertChain;

  @AsnProp({ type: AsnPropTypes.Utf8String, context: 9, optional: true, implicit: false })
  public serverAddr?: string;
}

export const decodeRDCleanPath = (bytes: Uint8Array): RDCleanPathPdu =>
  AsnParser.parse(bytes, RDCleanPathPdu);

export const encodeRDCleanPath = (pdu: RDCleanPathPdu): Uint8Array =>
  new Uint8Array(AsnSerializer.serialize(pdu));

export const newRDCleanPathRequest = (args: {
  x224ConnectionPdu: Uint8Array;
  destination: string;
  proxyAuth: string;
  preconnectionBlob?: string;
}): RDCleanPathPdu => {
  const pdu = new RDCleanPathPdu();
  pdu.version = RDCLEAN_PATH_VERSION_1;
  pdu.destination = args.destination;
  pdu.proxyAuth = args.proxyAuth;
  if (args.preconnectionBlob !== undefined) pdu.preconnectionBlob = args.preconnectionBlob;
  pdu.x224ConnectionPdu = new OctetString(args.x224ConnectionPdu);
  return pdu;
};

export const newRDCleanPathResponse = (args: {
  serverAddr: string;
  x224ConnectionPdu: Uint8Array;
  serverCertChain: Uint8Array[];
}): RDCleanPathPdu => {
  const pdu = new RDCleanPathPdu();
  pdu.version = RDCLEAN_PATH_VERSION_1;
  pdu.x224ConnectionPdu = new OctetString(args.x224ConnectionPdu);
  pdu.serverCertChain = new CertChain(args.serverCertChain.map((cert) => new OctetString(cert)));
  pdu.serverAddr = args.serverAddr;
  return pdu;
};

export const newRDCleanPathGeneralError = (): RDCleanPathPdu => {
  const pdu = new RDCleanPathPdu();
  pdu.version = RDCLEAN_PATH_VERSION_1;
  const err = new RDCleanPathErr();
  err.errorCode = RDCLEAN_PATH_GENERAL_ERROR;
  pdu.error = err;
  return pdu;
};

export const newRDCleanPathHttpError = (statusCode: number): RDCleanPathPdu => {
  const pdu = new RDCleanPathPdu();
  pdu.version = RDCLEAN_PATH_VERSION_1;
  const err = new RDCleanPathErr();
  err.errorCode = RDCLEAN_PATH_GENERAL_ERROR;
  err.httpStatusCode = statusCode;
  pdu.error = err;
  return pdu;
};

export const newRDCleanPathTlsError = (alertCode: number): RDCleanPathPdu => {
  const pdu = new RDCleanPathPdu();
  pdu.version = RDCLEAN_PATH_VERSION_1;
  const err = new RDCleanPathErr();
  err.errorCode = RDCLEAN_PATH_GENERAL_ERROR;
  err.tlsAlertCode = alertCode;
  pdu.error = err;
  return pdu;
};

export const newRDCleanPathWsaError = (wsaErrorCode: number): RDCleanPathPdu => {
  const pdu = new RDCleanPathPdu();
  pdu.version = RDCLEAN_PATH_VERSION_1;
  const err = new RDCleanPathErr();
  err.errorCode = RDCLEAN_PATH_GENERAL_ERROR;
  err.wsaLastError = wsaErrorCode;
  pdu.error = err;
  return pdu;
};

/** Extract the X.224 PDU bytes from a PDU, or undefined if absent. */
export const x224Bytes = (pdu: RDCleanPathPdu): Uint8Array | undefined => {
  if (!pdu.x224ConnectionPdu) return undefined;
  return new Uint8Array(pdu.x224ConnectionPdu.buffer);
};

/** Extract the cert chain as raw DER byte arrays. */
export const certChainBytes = (pdu: RDCleanPathPdu): Uint8Array[] => {
  if (!pdu.serverCertChain) return [];
  return pdu.serverCertChain.map((c) => new Uint8Array(c.buffer));
};
