import * as asn1js from "asn1js";

import { crypto } from "@app/lib/crypto/cryptography";
import { sidStringToBuffer } from "@app/lib/windows-sid/windows-sid-fns";

import { kerberosChecksum, kerberosEncrypt } from "./kerberos-crypto";
import { applicationTag, buildGssFrame, contextTag, toDer } from "./kerberos-der";
import { KerberosEncryptionType, KerberosKeyUsage, TKeytabEntry } from "./kerberos-types";

export const TEST_SERVICE_NAME = "HTTP/app.example.com";
export const TEST_REALM = "CORP.EXAMPLE.COM";
export const TEST_COMPUTER_NAME = "LAPTOP01$";
export const TEST_DOMAIN_SID = "S-1-5-21-1111111111-2222222222-3333333333";

const KERBEROS_OID = "1.2.840.113554.1.2.2";
const MICROSOFT_KERBEROS_OID = "1.2.840.48018.1.2.2";
const SPNEGO_OID = "1.3.6.1.5.5.2";
const AP_REQUEST_TOKEN_ID = Buffer.from([0x01, 0x00]);
const MUTUAL_REQUIRED_FLAG = 0x20;
const GSS_CHECKSUM_TYPE = 0x8003;
const GSS_MUTUAL_AND_INTEGRITY_FLAGS = 0x22;

const uint16BE = (value: number) => {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16BE(value);
  return bytes;
};

const uint16LE = (value: number) => {
  const bytes = Buffer.alloc(2);
  bytes.writeUInt16LE(value);
  return bytes;
};

const uint32BE = (value: number) => {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32BE(value);
  return bytes;
};

const countedString = (value: string) => {
  const bytes = Buffer.from(value, "utf8");
  return Buffer.concat([uint16BE(bytes.length), bytes]);
};

export const buildTestGssChecksumValue = (channelBindings: Buffer = crypto.randomBytes(16)) => {
  const value = Buffer.alloc(24);
  value.writeUInt32LE(channelBindings.length, 0);
  channelBindings.copy(value, 4);
  value.writeUInt32LE(GSS_MUTUAL_AND_INTEGRITY_FLAGS, 20);
  return value;
};

export const buildTestKeytab = (entries: TKeytabEntry[], extraEntries: Buffer[] = []) => {
  const encodedEntries = entries.map((entry) => {
    const components = entry.principal.split("/");
    return Buffer.concat([
      uint16BE(components.length),
      countedString(entry.realm),
      ...components.map(countedString),
      uint32BE(1),
      uint32BE(0),
      Buffer.from([entry.keyVersion % 256]),
      uint16BE(entry.encryptionType),
      uint16BE(entry.key.length),
      entry.key,
      uint32BE(entry.keyVersion)
    ]);
  });
  return Buffer.concat([
    uint16BE(0x0502),
    ...[...encodedEntries, ...extraEntries].flatMap((entry) => [uint32BE(entry.length), entry])
  ]);
};

export const buildTestKeytabEntry = (overrides: Partial<TKeytabEntry> = {}): TKeytabEntry => ({
  realm: TEST_REALM,
  principal: TEST_SERVICE_NAME,
  keyVersion: 3,
  encryptionType: KerberosEncryptionType.Aes256CtsHmacSha196,
  key: crypto.randomBytes(32),
  ...overrides
});

const createNdrWriter = () => {
  const chunks: Buffer[] = [];
  let length = 0;
  const write = (chunk: Buffer) => {
    chunks.push(chunk);
    length += chunk.length;
  };
  const uint32 = (value: number) => {
    const bytes = Buffer.alloc(4);
    bytes.writeUInt32LE(value);
    write(bytes);
  };
  const align = () => {
    if (length % 4) write(Buffer.alloc(4 - (length % 4)));
  };
  return { write, uint32, align, toBuffer: () => Buffer.concat(chunks) };
};

const ENABLED_GROUP_ATTRIBUTES = 7;
const DISABLED_GROUP_ATTRIBUTES = 3;

type TTestLogonInfo = {
  effectiveName: string;
  domainSid: string;
  userRid: number;
  primaryGroupRid: number;
  groupRids: number[];
  disabledGroupRids: number[];
  extraSids: string[];
  disabledExtraSids: string[];
  resourceGroups: { domainSid: string; rids: number[]; disabledRids: number[] } | null;
};

