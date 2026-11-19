import * as asn1js from "asn1js";

import { crypto } from "@app/lib/crypto/cryptography";

import { kerberosDecrypt } from "./kerberos-crypto";
import { KerberosError } from "./kerberos-error";
import {
  assertTicketIsForServicePrincipal,
  parseNegotiateToken,
  readAuthorizationHeader,
  verifyNegotiateToken
} from "./kerberos-negotiate";
import { KerberosEncryptionType, KerberosFailureReason, KerberosKeyUsage } from "./kerberos-types";
import {
  buildTestGssChecksumValue,
  buildTestKeytabEntry,
  buildTestNegotiateHeader,
  buildTestPac,
  TEST_COMPUTER_NAME,
  TEST_DOMAIN_SID,
  TEST_REALM,
  TEST_SERVICE_NAME,
  TTestNegotiateOptions,
  wholeSecondsNow
} from "./kerberos.test-helpers";

const MICROSOFT_KERBEROS_OID = "1.2.840.48018.1.2.2";

const checksumWithBindingLength = (length: number) => {
  const value = buildTestGssChecksumValue();
  value.writeUInt32LE(length, 0);
  return value;
};

const firstChild = (block: asn1js.BaseBlock) => {
  if (!(block instanceof asn1js.Constructed)) throw new Error("Expected a constructed ASN.1 value");
  return block.valueBlock.value[0];
};

const sequenceChildren = (block: asn1js.BaseBlock) => {
  if (!(block instanceof asn1js.Sequence)) throw new Error("Expected an ASN.1 sequence");
  return block.valueBlock.value.map(firstChild);
};

const readMutualAuthReply = (responseToken: string | null, sessionKey: Buffer, isSpnego: boolean) => {
  if (!responseToken) throw new Error("Expected a response token");
  let gssToken = Buffer.from(responseToken, "base64");
  if (isSpnego) {
    const [negState, supportedMechanism, innerToken] = sequenceChildren(firstChild(asn1js.fromBER(gssToken).result));
    expect(negState).toBeInstanceOf(asn1js.Enumerated);
    expect((negState as asn1js.Enumerated).valueBlock.valueDec).toBe(0);
    expect((supportedMechanism as asn1js.ObjectIdentifier).getValue()).toBe(MICROSOFT_KERBEROS_OID);
    gssToken = Buffer.from((innerToken as asn1js.OctetString).getValue());
  }

  expect(gssToken[0]).toBe(0x60);
  const lengthBytes = gssToken[1] >= 0x80 ? gssToken[1] - 0x80 : 0;
  const content = gssToken.subarray(2 + lengthBytes);
  const mechanism = asn1js.fromBER(content);
  expect((mechanism.result as asn1js.ObjectIdentifier).getValue()).toBe("1.2.840.113554.1.2.2");
  expect([...content.subarray(mechanism.offset, mechanism.offset + 2)]).toEqual([0x02, 0x00]);

  const [protocolVersion, messageType, encPart] = sequenceChildren(
    firstChild(asn1js.fromBER(content.subarray(mechanism.offset + 2)).result)
  );
  expect((protocolVersion as asn1js.Integer).valueBlock.valueDec).toBe(5);
  expect((messageType as asn1js.Integer).valueBlock.valueDec).toBe(15);
  const [, cipher] = sequenceChildren(encPart);
  const plain = kerberosDecrypt(
    sessionKey,
    KerberosKeyUsage.ApReplyEncPart,
    Buffer.from((cipher as asn1js.OctetString).getValue())
  );
  const [time, microseconds, sequenceNumber] = sequenceChildren(firstChild(asn1js.fromBER(plain).result));
  return {
    time: (time as asn1js.GeneralizedTime).toDate(),
    microseconds: (microseconds as asn1js.Integer).valueBlock.valueDec,
    sequenceNumber: sequenceNumber ? Number((sequenceNumber as asn1js.Integer).toBigInt()) : null
  };
};

