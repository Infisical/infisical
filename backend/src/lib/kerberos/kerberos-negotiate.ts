/* eslint-disable no-bitwise */
import * as asn1js from "asn1js";

import { crypto } from "@app/lib/crypto/cryptography";

import { kerberosDecrypt, kerberosEncrypt } from "./kerberos-crypto";
import {
  applicationTag,
  Asn1TagClass,
  buildGssFrame,
  contextTag,
  DER_LONG_LENGTH_FLAG,
  GSS_TOKEN_TAG,
  toDer
} from "./kerberos-der";
import { KerberosError } from "./kerberos-error";
import { parsePacLogonInfo, verifyPacServerSignature } from "./kerberos-pac";
import {
  KerberosEncryptionType,
  KerberosFailureReason,
  KerberosKeyUsage,
  TKerberosIdentity,
  TNegotiateToken,
  TVerifyNegotiateTokenDTO
} from "./kerberos-types";

const NEGOTIATE_SCHEME = "negotiate";
const NTLM_SIGNATURE = "NTLMSSP";
const GSS_TOKEN_ID_BYTES = 2;
const GSS_AP_REPLY_TOKEN_ID = Buffer.from([0x02, 0x00]);
const DER_LENGTH_BYTE_COUNT_MASK = 0x7f;
const AP_OPTIONS_MUTUAL_REQUIRED = 0x20;
const KERBEROS_PROTOCOL_VERSION = 5;
const KERBEROS_AP_REPLY_MESSAGE_TYPE = 15;
const SPNEGO_ACCEPT_COMPLETED = 0;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const COMPUTER_ACCOUNT_SUFFIX = "$";
const GSS_CHECKSUM_TYPE = 0x8003;
const GSS_CHECKSUM_BINDINGS_LENGTH = 16;
const GSS_CHECKSUM_BINDINGS_OFFSET = 4;
const GSS_CHECKSUM_MIN_LENGTH = 24;

enum MechanismOid {
  Spnego = "1.3.6.1.5.5.2",
  Kerberos = "1.2.840.113554.1.2.2",
  MicrosoftKerberos = "1.2.840.48018.1.2.2",
  Ntlm = "1.3.6.1.4.1.311.2.2.10"
}

enum KerberosApplicationTag {
  Ticket = 1,
  Authenticator = 2,
  EncTicketPart = 3,
  ApRequest = 14,
  ApReply = 15,
  EncApReplyPart = 27
}

enum AuthorizationDataType {
  IfRelevant = 1,
  Win2kPac = 128
}

type TErrorContext = {
  serviceName?: string;
  keyVersion?: number | null;
  clientName?: string;
};

type TAsn1Fields = Map<number, asn1js.BaseBlock>;

type TGssKerberosToken = {
  isSpnego: boolean;
  mechanismOid: string;
  apRequest: Buffer;
};

type TTicket = {
  sessionKeyType: number;
  sessionKey: Buffer;
  clientRealm: string;
  clientName: string;
  endTime: Date;
  pac: Buffer | null;
};

type TAuthenticator = {
  clientRealm: string;
  clientName: string;
  microseconds: number;
  time: Date;
  sequenceNumber: number | null;
  checksum: { type: number; value: Buffer } | null;
};

const parseDer = (data: Buffer) => {
  const { offset, result } = asn1js.fromBER(data);
  if (offset === -1) throw new Error("Invalid DER encoding");
  return { block: result, length: offset };
};

const unwrapTag = (block: asn1js.BaseBlock | undefined, tagClass: Asn1TagClass, tagNumber: number) => {
  if (
    !(block instanceof asn1js.Constructed) ||
    block.idBlock.tagClass !== tagClass ||
    block.idBlock.tagNumber !== tagNumber
  ) {
    throw new Error(`Expected ASN.1 tag ${tagNumber}`);
  }
  return block.valueBlock.value[0];
};

const readFields = (block: asn1js.BaseBlock | undefined): TAsn1Fields => {
  if (!(block instanceof asn1js.Sequence)) throw new Error("Expected an ASN.1 sequence");
  const fields: TAsn1Fields = new Map();
  for (const field of block.valueBlock.value) {
    if (field instanceof asn1js.Constructed && field.idBlock.tagClass === Asn1TagClass.Context) {
      fields.set(field.idBlock.tagNumber, field.valueBlock.value[0]);
    }
  }
  return fields;
};