const withAttributes = <T>(enabled: T[], disabled: T[]) => [
  ...enabled.map((value) => ({ value, attributes: ENABLED_GROUP_ATTRIBUTES })),
  ...disabled.map((value) => ({ value, attributes: DISABLED_GROUP_ATTRIBUTES }))
];

const buildLogonInfo = ({
  effectiveName,
  domainSid,
  userRid,
  primaryGroupRid,
  groupRids: enabledGroupRids,
  disabledGroupRids,
  extraSids: enabledExtraSids,
  disabledExtraSids,
  resourceGroups
}: TTestLogonInfo) => {
  const groupRids = withAttributes(enabledGroupRids, disabledGroupRids);
  const extraSids = withAttributes(enabledExtraSids, disabledExtraSids);
  const resourceGroupRids = resourceGroups ? withAttributes(resourceGroups.rids, resourceGroups.disabledRids) : [];
  const writer = createNdrWriter();
  const nameBytes = Buffer.from(effectiveName, "utf16le");
  writer.write(Buffer.alloc(16));
  writer.uint32(0x20000);
  writer.write(Buffer.alloc(48));
  writer.write(Buffer.concat([uint16LE(nameBytes.length), uint16LE(nameBytes.length)]));
  writer.uint32(0x20004);
  writer.write(Buffer.alloc(5 * 8));
  writer.write(Buffer.alloc(4));
  writer.uint32(userRid);
  writer.uint32(primaryGroupRid);
  writer.uint32(groupRids.length);
  writer.uint32(groupRids.length ? 0x20008 : 0);
  writer.write(Buffer.alloc(4 + 16 + 8 + 8));
  writer.uint32(0x2000c);
  writer.write(Buffer.alloc(8 + 32));
  writer.uint32(extraSids.length);
  writer.uint32(extraSids.length ? 0x20010 : 0);
  writer.uint32(resourceGroups ? 0x20018 : 0);
  writer.uint32(resourceGroupRids.length);
  writer.uint32(resourceGroupRids.length ? 0x2001c : 0);

  writer.align();
  writer.uint32(effectiveName.length);
  writer.uint32(0);
  writer.uint32(effectiveName.length);
  writer.write(nameBytes);
  writer.align();
  if (groupRids.length) {
    writer.align();
    writer.uint32(groupRids.length);
    groupRids.forEach(({ value, attributes }) => {
      writer.uint32(value);
      writer.uint32(attributes);
    });
  }
  const writeSid = (sid: string) => {
    const bytes = sidStringToBuffer(sid);
    writer.align();
    writer.uint32(bytes[1]);
    writer.write(bytes);
    writer.align();
  };
  writeSid(domainSid);
  if (extraSids.length) {
    writer.align();
    writer.uint32(extraSids.length);
    extraSids.forEach(({ attributes }, index) => {
      writer.uint32(0x20100 + index * 4);
      writer.uint32(attributes);
    });
    extraSids.forEach(({ value }) => writeSid(value));
  }
  if (resourceGroups) {
    writeSid(resourceGroups.domainSid);
    if (resourceGroupRids.length) {
      writer.align();
      writer.uint32(resourceGroupRids.length);
      resourceGroupRids.forEach(({ value, attributes }) => {
        writer.uint32(value);
        writer.uint32(attributes);
      });
    }
  }
  return writer.toBuffer();
};

