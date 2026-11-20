import { BadRequestError } from "@app/lib/errors";

import { parseKeytab } from "./kerberos-keytab";
import { KerberosEncryptionType } from "./kerberos-types";
import { buildTestKeytab, buildTestKeytabEntry, TEST_REALM, TEST_SERVICE_NAME } from "./kerberos.test-helpers";

const RC4_ENTRY = Buffer.concat([
  Buffer.from([0, 2]),
  Buffer.from([0, TEST_REALM.length]),
  Buffer.from(TEST_REALM),
  Buffer.from([0, 4]),
  Buffer.from("HTTP"),
  Buffer.from([0, 15]),
  Buffer.from("app.example.com"),
  Buffer.alloc(8),
  Buffer.from([3, 0, 23, 0, 16]),
  Buffer.alloc(16, 7)
]);

describe("parseKeytab", () => {
  test("returns the AES entries with realm, principal, key version and key", () => {
    const aes256 = buildTestKeytabEntry({ keyVersion: 300 });
    const aes128 = buildTestKeytabEntry({
      encryptionType: KerberosEncryptionType.Aes128CtsHmacSha196,
      key: Buffer.alloc(16, 1)
    });

    expect(parseKeytab(buildTestKeytab([aes256, aes128]))).toEqual([aes256, aes128]);
  });

  test("drops non-AES entries", () => {
    const aes256 = buildTestKeytabEntry();

    expect(parseKeytab(buildTestKeytab([aes256], [RC4_ENTRY]))).toEqual([aes256]);
  });

  test("uses the 8-bit key version when the entry has no 32-bit key version", () => {
    const entryWithoutExtendedKeyVersion = Buffer.concat([
      RC4_ENTRY.subarray(0, -21),
      Buffer.from([5, 0, 18, 0, 32]),
      Buffer.alloc(32, 9)
    ]);

    const [entry] = parseKeytab(buildTestKeytab([], [entryWithoutExtendedKeyVersion]));

    expect(entry).toMatchObject({
      principal: TEST_SERVICE_NAME,
      realm: TEST_REALM,
      keyVersion: 5
    });
  });

  test("uses the 8-bit key version when the 32-bit key version is zero", () => {
    const keytab = buildTestKeytab([buildTestKeytabEntry({ keyVersion: 7 })]);
    keytab.writeUInt32BE(0, keytab.length - 4);

    expect(parseKeytab(keytab)).toMatchObject([{ keyVersion: 7 }]);
  });

  test("stops at a zero-length record", () => {
    const entry = buildTestKeytabEntry();

    expect(parseKeytab(Buffer.concat([buildTestKeytab([entry]), Buffer.alloc(16)]))).toEqual([entry]);
  });

  test("refuses a keytab with only non-AES keys", () => {
    expect(() => parseKeytab(buildTestKeytab([], [RC4_ENTRY]))).toThrow(/no AES keys/);
  });

  test.each([
    ["an empty file", Buffer.alloc(0)],
    ["another file format", Buffer.from("-----BEGIN CERTIFICATE-----")],
    ["a truncated keytab", buildTestKeytab([buildTestKeytabEntry()]).subarray(0, 40)],
    ["an AES entry with a key of the wrong length", buildTestKeytab([buildTestKeytabEntry({ key: Buffer.alloc(20) })])],
    ["a principal with an empty realm", buildTestKeytab([buildTestKeytabEntry({ realm: "" })])],
    ["a principal with a NUL byte", buildTestKeytab([buildTestKeytabEntry({ principal: "HTTP/h\u0000ost" })])]
  ])("refuses %s", (_, file) => {
    expect(() => parseKeytab(file)).toThrow(BadRequestError);
    expect(() => parseKeytab(file)).toThrow(/not a valid keytab/);
  });
});