const readField = <T extends asn1js.BaseBlock>(
  fields: TAsn1Fields,
  tagNumber: number,
  type: new (...args: never[]) => T
): T => {
  const field = fields.get(tagNumber);
  if (!(field instanceof type)) throw new Error(`Unexpected value in ASN.1 field ${tagNumber}`);
  return field;
};

const readInteger = (fields: TAsn1Fields, tagNumber: number) =>
  Number(readField(fields, tagNumber, asn1js.Integer).toBigInt());

const readOptionalInteger = (fields: TAsn1Fields, tagNumber: number) =>
  fields.has(tagNumber) ? readInteger(fields, tagNumber) : null;

const readString = (fields: TAsn1Fields, tagNumber: number) =>
  readField(fields, tagNumber, asn1js.GeneralString).getValue();

const readOctets = (fields: TAsn1Fields, tagNumber: number) =>
  Buffer.from(readField(fields, tagNumber, asn1js.OctetString).getValue());

const readTime = (fields: TAsn1Fields, tagNumber: number) =>
  readField(fields, tagNumber, asn1js.GeneralizedTime).toDate();

const readPrincipalName = (fields: TAsn1Fields, tagNumber: number) =>
  readField(readFields(fields.get(tagNumber)), 1, asn1js.Sequence)
    .valueBlock.value.map((name) => {
      if (!(name instanceof asn1js.GeneralString)) throw new Error("Unexpected principal name component");
      return name.getValue();
    })
    .join("/");

const readEncryptedData = (fields: TAsn1Fields, tagNumber: number) => {
  const encryptedData = readFields(fields.get(tagNumber));
  return {
    encryptionType: readInteger(encryptedData, 0),
    keyVersion: readOptionalInteger(encryptedData, 1),
    cipher: readOctets(encryptedData, 2)
  };
};

const readAuthorizationData = (block: asn1js.BaseBlock | undefined) => {
  if (!(block instanceof asn1js.Sequence)) throw new Error("Expected authorization data");
  return block.valueBlock.value.map((element) => {
    const fields = readFields(element);
    return { type: readInteger(fields, 0), data: readOctets(fields, 1) };
  });
};

const findPac = (authorizationData: asn1js.BaseBlock | undefined) => {
  for (const element of readAuthorizationData(authorizationData)) {
    if (element.type === AuthorizationDataType.IfRelevant) {
      const pac = readAuthorizationData(parseDer(element.data).block).find(
        (inner) => inner.type === AuthorizationDataType.Win2kPac
      );
      if (pac) return pac.data;
    }
  }
  return null;
};

const asMalformed = <T>(parse: () => T, message: string, context: TErrorContext): T => {
  try {
    return parse();
  } catch (error) {
    if (error instanceof KerberosError) throw error;
    throw new KerberosError({
      reason: KerberosFailureReason.MalformedToken,
      message,
      ...context
    });
  }
};

const decryptPart = ({
  key,
  usage,
  cipher,
  message,
  context
}: {
  key: Buffer;
  usage: KerberosKeyUsage;
  cipher: Buffer;
  message: string;
  context: TErrorContext;
}) => {
  try {
    return kerberosDecrypt(key, usage, cipher);
  } catch {
    throw new KerberosError({
      reason: KerberosFailureReason.DecryptFailed,
      message,
      ...context
    });
  }
};

export const readAuthorizationHeader = (authorizationHeader?: string) => {
  const [scheme, ...rest] = (authorizationHeader ?? "").trim().split(" ");
  const value = rest.join(" ").trim();
  if (scheme.toLowerCase() !== NEGOTIATE_SCHEME || !value) {
    throw new KerberosError({
      reason: KerberosFailureReason.NoTicket,
      message: "The request has no Kerberos ticket in a Negotiate Authorization header."
    });
  }
  return Buffer.from(value, "base64");
};

const isNtlmMessage = (data: Buffer) => data.subarray(0, NTLM_SIGNATURE.length).toString("latin1") === NTLM_SIGNATURE;

const ntlmError = () =>
  new KerberosError({
    reason: KerberosFailureReason.Ntlm,
    message:
      "The computer sent NTLM instead of Kerberos. Check that the URL's host name matches the keytab's service principal."
  });

