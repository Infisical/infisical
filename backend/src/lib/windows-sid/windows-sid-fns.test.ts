import { describe, expect, test } from "vitest";

import { hasSidLeadingZeros, isSidSubAuthorityInRange, isValidSid, sidBufferToString } from "./windows-sid-fns";

const COMPUTER_SID = "S-1-5-21-1111111111-2222222222-3333333333-1105";

const COMPUTER_SID_BYTES = Buffer.from([
  0x01, 0x05, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05, 0x15, 0x00, 0x00, 0x00, 0xc7, 0x35, 0x3a, 0x42, 0x8e, 0x6b, 0x74,
  0x84, 0x55, 0xa1, 0xae, 0xc6, 0x51, 0x04, 0x00, 0x00
]);

describe("sidBufferToString", () => {
  test("reads the binary objectSid Active Directory returns", () => {
    expect(sidBufferToString(COMPUTER_SID_BYTES)).toBe(COMPUTER_SID);
  });

  test("reads a well-known SID with a single sub-authority", () => {
    expect(
      sidBufferToString(Buffer.from([0x01, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x05, 0x12, 0x00, 0x00, 0x00]))
    ).toBe("S-1-5-18");
  });
});

describe("hasSidLeadingZeros", () => {
  test("flags a part written with a leading zero, which never matches the SIDs in a Kerberos ticket", () => {
    expect(hasSidLeadingZeros("S-1-5-21-1111111111-2222222222-3333333333-0512")).toBe(true);
    expect(hasSidLeadingZeros("S-1-5-21-1111111111-2222222222-3333333333-512")).toBe(false);
    expect(hasSidLeadingZeros("S-1-0-0")).toBe(false);
  });
});

describe("isSidSubAuthorityInRange", () => {
  test.each([
    ["a domain SID", COMPUTER_SID, true],
    ["the largest sub-authority", "S-1-5-21-4294967295", true],
    ["a sub-authority past 32 bits", "S-1-5-21-4294967296", false]
  ])("%s", (_name, sid, expected) => {
    expect(isSidSubAuthorityInRange(sid)).toBe(expected);
  });
});

describe("isValidSid", () => {
  test.each([
    ["a domain computer SID", COMPUTER_SID, true],
    ["a part with a leading zero", "S-1-5-21-1111111111-2222222222-3333333333-0512", false],
    ["a sub-authority past 32 bits", "S-1-5-21-4294967296", false],
    ["text that is not a SID", "Domain Computers", false]
  ])("%s", (_name, sid, expected) => {
    expect(isValidSid(sid)).toBe(expected);
  });
});