export const buildTestPac = ({
  serviceKey,
  logonInfo = {}
}: {
  serviceKey: Buffer;
  logonInfo?: Partial<TTestLogonInfo>;
}) => {
  const signatureType = serviceKey.length === 32 ? 16 : 15;
  const signatureBuffer = () => {
    const bytes = Buffer.alloc(16);
    bytes.writeInt32LE(signatureType, 0);
    return bytes;
  };
  const buffers = [
    {
      type: 1,
      data: buildLogonInfo({
        effectiveName: TEST_COMPUTER_NAME,
        domainSid: TEST_DOMAIN_SID,
        userRid: 1105,
        primaryGroupRid: 515,
        groupRids: [515],
        disabledGroupRids: [],
        extraSids: ["S-1-18-1"],
        disabledExtraSids: [],
        resourceGroups: null,
        ...logonInfo
      })
    },
    { type: 6, data: signatureBuffer() },
    { type: 7, data: signatureBuffer() }
  ];

  const header = Buffer.alloc(8 + buffers.length * 16);
  header.writeUInt32LE(buffers.length, 0);
  let offset = header.length;
  const bodies: Buffer[] = [];
  const offsets: number[] = [];
  buffers.forEach((buffer, index) => {
    header.writeUInt32LE(buffer.type, 8 + index * 16);
    header.writeUInt32LE(buffer.data.length, 8 + index * 16 + 4);
    header.writeBigUInt64LE(BigInt(offset), 8 + index * 16 + 8);
    offsets.push(offset);
    const padded = Buffer.concat([buffer.data, Buffer.alloc((8 - (buffer.data.length % 8)) % 8)]);
    bodies.push(padded);
    offset += padded.length;
  });

  const pac = Buffer.concat([header, ...bodies]);
  kerberosChecksum(serviceKey, KerberosKeyUsage.PacChecksum, pac).copy(pac, offsets[1] + 4);
  crypto.randomBytes(12).copy(pac, offsets[2] + 4);
  return pac;
};

const integer = (value: number) => new asn1js.Integer({ value });

const principalName = (name: string) =>
  new asn1js.Sequence({
    value: [
      contextTag(0, integer(name.includes("/") ? 2 : 1)),
      contextTag(
        1,
        new asn1js.Sequence({
          value: name.split("/").map((component) => new asn1js.GeneralString({ value: component }))
        })
      )
    ]
  });

const encryptedData = (encryptionType: number, keyVersion: number | null, cipher: Buffer) =>
  new asn1js.Sequence({
    value: [
      contextTag(0, integer(encryptionType)),
      ...(keyVersion === null ? [] : [contextTag(1, integer(keyVersion))]),
      contextTag(2, new asn1js.OctetString({ valueHex: cipher }))
    ]
  });

export type TTestNegotiateOptions = {
  serviceKey: Buffer;
  encryptionType?: KerberosEncryptionType;
  keyVersion?: number | null;
  serviceName?: string;
  clientName?: string;
  authenticatorClientName?: string;
  time?: Date;
  endTime?: Date;
  microseconds?: number;
  sequenceNumber?: number | null;
  isMutualRequired?: boolean;
  isSpnego?: boolean;
  pac?: Buffer | null;
  authenticatorKey?: Buffer;
  channelBinding?: Buffer;
  checksum?: { type: number; value: Buffer } | null;
};

export const wholeSecondsNow = () => new Date(Math.floor(Date.now() / 1000) * 1000);