const readGssFrame = (token: Buffer) => {
  if (token[0] !== GSS_TOKEN_TAG) throw new Error("Not a GSS-API token");
  let headerLength = 2;
  let contentLength = token[1];
  if (contentLength & DER_LONG_LENGTH_FLAG) {
    const lengthByteCount = contentLength & DER_LENGTH_BYTE_COUNT_MASK;
    contentLength = token.readUIntBE(headerLength, lengthByteCount);
    headerLength += lengthByteCount;
  }
  const content = token.subarray(headerLength, headerLength + contentLength);
  const mechanism = parseDer(content);
  if (!(mechanism.block instanceof asn1js.ObjectIdentifier)) throw new Error("GSS-API token has no mechanism");
  return {
    mechanismOid: mechanism.block.getValue(),
    body: content.subarray(mechanism.length)
  };
};

const unwrapNegotiateToken = (token: Buffer): TGssKerberosToken => {
  if (isNtlmMessage(token)) throw ntlmError();
  const frame = readGssFrame(token);
  if (frame.mechanismOid === MechanismOid.Kerberos || frame.mechanismOid === MechanismOid.MicrosoftKerberos) {
    return {
      isSpnego: false,
      mechanismOid: MechanismOid.Kerberos,
      apRequest: frame.body.subarray(GSS_TOKEN_ID_BYTES)
    };
  }
  if (frame.mechanismOid !== MechanismOid.Spnego) throw new Error("Unsupported GSS-API mechanism");

  const negTokenInit = readFields(unwrapTag(parseDer(frame.body).block, Asn1TagClass.Context, 0));
  const mechanismOids = negTokenInit.has(0)
    ? readField(negTokenInit, 0, asn1js.Sequence).valueBlock.value.map((mechanism) => {
        if (!(mechanism instanceof asn1js.ObjectIdentifier)) throw new Error("Unexpected SPNEGO mechanism");
        return mechanism.getValue();
      })
    : [];
  if (!negTokenInit.has(2)) {
    if (mechanismOids[0] === MechanismOid.Ntlm) throw ntlmError();
    throw new Error("SPNEGO token has no mechanism token");
  }
  const mechanismToken = readOctets(negTokenInit, 2);
  if (isNtlmMessage(mechanismToken)) throw ntlmError();
  return {
    isSpnego: true,
    mechanismOid: mechanismOids[0] ?? MechanismOid.Kerberos,
    apRequest: readGssFrame(mechanismToken).body.subarray(GSS_TOKEN_ID_BYTES)
  };
};

const parseApRequest = (apRequest: Buffer) => {
  const fields = readFields(
    unwrapTag(parseDer(apRequest).block, Asn1TagClass.Application, KerberosApplicationTag.ApRequest)
  );
  const apOptionsField = readField(fields, 2, asn1js.BitString);
  if (apOptionsField.idBlock.isConstructed) throw new Error("Unexpected constructed BIT STRING in AP options");
  const apOptions = apOptionsField.valueBlock.valueHexView;
  const ticketFields = readFields(unwrapTag(fields.get(3), Asn1TagClass.Application, KerberosApplicationTag.Ticket));
  const ticketEncPart = readEncryptedData(ticketFields, 3);
  return {
    isMutualRequired: Boolean(apOptions[0] & AP_OPTIONS_MUTUAL_REQUIRED),
    serviceName: readPrincipalName(ticketFields, 2),
    ticketEncryptionType: ticketEncPart.encryptionType,
    ticketKeyVersion: ticketEncPart.keyVersion,
    ticketCipher: ticketEncPart.cipher,
    authenticatorCipher: readEncryptedData(fields, 4).cipher
  };
};

const parseEncTicketPart = (plain: Buffer): TTicket => {
  const fields = readFields(
    unwrapTag(parseDer(plain).block, Asn1TagClass.Application, KerberosApplicationTag.EncTicketPart)
  );
  const sessionKey = readFields(fields.get(1));
  return {
    sessionKeyType: readInteger(sessionKey, 0),
    sessionKey: readOctets(sessionKey, 1),
    clientRealm: readString(fields, 2),
    clientName: readPrincipalName(fields, 3),
    endTime: readTime(fields, 7),
    pac: fields.has(10) ? findPac(fields.get(10)) : null
  };
};

const readChecksum = (fields: TAsn1Fields, tagNumber: number) => {
  if (!fields.has(tagNumber)) return null;
  const checksum = readFields(fields.get(tagNumber));
  return { type: readInteger(checksum, 0), value: readOctets(checksum, 1) };
};

