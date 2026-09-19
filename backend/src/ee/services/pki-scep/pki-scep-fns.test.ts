/* eslint-disable no-bitwise */
import { webcrypto } from "node:crypto";

import { AsnConvert } from "@peculiar/asn1-schema";
import * as asn1x509 from "@peculiar/asn1-x509";
import * as x509 from "@peculiar/x509";
import { beforeAll, describe, expect, test } from "vitest";

import {
  decodeAsn1ChallengePasswordValue,
  evaluateScepRenewalAuthorization,
  extractScepChallengePassword,
  ScepRenewalDenyReason
} from "./pki-scep-fns";

// Builds a DER-encoded ASN.1 string (tag + length + value) like @peculiar/x509 surfaces the attribute value.
const derString = (tag: number, value: string): Uint8Array => {
  const valueBytes = Buffer.from(value, "utf-8");
  const len = valueBytes.length;
  if (len < 0x80) {
    return Uint8Array.from([tag, len, ...valueBytes]);
  }
  // Long-form length: 0x80 | number-of-length-bytes, then the big-endian length bytes.
  const lenBytes: number[] = [];
  let remaining = len;
  while (remaining > 0) {
    lenBytes.unshift(remaining & 0xff);
    remaining >>= 8;
  }
  return Uint8Array.from([tag, 0x80 | lenBytes.length, ...lenBytes, ...valueBytes]);
};

const UTF8_STRING_TAG = 0x0c;
const PRINTABLE_STRING_TAG = 0x13;

describe("decodeAsn1ChallengePasswordValue", () => {
  test("decodes a short-form UTF8String", () => {
    expect(decodeAsn1ChallengePasswordValue(derString(UTF8_STRING_TAG, "s3cret-pass"))).toBe("s3cret-pass");
  });

  test("decodes a PrintableString tag the same way", () => {
    expect(decodeAsn1ChallengePasswordValue(derString(PRINTABLE_STRING_TAG, "abc123"))).toBe("abc123");
  });

  test("decodes a long-form length (value >= 128 bytes)", () => {
    const long = "x".repeat(200);
    expect(decodeAsn1ChallengePasswordValue(derString(UTF8_STRING_TAG, long))).toBe(long);
  });

  test("accepts an ArrayBuffer as well as a Uint8Array", () => {
    const u8 = derString(UTF8_STRING_TAG, "buffer-pass");
    const ab = u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
    expect(decodeAsn1ChallengePasswordValue(ab)).toBe("buffer-pass");
  });

  test("preserves multibyte UTF-8 content", () => {
    expect(decodeAsn1ChallengePasswordValue(derString(UTF8_STRING_TAG, "pÄss-wörd-✓"))).toBe("pÄss-wörd-✓");
  });

  test("returns a plain string input unchanged", () => {
    expect(decodeAsn1ChallengePasswordValue("already-a-string")).toBe("already-a-string");
  });
});

describe("extractScepChallengePassword", () => {
  beforeAll(() => {
    x509.cryptoProvider.set(webcrypto as Crypto);
  });

  const generateCsr = async (attributes: x509.Attribute[]) => {
    const keys = await webcrypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true,
      ["sign", "verify"]
    );
    const csr = await x509.Pkcs10CertificateRequestGenerator.create({
      name: "CN=scep-device",
      keys,
      signingAlgorithm: { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      attributes
    });
    return new x509.Pkcs10CertificateRequest(csr.rawData);
  };

  test("extracts the challenge password embedded in a real CSR", async () => {
    const csr = await generateCsr([new x509.ChallengePasswordAttribute("device-challenge-123")]);
    expect(extractScepChallengePassword(csr)).toBe("device-challenge-123");
  });

  test("returns an empty string when the CSR carries no challenge password", async () => {
    const csr = await generateCsr([]);
    expect(extractScepChallengePassword(csr)).toBe("");
  });
});