describe("verifyNegotiateToken", () => {
  const keytabEntry = buildTestKeytabEntry();

  const verify = async (
    authorizationHeader?: string,
    checkReplay = vi.fn().mockResolvedValue(true),
    expectedChannelBindings: Buffer[] | null = null
  ) =>
    verifyNegotiateToken({
      negotiateToken: parseNegotiateToken(readAuthorizationHeader(authorizationHeader)),
      keytabEntries: [keytabEntry],
      checkReplay,
      expectedChannelBindings
    });

  const verifyToken = (options: Partial<TTestNegotiateOptions> = {}) =>
    verify(buildTestNegotiateHeader({ serviceKey: keytabEntry.key, ...options }).authorizationHeader);

  const expectFailure = async (
    verification: Promise<unknown>,
    reason: KerberosFailureReason,
    fields: Partial<Pick<KerberosError, "serviceName" | "keyVersion" | "clientName">> = {}
  ) => {
    const error: unknown = await verification.catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(KerberosError);
    expect(error).toMatchObject({ reason, ...fields });
  };

  test("returns the computer's identity and a SPNEGO mutual-auth reply", async () => {
    const time = wholeSecondsNow();
    const checkReplay = vi.fn().mockResolvedValue(true);
    const { authorizationHeader, sessionKey } = buildTestNegotiateHeader({
      serviceKey: keytabEntry.key,
      time
    });

    const result = await verify(authorizationHeader, checkReplay);

    expect(result).toMatchObject({
      clientName: TEST_COMPUTER_NAME,
      realm: TEST_REALM,
      serviceName: TEST_SERVICE_NAME,
      keyVersion: 3,
      accountSid: `${TEST_DOMAIN_SID}-1105`,
      domainSid: TEST_DOMAIN_SID,
      groupSids: [`${TEST_DOMAIN_SID}-1105`, `${TEST_DOMAIN_SID}-515`, `${TEST_DOMAIN_SID}-515`, "S-1-18-1"]
    });
    expect(checkReplay).toHaveBeenCalledWith(`${TEST_COMPUTER_NAME}@${TEST_REALM}|${time.getTime()}|123456`);
    expect(readMutualAuthReply(result.responseToken, sessionKey, true)).toEqual({
      time,
      microseconds: 123456,
      sequenceNumber: 0x12345678
    });
  });

  test("accepts a raw Kerberos token and replies without SPNEGO", async () => {
    const time = wholeSecondsNow();
    const { authorizationHeader, sessionKey } = buildTestNegotiateHeader({
      serviceKey: keytabEntry.key,
      time,
      isSpnego: false,
      sequenceNumber: null
    });

    const result = await verify(authorizationHeader);

    expect(readMutualAuthReply(result.responseToken, sessionKey, false)).toEqual({
      time,
      microseconds: 123456,
      sequenceNumber: null
    });
  });

  test("accepts an AES128 key", async () => {
    const aes128Entry = buildTestKeytabEntry({
      encryptionType: KerberosEncryptionType.Aes128CtsHmacSha196,
      key: crypto.randomBytes(16)
    });
    const { authorizationHeader } = buildTestNegotiateHeader({
      serviceKey: aes128Entry.key,
      encryptionType: KerberosEncryptionType.Aes128CtsHmacSha196
    });

    const result = await verifyNegotiateToken({
      negotiateToken: parseNegotiateToken(readAuthorizationHeader(authorizationHeader)),
      keytabEntries: [keytabEntry, aes128Entry],
      checkReplay: vi.fn().mockResolvedValue(true),
      expectedChannelBindings: null
    });

    expect(result.clientName).toBe(TEST_COMPUTER_NAME);
  });

  test("matches the service name case insensitively", async () => {
    const result = await verifyToken({
      serviceName: TEST_SERVICE_NAME.toUpperCase()
    });

    expect(result.serviceName).toBe(TEST_SERVICE_NAME.toUpperCase());
  });

  test("returns no reply token when the client did not ask for mutual authentication", async () => {
    const result = await verifyToken({ isMutualRequired: false });

    expect(result.responseToken).toBeNull();
  });

  test.each([undefined, "", "Negotiate", "Basic dXNlcjpwYXNz"])(
    "refuses a request without a Negotiate ticket (%s)",
    async (authorizationHeader) => {
      await expectFailure(verify(authorizationHeader), KerberosFailureReason.NoTicket);
    }
  );

  test("refuses NTLM", async () => {
    const ntlm = Buffer.concat([Buffer.from("NTLMSSP"), Buffer.from([0, 1, 0, 0, 0])]).toString("base64");

    await expectFailure(verify(`Negotiate ${ntlm}`), KerberosFailureReason.Ntlm);
  });

  test("refuses a token that is not Kerberos", async () => {
    await expectFailure(
      verify(`Negotiate ${Buffer.from("not a kerberos token").toString("base64")}`),
      KerberosFailureReason.MalformedToken
    );
  });

  test("refuses a ticket for another key version and names the ticket's key", async () => {
    await expectFailure(verifyToken({ keyVersion: 4 }), KerberosFailureReason.NoMatchingKey, {
      serviceName: TEST_SERVICE_NAME,
      keyVersion: 4
    });
  });

  test("names the encryption type the keytab lacks when it has the ticket's key version", async () => {
    const { authorizationHeader } = buildTestNegotiateHeader({
      serviceKey: crypto.randomBytes(16),
      encryptionType: KerberosEncryptionType.Aes128CtsHmacSha196
    });

    await expect(
      verifyNegotiateToken({
        negotiateToken: parseNegotiateToken(readAuthorizationHeader(authorizationHeader)),
        keytabEntries: [keytabEntry],
        checkReplay: vi.fn().mockResolvedValue(true),
        expectedChannelBindings: null
      })
    ).rejects.toThrow("The keytab has this key version but not AES128.");
  });

  test("tells the admin to turn on AES when the ticket uses RC4", async () => {
    const negotiateToken = {
      ...parseNegotiateToken(
        readAuthorizationHeader(buildTestNegotiateHeader({ serviceKey: keytabEntry.key }).authorizationHeader)
      ),
      ticketEncryptionType: 23
    };

    await expect(
      verifyNegotiateToken({
        negotiateToken,
        keytabEntries: [keytabEntry],
        checkReplay: vi.fn().mockResolvedValue(true),
        expectedChannelBindings: null
      })
    ).rejects.toThrow("The ticket uses RC4: turn on AES for the service account");
  });

  test("refuses a ticket for another service name and names it", async () => {
    await expectFailure(verifyToken({ serviceName: "HTTP/old.example.com" }), KerberosFailureReason.NoMatchingKey, {
      serviceName: "HTTP/old.example.com",
      keyVersion: 3
    });
  });

  test("refuses a ticket encrypted with another key", async () => {
    const { authorizationHeader } = buildTestNegotiateHeader({
      serviceKey: crypto.randomBytes(32)
    });

    await expectFailure(verify(authorizationHeader), KerberosFailureReason.DecryptFailed, {
      serviceName: TEST_SERVICE_NAME
    });
  });

  test("refuses an authenticator encrypted with another key", async () => {
    await expectFailure(
      verifyToken({ authenticatorKey: crypto.randomBytes(32) }),
      KerberosFailureReason.DecryptFailed,
      { clientName: TEST_COMPUTER_NAME }
    );
  });

  test("refuses an authenticator that names another client", async () => {
    await expectFailure(verifyToken({ authenticatorClientName: "OTHER01$" }), KerberosFailureReason.ClientMismatch, {
      clientName: TEST_COMPUTER_NAME
    });
  });

  test("refuses an authenticator more than five minutes old", async () => {
    await expectFailure(
      verifyToken({
        time: new Date(wholeSecondsNow().getTime() - 6 * 60 * 1000)
      }),
      KerberosFailureReason.ClockSkew
    );
  });

  test("refuses an expired ticket", async () => {
    await expectFailure(verifyToken({ endTime: new Date(Date.now() - 60 * 1000) }), KerberosFailureReason.Expired);
  });

  test("refuses an authenticator that was already used", async () => {
    const { authorizationHeader } = buildTestNegotiateHeader({
      serviceKey: keytabEntry.key
    });

    await expectFailure(verify(authorizationHeader, vi.fn().mockResolvedValue(false)), KerberosFailureReason.Replay);
  });

  test("refuses a ticket without a PAC", async () => {
    await expectFailure(verifyToken({ pac: null }), KerberosFailureReason.MissingPac);
  });

  test("refuses a PAC that was not signed with the service key", async () => {
    await expectFailure(
      verifyToken({
        pac: buildTestPac({ serviceKey: crypto.randomBytes(32) })
      }),
      KerberosFailureReason.InvalidPacSignature
    );
  });

  test("accepts an authenticator bound to a TLS channel", async () => {
    const result = await verifyToken({
      checksum: { type: 0x8003, value: buildTestGssChecksumValue(Buffer.alloc(16, 0xab)) }
    });

    expect(result.clientName).toBe(TEST_COMPUTER_NAME);
  });

  test.each<[string, TTestNegotiateOptions["checksum"]]>([
    ["has no checksum", null],
    ["has a checksum that is not a GSS checksum", { type: 16, value: buildTestGssChecksumValue() }],
    ["has an all-zero channel binding", { type: 0x8003, value: buildTestGssChecksumValue(Buffer.alloc(16)) }],
    [
      "has a GSS checksum too short to hold flags",
      { type: 0x8003, value: buildTestGssChecksumValue().subarray(0, 20) }
    ],
    ["has a GSS checksum with the wrong binding length", { type: 0x8003, value: checksumWithBindingLength(32) }]
  ])("refuses an authenticator that %s", async (_, checksum) => {
    const checkReplay = vi.fn().mockResolvedValue(true);
    const { authorizationHeader } = buildTestNegotiateHeader({ serviceKey: keytabEntry.key, checksum });

    await expectFailure(verify(authorizationHeader, checkReplay), KerberosFailureReason.MissingChannelBinding, {
      clientName: TEST_COMPUTER_NAME
    });
    expect(checkReplay).not.toHaveBeenCalled();
  });

  test("accepts an authenticator bound to one of the expected certificates", async () => {
    const channelBinding = Buffer.alloc(16, 0xcd);
    const { authorizationHeader } = buildTestNegotiateHeader({ serviceKey: keytabEntry.key, channelBinding });

    const result = await verify(authorizationHeader, vi.fn().mockResolvedValue(true), [
      Buffer.alloc(16, 0x01),
      Buffer.from(channelBinding)
    ]);

    expect(result.clientName).toBe(TEST_COMPUTER_NAME);
  });

  test("refuses an authenticator bound to a certificate the server does not present, before the replay check", async () => {
    const checkReplay = vi.fn().mockResolvedValue(true);
    const { authorizationHeader } = buildTestNegotiateHeader({
      serviceKey: keytabEntry.key,
      channelBinding: Buffer.alloc(16, 0xcd)
    });

    await expectFailure(
      verify(authorizationHeader, checkReplay, [Buffer.alloc(16, 0xce)]),
      KerberosFailureReason.ChannelBindingMismatch,
      { clientName: TEST_COMPUTER_NAME }
    );
    expect(checkReplay).not.toHaveBeenCalled();
  });

  test("refuses a missing channel binding even when bindings are expected", async () => {
    const { authorizationHeader } = buildTestNegotiateHeader({ serviceKey: keytabEntry.key, checksum: null });

    await expectFailure(
      verify(authorizationHeader, vi.fn().mockResolvedValue(true), [Buffer.alloc(16, 0xce)]),
      KerberosFailureReason.MissingChannelBinding
    );
  });

  test("refuses a user account", async () => {
    await expectFailure(verifyToken({ clientName: "jsmith" }), KerberosFailureReason.NotComputerAccount, {
      clientName: "jsmith"
    });
  });
});