const parseAuthenticator = (plain: Buffer): TAuthenticator => {
  const fields = readFields(
    unwrapTag(parseDer(plain).block, Asn1TagClass.Application, KerberosApplicationTag.Authenticator)
  );
  return {
    clientRealm: readString(fields, 1),
    clientName: readPrincipalName(fields, 2),
    checksum: readChecksum(fields, 3),
    microseconds: readInteger(fields, 4),
    time: readTime(fields, 5),
    sequenceNumber: readOptionalInteger(fields, 7)
  };
};

const readChannelBinding = (checksum: TAuthenticator["checksum"]) => {
  if (
    !checksum ||
    checksum.type !== GSS_CHECKSUM_TYPE ||
    checksum.value.length < GSS_CHECKSUM_MIN_LENGTH ||
    checksum.value.readUInt32LE(0) !== GSS_CHECKSUM_BINDINGS_LENGTH
  ) {
    return null;
  }
  const channelBinding = checksum.value.subarray(
    GSS_CHECKSUM_BINDINGS_OFFSET,
    GSS_CHECKSUM_BINDINGS_OFFSET + GSS_CHECKSUM_BINDINGS_LENGTH
  );
  return channelBinding.some((byte) => byte !== 0) ? channelBinding : null;
};

const verifyChannelBinding = (
  authenticator: TAuthenticator,
  expectedChannelBindings: Buffer[] | null,
  context: TErrorContext
) => {
  const channelBinding = readChannelBinding(authenticator.checksum);
  if (!channelBinding) {
    throw new KerberosError({
      reason: KerberosFailureReason.MissingChannelBinding,
      message:
        "The request was refused because its Kerberos authenticator carries no channel binding, so it did not come over HTTPS with channel binding. Make sure computers reach the enrollment URL over HTTPS.",
      ...context
    });
  }
  if (!expectedChannelBindings) return;

  const isExpected = expectedChannelBindings.some(
    (expected) =>
      expected.length === channelBinding.length && crypto.nativeCrypto.timingSafeEqual(expected, channelBinding)
  );
  if (!isExpected) {
    throw new KerberosError({
      reason: KerberosFailureReason.ChannelBindingMismatch,
      message:
        "The request was refused because its Kerberos channel binding is for a TLS certificate this server does not present, so the ticket may have been relayed from another HTTPS site.",
      ...context
    });
  }
};

const verifyTicketClaims = async ({
  ticket,
  authenticator,
  checkReplay,
  context
}: {
  ticket: TTicket;
  authenticator: TAuthenticator;
  checkReplay: TVerifyNegotiateTokenDTO["checkReplay"];
  context: TErrorContext;
}) => {
  const ticketClient = `${ticket.clientName}@${ticket.clientRealm}`;
  const authenticatorClient = `${authenticator.clientName}@${authenticator.clientRealm}`;
  if (ticketClient.toLowerCase() !== authenticatorClient.toLowerCase()) {
    throw new KerberosError({
      reason: KerberosFailureReason.ClientMismatch,
      message: `The ticket is for ${ticketClient}, but the authenticator names ${authenticatorClient}.`,
      ...context
    });
  }

  const skewMs = Math.abs(Date.now() - authenticator.time.getTime());
  if (skewMs > MAX_CLOCK_SKEW_MS) {
    throw new KerberosError({
      reason: KerberosFailureReason.ClockSkew,
      message: `The computer's clock is ${Math.round(skewMs / 1000)} seconds away from the server's clock. The limit is ${MAX_CLOCK_SKEW_MS / 1000} seconds.`,
      ...context
    });
  }

  if (ticket.endTime.getTime() < Date.now()) {
    throw new KerberosError({
      reason: KerberosFailureReason.Expired,
      message: `The Kerberos ticket expired at ${ticket.endTime.toISOString()}.`,
      ...context
    });
  }

  const isFirstUse = await checkReplay(`${ticketClient}|${authenticator.time.getTime()}|${authenticator.microseconds}`);
  if (!isFirstUse) {
    throw new KerberosError({
      reason: KerberosFailureReason.Replay,
      message: "This Kerberos authenticator was already used.",
      ...context
    });
  }
};