export const buildTestNegotiateHeader = ({
  serviceKey,
  encryptionType = KerberosEncryptionType.Aes256CtsHmacSha196,
  keyVersion = 3,
  serviceName = TEST_SERVICE_NAME,
  clientName = TEST_COMPUTER_NAME,
  authenticatorClientName = clientName,
  time = wholeSecondsNow(),
  endTime = new Date(Date.now() + 60 * 60 * 1000),
  microseconds = 123456,
  sequenceNumber = 0x12345678,
  isMutualRequired = true,
  isSpnego = true,
  pac = buildTestPac({ serviceKey }),
  authenticatorKey,
  channelBinding,
  checksum = { type: GSS_CHECKSUM_TYPE, value: buildTestGssChecksumValue(channelBinding) }
}: TTestNegotiateOptions) => {
  const sessionKey = crypto.randomBytes(32);
  const authorizationData =
    pac === null
      ? []
      : [
          contextTag(
            10,
            new asn1js.Sequence({
              value: [
                new asn1js.Sequence({
                  value: [
                    contextTag(0, integer(1)),
                    contextTag(
                      1,
                      new asn1js.OctetString({
                        valueHex: toDer(
                          new asn1js.Sequence({
                            value: [
                              new asn1js.Sequence({
                                value: [
                                  contextTag(0, integer(128)),
                                  contextTag(1, new asn1js.OctetString({ valueHex: pac }))
                                ]
                              })
                            ]
                          })
                        )
                      })
                    )
                  ]
                })
              ]
            })
          )
        ];

  const encTicketPart = applicationTag(
    3,
    new asn1js.Sequence({
      value: [
        contextTag(0, new asn1js.BitString({ valueHex: Buffer.alloc(4) })),
        contextTag(
          1,
          new asn1js.Sequence({
            value: [
              contextTag(0, integer(KerberosEncryptionType.Aes256CtsHmacSha196)),
              contextTag(1, new asn1js.OctetString({ valueHex: sessionKey }))
            ]
          })
        ),
        contextTag(2, new asn1js.GeneralString({ value: TEST_REALM })),
        contextTag(3, principalName(clientName)),
        contextTag(
          4,
          new asn1js.Sequence({
            value: [contextTag(0, integer(1)), contextTag(1, new asn1js.OctetString({ valueHex: Buffer.alloc(0) }))]
          })
        ),
        contextTag(5, new asn1js.GeneralizedTime({ valueDate: time })),
        contextTag(7, new asn1js.GeneralizedTime({ valueDate: endTime })),
        ...authorizationData
      ]
    })
  );

  const authenticator = applicationTag(
    2,
    new asn1js.Sequence({
      value: [
        contextTag(0, integer(5)),
        contextTag(1, new asn1js.GeneralString({ value: TEST_REALM })),
        contextTag(2, principalName(authenticatorClientName)),
        ...(checksum === null
          ? []
          : [
              contextTag(
                3,
                new asn1js.Sequence({
                  value: [
                    contextTag(0, integer(checksum.type)),
                    contextTag(1, new asn1js.OctetString({ valueHex: checksum.value }))
                  ]
                })
              )
            ]),
        contextTag(4, integer(microseconds)),
        contextTag(5, new asn1js.GeneralizedTime({ valueDate: time })),
        ...(sequenceNumber === null ? [] : [contextTag(7, integer(sequenceNumber))])
      ]
    })
  );

  const ticket = applicationTag(
    1,
    new asn1js.Sequence({
      value: [
        contextTag(0, integer(5)),
        contextTag(1, new asn1js.GeneralString({ value: TEST_REALM })),
        contextTag(2, principalName(serviceName)),
        contextTag(
          3,
          encryptedData(
            encryptionType,
            keyVersion,
            kerberosEncrypt(serviceKey, KerberosKeyUsage.TicketEncPart, toDer(encTicketPart))
          )
        )
      ]
    })
  );

  const apRequest = applicationTag(
    14,
    new asn1js.Sequence({
      value: [
        contextTag(0, integer(5)),
        contextTag(1, integer(14)),
        contextTag(
          2,
          new asn1js.BitString({
            valueHex: Buffer.from([isMutualRequired ? MUTUAL_REQUIRED_FLAG : 0, 0, 0, 0])
          })
        ),
        contextTag(3, ticket),
        contextTag(
          4,
          encryptedData(
            KerberosEncryptionType.Aes256CtsHmacSha196,
            null,
            kerberosEncrypt(
              authenticatorKey ?? sessionKey,
              KerberosKeyUsage.ApRequestAuthenticator,
              toDer(authenticator)
            )
          )
        )
      ]
    })
  );

  const kerberosToken = buildGssFrame(KERBEROS_OID, Buffer.concat([AP_REQUEST_TOKEN_ID, toDer(apRequest)]));
  const token = isSpnego
    ? buildGssFrame(
        SPNEGO_OID,
        toDer(
          contextTag(
            0,
            new asn1js.Sequence({
              value: [
                contextTag(
                  0,
                  new asn1js.Sequence({
                    value: [
                      new asn1js.ObjectIdentifier({
                        value: MICROSOFT_KERBEROS_OID
                      }),
                      new asn1js.ObjectIdentifier({ value: KERBEROS_OID })
                    ]
                  })
                ),
                contextTag(2, new asn1js.OctetString({ valueHex: kerberosToken }))
              ]
            })
          )
        )
      )
    : kerberosToken;

  return {
    authorizationHeader: `Negotiate ${token.toString("base64")}`,
    sessionKey
  };
};