describe("assertTicketIsForServicePrincipal", () => {
  const keytabEntry = buildTestKeytabEntry();

  const parse = (options: Partial<TTestNegotiateOptions> = {}) =>
    parseNegotiateToken(
      readAuthorizationHeader(buildTestNegotiateHeader({ serviceKey: keytabEntry.key, ...options }).authorizationHeader)
    );

  test("accepts a ticket for the service principal and key version, ignoring case", () => {
    expect(() =>
      assertTicketIsForServicePrincipal(parse({ serviceName: TEST_SERVICE_NAME.toUpperCase() }), {
        principal: TEST_SERVICE_NAME,
        newestKeyVersion: 3
      })
    ).not.toThrow();
  });

  test("accepts a ticket for an older key version a merged keytab can still hold", () => {
    expect(() =>
      assertTicketIsForServicePrincipal(parse({ keyVersion: 2 }), {
        principal: TEST_SERVICE_NAME,
        newestKeyVersion: 3
      })
    ).not.toThrow();
  });

  test.each([
    [
      "another service principal",
      { serviceName: "HTTP/other.example.com" },
      "HTTP/other.example.com",
      3,
      `The keytab is for ${TEST_SERVICE_NAME}. Upload a keytab for HTTP/other.example.com`
    ],
    ["a newer key version", { keyVersion: 4 }, TEST_SERVICE_NAME, 4, "Upload a keytab that holds this key version"],
    ["no key version", { keyVersion: null }, TEST_SERVICE_NAME, null, "The ticket carries no key version"]
  ])(
    "refuses a ticket for %s, naming the ticket's key and the fix",
    (_name, options, serviceName, keyVersion, nextStep) => {
      let error: unknown;
      try {
        assertTicketIsForServicePrincipal(parse(options), { principal: TEST_SERVICE_NAME, newestKeyVersion: 3 });
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(KerberosError);
      expect(error).toMatchObject({ reason: KerberosFailureReason.NoMatchingKey, serviceName, keyVersion });
      expect((error as Error).message).toContain(nextStep);
    }
  );
});