const readPacLogonInfo = (ticket: TTicket, serviceKey: Buffer, context: TErrorContext) => {
  const { pac } = ticket;
  if (!pac) {
    throw new KerberosError({
      reason: KerberosFailureReason.MissingPac,
      message: "The Kerberos ticket has no PAC, so the computer's groups and SID are unknown.",
      ...context
    });
  }

  const isSignatureValid = asMalformed(
    () => verifyPacServerSignature(pac, serviceKey),
    "The ticket's PAC is not valid",
    context
  );
  if (!isSignatureValid) {
    throw new KerberosError({
      reason: KerberosFailureReason.InvalidPacSignature,
      message: "The PAC server signature does not match the keytab key. The keytab may be out of date.",
      ...context
    });
  }

  const logonInfo = asMalformed(
    () => parsePacLogonInfo(pac),
    "The ticket's PAC logon information is not valid",
    context
  );
  if (!logonInfo) {
    throw new KerberosError({
      reason: KerberosFailureReason.MissingPac,
      message: "The ticket's PAC has no logon information.",
      ...context
    });
  }
  return logonInfo;
};

const buildMutualAuthToken = (token: TNegotiateToken, ticket: TTicket, authenticator: TAuthenticator) => {
  const encApReplyPart = applicationTag(
    KerberosApplicationTag.EncApReplyPart,
    new asn1js.Sequence({
      value: [
        contextTag(0, new asn1js.GeneralizedTime({ valueDate: authenticator.time })),
        contextTag(1, new asn1js.Integer({ value: authenticator.microseconds })),
        ...(authenticator.sequenceNumber === null
          ? []
          : [contextTag(3, new asn1js.Integer({ value: authenticator.sequenceNumber }))])
      ]
    })
  );
  const apReply = applicationTag(
    KerberosApplicationTag.ApReply,
    new asn1js.Sequence({
      value: [
        contextTag(0, new asn1js.Integer({ value: KERBEROS_PROTOCOL_VERSION })),
        contextTag(1, new asn1js.Integer({ value: KERBEROS_AP_REPLY_MESSAGE_TYPE })),
        contextTag(
          2,
          new asn1js.Sequence({
            value: [
              contextTag(0, new asn1js.Integer({ value: ticket.sessionKeyType })),
              contextTag(
                2,
                new asn1js.OctetString({
                  valueHex: kerberosEncrypt(ticket.sessionKey, KerberosKeyUsage.ApReplyEncPart, toDer(encApReplyPart))
                })
              )
            ]
          })
        )
      ]
    })
  );

  const gssToken = buildGssFrame(MechanismOid.Kerberos, Buffer.concat([GSS_AP_REPLY_TOKEN_ID, toDer(apReply)]));
  if (!token.isSpnego) return gssToken.toString("base64");

  const negTokenResp = contextTag(
    1,
    new asn1js.Sequence({
      value: [
        contextTag(0, new asn1js.Enumerated({ value: SPNEGO_ACCEPT_COMPLETED })),
        contextTag(1, new asn1js.ObjectIdentifier({ value: token.mechanismOid })),
        contextTag(2, new asn1js.OctetString({ valueHex: gssToken }))
      ]
    })
  );
  return toDer(negTokenResp).toString("base64");
};

export const parseNegotiateToken = (rawToken: Buffer): TNegotiateToken => {
  const token = asMalformed(
    () => unwrapNegotiateToken(rawToken),
    "The Negotiate token is not a valid Kerberos token",
    {}
  );
  const apRequest = asMalformed(() => parseApRequest(token.apRequest), "The Kerberos AP-REQ is not valid", {});
  return { isSpnego: token.isSpnego, mechanismOid: token.mechanismOid, ...apRequest };
};

const RC4_HMAC_ENCRYPTION_TYPE = 23;
const ENCRYPTION_TYPE_NAMES: Record<number, string> = {
  [KerberosEncryptionType.Aes128CtsHmacSha196]: "AES128",
  [KerberosEncryptionType.Aes256CtsHmacSha196]: "AES256",
  [RC4_HMAC_ENCRYPTION_TYPE]: "RC4"
};

const noMatchingKeyError = (negotiateToken: TNegotiateToken, nextStep?: string) =>
  new KerberosError({
    reason: KerberosFailureReason.NoMatchingKey,
    message: `The keytab has no key for ${negotiateToken.serviceName} with key version ${negotiateToken.ticketKeyVersion ?? "none"} and encryption type ${ENCRYPTION_TYPE_NAMES[negotiateToken.ticketEncryptionType] ?? negotiateToken.ticketEncryptionType}. ${
      nextStep ??
      (negotiateToken.ticketEncryptionType === RC4_HMAC_ENCRYPTION_TYPE
        ? "The ticket uses RC4: turn on AES for the service account, then export and upload a new keytab."
        : "Upload a keytab that holds this key version, exported after the service account's last password change.")
    }`,
    serviceName: negotiateToken.serviceName,
    keyVersion: negotiateToken.ticketKeyVersion
  });

