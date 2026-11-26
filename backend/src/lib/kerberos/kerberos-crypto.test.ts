import { ctsDecrypt, ctsEncrypt, kerberosChecksum, kerberosDecrypt, kerberosEncrypt, nfold } from "./kerberos-crypto";
import { KerberosKeyUsage } from "./kerberos-types";

const AES128_KEY = Buffer.from("000102030405060708090a0b0c0d0e0f", "hex");
const AES256_KEY = Buffer.from("000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f", "hex");
const PLAINTEXT = Buffer.from("kerberos test vector plaintext for cts edge cases!!", "latin1");

const LAB_VECTORS = [
  {
    key: AES128_KEY,
    usage: KerberosKeyUsage.ApRequestAuthenticator,
    length: 5,
    cipher: "799d9ee9cbc684778977938e246f7c3dc2e0993d1c4d83c908af75cbd2b0e57f75"
  },
  {
    key: AES128_KEY,
    usage: KerberosKeyUsage.TicketEncPart,
    length: 17,
    cipher: "a0f6e94f73632f985d1cccb212b61771e96f7160a19f772669b58c865aec39c71063f22ef3f9d49ab891af532f"
  },
  {
    key: AES256_KEY,
    usage: KerberosKeyUsage.TicketEncPart,
    length: 0,
    cipher: "a64326c0fbe5cef00166f8a3ebd950f17d8035c64b397937a8d3859b"
  },
  {
    key: AES256_KEY,
    usage: KerberosKeyUsage.ApReplyEncPart,
    length: 16,
    cipher: "fe6d90c727eac855f75e2a92996227e0d1fdb66cf81b4810102669607c6c2254a906a3837a4aef72f27cdf8f"
  },
  {
    key: AES256_KEY,
    usage: KerberosKeyUsage.ApReplyEncPart,
    length: 45,
    cipher:
      "60ea8038a64074fcb0506ee1925d396c0b0dfe2f473120941cb63776d3713c67b7700c0b8f300119f4559d7419852ca952544d386924574a282e771e80948fd7d3caa168fc97423e72"
  }
];

describe("kerberosDecrypt", () => {
  test.each(LAB_VECTORS)(
    "decrypts ciphertext produced by the lab implementation (usage $usage, $length bytes)",
    ({ key, usage, length, cipher }) => {
      expect(kerberosDecrypt(key, usage, Buffer.from(cipher, "hex"))).toEqual(PLAINTEXT.subarray(0, length));
    }
  );

  test("rejects ciphertext decrypted with another key usage", () => {
    const [vector] = LAB_VECTORS;
    expect(() =>
      kerberosDecrypt(vector.key, KerberosKeyUsage.TicketEncPart, Buffer.from(vector.cipher, "hex"))
    ).toThrow();
  });

  test("rejects tampered ciphertext", () => {
    const cipher = Buffer.from(LAB_VECTORS[1].cipher, "hex");
    cipher[3] = 255 - cipher[3];
    expect(() => kerberosDecrypt(AES128_KEY, KerberosKeyUsage.TicketEncPart, cipher)).toThrow();
  });

  test("rejects ciphertext shorter than a confounder and a checksum", () => {
    expect(() => kerberosDecrypt(AES256_KEY, KerberosKeyUsage.TicketEncPart, Buffer.alloc(27))).toThrow();
  });
});

describe("kerberosEncrypt", () => {
  test.each([0, 1, 15, 16, 17, 31, 32, 33, 51])("round trips %i bytes with AES128 and AES256", (length) => {
    const plain = PLAINTEXT.subarray(0, length);
    [AES128_KEY, AES256_KEY].forEach((key) => {
      const cipher = kerberosEncrypt(key, KerberosKeyUsage.ApReplyEncPart, plain);
      expect(cipher.length).toBe(16 + length + 12);
      expect(kerberosDecrypt(key, KerberosKeyUsage.ApReplyEncPart, cipher)).toEqual(plain);
    });
  });
});

describe("kerberosChecksum", () => {
  test("matches the lab implementation", () => {
    expect(kerberosChecksum(AES128_KEY, KerberosKeyUsage.PacChecksum, PLAINTEXT).toString("hex")).toBe(
      "cede5441cf0cccd3a3920567"
    );
    expect(kerberosChecksum(AES256_KEY, KerberosKeyUsage.PacChecksum, PLAINTEXT).toString("hex")).toBe(
      "e4d0efe027c28c24c63711b2"
    );
  });
});

describe("RFC 3962 Appendix B: AES CBC with ciphertext stealing", () => {
  const RFC_3962_KEY = Buffer.from("636869636b656e207465726979616b69", "hex");
  const INPUT = Buffer.from(
    "4920776f756c64206c696b6520746865" +
      "2047656e6572616c2047617527732043" +
      "6869636b656e2c20706c656173652c20" +
      "616e6420776f6e746f6e20736f75702e",
    "hex"
  );

  test.each([
    [17, "c6353568f2bf8cb4d8a580362da7ff7f97"],
    [31, "fc00783e0efdb2c1d445d4c8eff7ed2297687268d6ecccc0c07b25e25ecfe5"],
    [32, "39312523a78662d5be7fcbcc98ebf5a897687268d6ecccc0c07b25e25ecfe584"],
    [47, "97687268d6ecccc0c07b25e25ecfe584b3fffd940c16a18c1b5549d2f838029e39312523a78662d5be7fcbcc98ebf5"],
    [48, "97687268d6ecccc0c07b25e25ecfe5849dad8bbb96c4cdc03bc103e1a194bbd839312523a78662d5be7fcbcc98ebf5a8"],
    [
      64,
      "97687268d6ecccc0c07b25e25ecfe58439312523a78662d5be7fcbcc98ebf5a84807efe836ee89a526730dbc2f7bc8409dad8bbb96c4cdc03bc103e1a194bbd8"
    ]
  ])("encrypts and decrypts the %d-byte vector", (length, output) => {
    const input = INPUT.subarray(0, length);

    expect(ctsEncrypt(RFC_3962_KEY, input).toString("hex")).toBe(output);
    expect(ctsDecrypt(RFC_3962_KEY, Buffer.from(output, "hex"))).toEqual(input);
  });
});

describe("RFC 3961 Appendix A.1: n-fold", () => {
  test.each([
    ["012345", 8, "be072631276b1955"],
    ["password", 7, "78a07b6caf85fa"],
    ["Rough Consensus, and Running Code", 8, "bb6ed30870b7f0e0"],
    ["password", 21, "59e4a8ca7c0385c3c37b3f6d2000247cb6e6bd5b3e"],
    ["MASSACHVSETTS INSTITVTE OF TECHNOLOGY", 24, "db3b0d8f0b061e603282b308a50841229ad798fab9540c1b"],
    ["kerberos", 16, "6b65726265726f737b9b5b2b93132b93"],
    ["kerberos", 32, "6b65726265726f737b9b5b2b93132b935c9bdcdad95c9899c4cae4dee6d6cae4"]
  ])("folds %s to %d bytes", (input, outBytes, output) => {
    expect(nfold(Buffer.from(input, "latin1"), outBytes).toString("hex")).toBe(output);
  });
});