describe("evaluateScepRenewalAuthorization", () => {
  const PROFILE_ID = "8d0f3a1e-2f4b-4c6d-9e10-5a7b3c9d1e42";

  const authorize = ({
    csrSubject,
    signerSubject,
    csrSans,
    signerSans,
    csrSanExt,
    signerSanExt,
    csrForwardedToCa
  }: {
    csrSubject: string;
    signerSubject: string;
    csrSans?: x509.JsonGeneralName[];
    signerSans?: x509.JsonGeneralName[];
    csrSanExt?: x509.Extension | null;
    signerSanExt?: x509.Extension | null;
    csrForwardedToCa?: boolean;
  }) =>
    evaluateScepRenewalAuthorization({
      isValidSigner: true,
      storedSignerCert: { profileId: PROFILE_ID },
      profileId: PROFILE_ID,
      csrForwardedToCa: csrForwardedToCa ?? false,
      csrSubjectName: new x509.Name(csrSubject),
      signerCertSubjectName: new x509.Name(signerSubject),
      csrSubjectAltNames: csrSanExt ?? (csrSans ? new x509.SubjectAlternativeNameExtension(csrSans) : null),
      signerCertSubjectAltNames:
        signerSanExt ?? (signerSans ? new x509.SubjectAlternativeNameExtension(signerSans) : null)
    });

  test("authorizes a renewal whose CSR identity matches the signer certificate", () => {
    expect(authorize({ csrSubject: "CN=device-01,OU=eng", signerSubject: "CN=device-01,OU=eng" })).toEqual({
      authorized: true
    });
  });

  test("still authorizes when the two subjects differ only by case and whitespace", () => {
    expect(authorize({ csrSubject: "CN=Device-01,  OU=Eng", signerSubject: "CN=device-01,OU=eng" })).toEqual({
      authorized: true
    });
  });

  test("denies a CSR whose single RDN flattens onto the victim's multi-RDN subject", () => {
    expect(authorize({ csrSubject: "CN=device-01,OU=eng", signerSubject: "CN=device-01\\,ou\\=eng" })).toEqual({
      authorized: false,
      reason: ScepRenewalDenyReason.SubjectMismatch
    });
  });

  test("denies the same flattening in the other direction", () => {
    expect(authorize({ csrSubject: "CN=device-01\\,ou\\=eng", signerSubject: "CN=device-01,OU=eng" })).toEqual({
      authorized: false,
      reason: ScepRenewalDenyReason.SubjectMismatch
    });
  });

  test("denies a CSR that flattens a multi-valued RDN into one attribute value", () => {
    expect(authorize({ csrSubject: "CN=a+OU=b", signerSubject: "CN=a\\+ou\\=b" })).toEqual({
      authorized: false,
      reason: ScepRenewalDenyReason.SubjectMismatch
    });
  });

  test("denies a CSR that shifts an RDN boundary inside a domain-component chain", () => {
    expect(authorize({ csrSubject: "CN=alice,DC=corp,DC=com", signerSubject: "CN=alice\\,dc\\=corp,DC=com" })).toEqual({
      authorized: false,
      reason: ScepRenewalDenyReason.SubjectMismatch
    });
  });

  test("denies a CSR whose single SAN entry flattens onto two signer SAN entries", () => {
    expect(
      authorize({
        csrSubject: "CN=device-01",
        signerSubject: "CN=device-01",
        csrSans: [{ type: "url", value: "https://a,url:https://b" }],
        signerSans: [
          { type: "url", value: "https://a" },
          { type: "url", value: "https://b" }
        ]
      })
    ).toEqual({ authorized: false, reason: ScepRenewalDenyReason.SubjectAltNameMismatch });
  });

  test("authorizes matching SAN sets regardless of entry order", () => {
    expect(
      authorize({
        csrSubject: "CN=device-01",
        signerSubject: "CN=device-01",
        csrSans: [
          { type: "dns", value: "b.example.com" },
          { type: "dns", value: "a.example.com" }
        ],
        signerSans: [
          { type: "dns", value: "a.example.com" },
          { type: "dns", value: "B.example.com" }
        ]
      })
    ).toEqual({ authorized: true });
  });

  const sanExtensionFromGeneralNames = (names: asn1x509.GeneralName[]): x509.Extension => {
    const generalNames = new asn1x509.GeneralNames();
    generalNames.push(...names);
    return new x509.Extension("2.5.29.17", false, AsnConvert.serialize(generalNames));
  };

  const dnsGeneralName = (value: string): asn1x509.GeneralName => {
    const name = new asn1x509.GeneralName();
    name.dNSName = value;
    return name;
  };

  const kerberosPrincipalGeneralName = (principal: string): asn1x509.GeneralName => {
    const name = new asn1x509.GeneralName();
    name.otherName = new asn1x509.OtherName({
      typeId: "1.3.6.1.5.2.2",
      value: AsnConvert.serialize(new asn1x509.DirectoryString({ utf8String: principal }))
    });
    return name;
  };

  const upnGeneralName = (directoryString: asn1x509.DirectoryString): asn1x509.GeneralName => {
    const name = new asn1x509.GeneralName();
    name.otherName = new asn1x509.OtherName({
      typeId: "1.3.6.1.4.1.311.20.2.3",
      value: AsnConvert.serialize(directoryString)
    });
    return name;
  };

  test("authorizes a UPN renewal when the CSR and the certificate encode it differently", () => {
    expect(
      authorize({
        csrSubject: "CN=device-01",
        signerSubject: "CN=device-01",
        csrSanExt: sanExtensionFromGeneralNames([
          dnsGeneralName("d.example.com"),
          upnGeneralName(new asn1x509.DirectoryString({ printableString: "user@corp.local" }))
        ]),
        signerSanExt: sanExtensionFromGeneralNames([
          dnsGeneralName("d.example.com"),
          upnGeneralName(new asn1x509.DirectoryString({ utf8String: "user@corp.local" }))
        ])
      })
    ).toEqual({ authorized: true });
  });

  test("authorizes an internal-CA renewal whose CSR keeps a SAN entry issuance strips", () => {
    expect(
      authorize({
        csrSubject: "CN=device-01",
        signerSubject: "CN=device-01",
        csrSanExt: sanExtensionFromGeneralNames([
          dnsGeneralName("d.example.com"),
          kerberosPrincipalGeneralName("admin@EXAMPLE.COM")
        ]),
        signerSanExt: sanExtensionFromGeneralNames([dnsGeneralName("d.example.com")])
      })
    ).toEqual({ authorized: true });
  });

  test("denies the same CSR when the CA receives it verbatim", () => {
    const csrSanExt = sanExtensionFromGeneralNames([
      dnsGeneralName("d.example.com"),
      kerberosPrincipalGeneralName("admin@EXAMPLE.COM")
    ]);
    const signerSanExt = sanExtensionFromGeneralNames([dnsGeneralName("d.example.com")]);

    expect(new x509.SubjectAlternativeNameExtension(csrSanExt.rawData).names.items).toHaveLength(1);

    expect(
      authorize({
        csrSubject: "CN=device-01",
        signerSubject: "CN=device-01",
        csrSanExt,
        signerSanExt,
        csrForwardedToCa: true
      })
    ).toEqual({ authorized: false, reason: ScepRenewalDenyReason.SubjectAltNameMismatch });
  });

  test("authorizes a forwarded renewal when both sides carry the same stripped-type entry", () => {
    const names = [dnsGeneralName("d.example.com"), kerberosPrincipalGeneralName("admin@EXAMPLE.COM")];
    expect(
      authorize({
        csrSubject: "CN=device-01",
        signerSubject: "CN=device-01",
        csrSanExt: sanExtensionFromGeneralNames(names),
        signerSanExt: sanExtensionFromGeneralNames(names),
        csrForwardedToCa: true
      })
    ).toEqual({ authorized: true });
  });

  test("denies a renewal that adds a supported SAN the certificate does not have", () => {
    expect(
      authorize({
        csrSubject: "CN=device-01",
        signerSubject: "CN=device-01",
        csrSans: [
          { type: "dns", value: "d.example.com" },
          { type: "dns", value: "extra.example.com" }
        ],
        signerSans: [{ type: "dns", value: "d.example.com" }]
      })
    ).toEqual({ authorized: false, reason: ScepRenewalDenyReason.SubjectAltNameMismatch });
  });

  // A UPN OID whose value is not a DirectoryString: the library cannot model it, so it must be
  // treated as an entry issuance strips rather than assumed preserved from its OID alone.
  const malformedUpnGeneralName = (principal: string): asn1x509.GeneralName => {
    const name = new asn1x509.GeneralName();
    const ia5 = Uint8Array.from([0x16, principal.length, ...Buffer.from(principal)]);
    name.otherName = new asn1x509.OtherName({ typeId: "1.3.6.1.4.1.311.20.2.3", value: ia5.buffer });
    return name;
  };

  test("denies a forwarded CSR that adds a UPN OID carrying a non-DirectoryString value", () => {
    const csrSanExt = sanExtensionFromGeneralNames([
      dnsGeneralName("w.example.com"),
      malformedUpnGeneralName("attacker@corp.local")
    ]);
    const signerSanExt = sanExtensionFromGeneralNames([dnsGeneralName("w.example.com")]);

    expect(new x509.SubjectAlternativeNameExtension(csrSanExt.rawData).names.items).toHaveLength(1);

    expect(
      authorize({
        csrSubject: "CN=device-01",
        signerSubject: "CN=device-01",
        csrSanExt,
        signerSanExt,
        csrForwardedToCa: true
      })
    ).toEqual({ authorized: false, reason: ScepRenewalDenyReason.SubjectAltNameMismatch });
  });

  test("authorizes that same CSR against an internal CA, which strips the entry at issuance", () => {
    expect(
      authorize({
        csrSubject: "CN=device-01",
        signerSubject: "CN=device-01",
        csrSanExt: sanExtensionFromGeneralNames([
          dnsGeneralName("w.example.com"),
          malformedUpnGeneralName("attacker@corp.local")
        ]),
        signerSanExt: sanExtensionFromGeneralNames([dnsGeneralName("w.example.com")])
      })
    ).toEqual({ authorized: true });
  });

  // An external CA may add names of its own (ADCS stamps a GUID otherName); that must not
  // permanently lock the device out of renewing.
  test("authorizes a forwarded renewal when the certificate carries an entry the CSR does not", () => {
    expect(
      authorize({
        csrSubject: "CN=device-01",
        signerSubject: "CN=device-01",
        csrSanExt: sanExtensionFromGeneralNames([dnsGeneralName("w.example.com")]),
        signerSanExt: sanExtensionFromGeneralNames([
          dnsGeneralName("w.example.com"),
          kerberosPrincipalGeneralName("added-by-ca@EXAMPLE.COM")
        ]),
        csrForwardedToCa: true
      })
    ).toEqual({ authorized: true });
  });

  test("denies a certificate issued under a different application", () => {
    expect(
      evaluateScepRenewalAuthorization({
        isValidSigner: true,
        storedSignerCert: { profileId: PROFILE_ID, applicationId: "1b9f0c2d-3e4a-4b5c-8d6e-7f8a9b0c1d2e" },
        profileId: PROFILE_ID,
        applicationId: "c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f",
        csrForwardedToCa: false,
        csrSubjectName: new x509.Name("CN=device-01"),
        signerCertSubjectName: new x509.Name("CN=device-01")
      })
    ).toEqual({ authorized: false, reason: ScepRenewalDenyReason.WrongApplication });
  });

  test("denies an application certificate renewing through the bare profile endpoint", () => {
    expect(
      evaluateScepRenewalAuthorization({
        isValidSigner: true,
        storedSignerCert: { profileId: PROFILE_ID, applicationId: "1b9f0c2d-3e4a-4b5c-8d6e-7f8a9b0c1d2e" },
        profileId: PROFILE_ID,
        csrForwardedToCa: false,
        csrSubjectName: new x509.Name("CN=device-01"),
        signerCertSubjectName: new x509.Name("CN=device-01")
      })
    ).toEqual({ authorized: false, reason: ScepRenewalDenyReason.WrongApplication });
  });

  test("authorizes a renewal through the application that issued the certificate", () => {
    const applicationId = "c4d5e6f7-a8b9-4c0d-9e1f-2a3b4c5d6e7f";
    expect(
      evaluateScepRenewalAuthorization({
        isValidSigner: true,
        storedSignerCert: { profileId: PROFILE_ID, applicationId },
        profileId: PROFILE_ID,
        applicationId,
        csrForwardedToCa: false,
        csrSubjectName: new x509.Name("CN=device-01"),
        signerCertSubjectName: new x509.Name("CN=device-01")
      })
    ).toEqual({ authorized: true });
  });

  test("denies when the signer certificate belongs to another profile", () => {
    expect(
      evaluateScepRenewalAuthorization({
        isValidSigner: true,
        storedSignerCert: { profileId: "0f2c6b58-9a3d-4e71-b0c5-1d8e2f7a4b60" },
        profileId: PROFILE_ID,
        csrForwardedToCa: false,
        csrSubjectName: new x509.Name("CN=device-01"),
        signerCertSubjectName: new x509.Name("CN=device-01")
      })
    ).toEqual({ authorized: false, reason: ScepRenewalDenyReason.WrongProfile });
  });

  test("denies when the signer certificate did not validate", () => {
    expect(
      evaluateScepRenewalAuthorization({
        isValidSigner: false,
        storedSignerCert: { profileId: PROFILE_ID },
        profileId: PROFILE_ID,
        csrForwardedToCa: false,
        csrSubjectName: new x509.Name("CN=device-01"),
        signerCertSubjectName: new x509.Name("CN=device-01")
      })
    ).toEqual({ authorized: false, reason: ScepRenewalDenyReason.InvalidSigner });
  });
});