export const assertTicketIsForServicePrincipal = (
  negotiateToken: TNegotiateToken,
  { principal, newestKeyVersion }: { principal: string; newestKeyVersion: number }
) => {
  if (negotiateToken.serviceName.toLowerCase() !== principal.toLowerCase()) {
    throw noMatchingKeyError(
      negotiateToken,
      `The keytab is for ${principal}. Upload a keytab for ${negotiateToken.serviceName}, or have computers use the host name the keytab was created for.`
    );
  }
  if (negotiateToken.ticketKeyVersion === null) {
    throw noMatchingKeyError(
      negotiateToken,
      "The ticket carries no key version, so it can't be matched to a keytab key. Check that the service principal is mapped to one domain account."
    );
  }
  if (negotiateToken.ticketKeyVersion > newestKeyVersion) {
    throw noMatchingKeyError(negotiateToken);
  }
};

export const verifyNegotiateToken = async ({
  negotiateToken,
  keytabEntries,
  checkReplay,
  expectedChannelBindings
}: TVerifyNegotiateTokenDTO): Promise<TKerberosIdentity & { responseToken: string | null }> => {
  const keyContext: TErrorContext = {
    serviceName: negotiateToken.serviceName,
    keyVersion: negotiateToken.ticketKeyVersion
  };
  const keytabEntry = keytabEntries.find(
    (entry) =>
      entry.encryptionType === negotiateToken.ticketEncryptionType &&
      entry.keyVersion === negotiateToken.ticketKeyVersion &&
      entry.principal.toLowerCase() === negotiateToken.serviceName.toLowerCase()
  );
  if (!keytabEntry) {
    const hasKeyVersion = keytabEntries.some(
      (entry) =>
        entry.keyVersion === negotiateToken.ticketKeyVersion &&
        entry.principal.toLowerCase() === negotiateToken.serviceName.toLowerCase()
    );
    throw noMatchingKeyError(
      negotiateToken,
      hasKeyVersion && negotiateToken.ticketEncryptionType !== RC4_HMAC_ENCRYPTION_TYPE
        ? `The keytab has this key version but not ${ENCRYPTION_TYPE_NAMES[negotiateToken.ticketEncryptionType] ?? `encryption type ${negotiateToken.ticketEncryptionType}`}. Export the keytab again with that encryption type and upload it.`
        : undefined
    );
  }

  const ticket = asMalformed(
    () =>
      parseEncTicketPart(
        decryptPart({
          key: keytabEntry.key,
          usage: KerberosKeyUsage.TicketEncPart,
          cipher: negotiateToken.ticketCipher,
          message:
            "The Kerberos ticket could not be decrypted with the keytab key. Create the keytab again with ktpass and upload it.",
          context: keyContext
        })
      ),
    "The decrypted Kerberos ticket is not valid",
    keyContext
  );
  const context: TErrorContext = {
    ...keyContext,
    clientName: ticket.clientName
  };
  const authenticator = asMalformed(
    () =>
      parseAuthenticator(
        decryptPart({
          key: ticket.sessionKey,
          usage: KerberosKeyUsage.ApRequestAuthenticator,
          cipher: negotiateToken.authenticatorCipher,
          message: "The Kerberos authenticator could not be decrypted with the ticket's session key.",
          context
        })
      ),
    "The decrypted Kerberos authenticator is not valid",
    context
  );

  verifyChannelBinding(authenticator, expectedChannelBindings, context);
  await verifyTicketClaims({ ticket, authenticator, checkReplay, context });
  const logonInfo = readPacLogonInfo(ticket, keytabEntry.key, context);
  if (!ticket.clientName.endsWith(COMPUTER_ACCOUNT_SUFFIX)) {
    throw new KerberosError({
      reason: KerberosFailureReason.NotComputerAccount,
      message: `${ticket.clientName} is a user account. Only computer accounts, whose names end in $, are accepted.`,
      ...context
    });
  }

  return {
    clientName: ticket.clientName,
    realm: ticket.clientRealm,
    serviceName: negotiateToken.serviceName,
    keyVersion: keytabEntry.keyVersion,
    accountSid: logonInfo.accountSid,
    groupSids: logonInfo.groupSids,
    domainSid: logonInfo.domainSid,
    responseToken: negotiateToken.isMutualRequired ? buildMutualAuthToken(negotiateToken, ticket, authenticator) : null
  };
};
