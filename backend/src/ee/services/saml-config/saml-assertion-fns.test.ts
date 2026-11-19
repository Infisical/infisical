import {
  extractSamlAuthnContextClassRefs,
  getSamlAssertionReplayDetails,
  getSamlAssertionReplayWindow,
  SAML_ASSERTION_FALLBACK_WINDOW_MS
} from "./saml-assertion-fns";

const assertion = ({
  id = "_a1b2c3",
  conditionsNotOnOrAfter = "2026-10-31T10:05:00Z",
  subjectNotOnOrAfter = "2026-10-31T10:03:00Z"
}: {
  id?: string;
  conditionsNotOnOrAfter?: string;
  subjectNotOnOrAfter?: string;
} = {}) => ({
  $: { ID: id, IssueInstant: "2026-10-31T10:00:00Z" },
  Conditions: [{ $: { NotBefore: "2026-10-31T09:59:00Z", NotOnOrAfter: conditionsNotOnOrAfter } }],
  Subject: [
    {
      SubjectConfirmation: [
        {
          $: { Method: "urn:oasis:names:tc:SAML:2.0:cm:bearer" },
          SubjectConfirmationData: [{ $: { NotOnOrAfter: subjectNotOnOrAfter } }]
        }
      ]
    }
  ]
});

describe("getSamlAssertionReplayDetails", () => {
  test("reads the ID, IssueInstant and the latest NotOnOrAfter from an Assertion root", () => {
    expect(getSamlAssertionReplayDetails({ Assertion: assertion() })).toEqual({
      assertionId: "_a1b2c3",
      issuedAt: new Date("2026-10-31T10:00:00Z"),
      expiresAt: new Date("2026-10-31T10:05:00Z")
    });
  });

  test("uses the subject confirmation expiry when it is the later one", () => {
    const details = getSamlAssertionReplayDetails({
      Assertion: assertion({
        conditionsNotOnOrAfter: "2026-10-31T10:01:00Z",
        subjectNotOnOrAfter: "2026-10-31T10:09:00Z"
      })
    });
    expect(details.expiresAt).toEqual(new Date("2026-10-31T10:09:00Z"));
  });

  test("finds the assertion inside a Response wrapper", () => {
    expect(getSamlAssertionReplayDetails({ Response: [{ Assertion: [assertion()] }] }).assertionId).toBe("_a1b2c3");
  });

  test.each([
    ["no ID", { Assertion: { ...assertion(), $: { IssueInstant: "2026-10-31T10:00:00Z" } } }],
    ["a blank ID", { Assertion: assertion({ id: "  " }) }],
    ["nothing parsed", undefined]
  ])("returns no assertion ID for %s", (_, parsed) => {
    expect(getSamlAssertionReplayDetails(parsed).assertionId).toBeUndefined();
  });

  test("returns no timestamps when none is present or parseable", () => {
    const parsed = {
      Assertion: {
        $: { ID: "_x", IssueInstant: "yesterday" },
        Conditions: [{ $: { NotOnOrAfter: "not a date" } }],
        Subject: [{}]
      }
    };
    expect(getSamlAssertionReplayDetails(parsed)).toEqual({
      assertionId: "_x",
      issuedAt: undefined,
      expiresAt: undefined
    });
  });
});

describe("getSamlAssertionReplayWindow", () => {
  const now = Date.parse("2026-10-31T10:00:00Z");

  test("remembers the ID until NotOnOrAfter plus the margin", () => {
    expect(getSamlAssertionReplayWindow({ expiresAt: new Date("2026-10-31T10:05:00Z") }, now)).toEqual({
      accepted: true,
      ttlSeconds: 360
    });
  });

  test("prefers NotOnOrAfter over the IssueInstant fallback", () => {
    const window = getSamlAssertionReplayWindow(
      { expiresAt: new Date("2026-10-31T10:05:00Z"), issuedAt: new Date("2026-10-31T09:59:00Z") },
      now
    );
    expect(window).toEqual({ accepted: true, ttlSeconds: 360 });
  });

  test("falls back to a fixed window after IssueInstant when NotOnOrAfter is missing", () => {
    const issuedAt = new Date(now - 10 * 60 * 1000);
    expect(getSamlAssertionReplayWindow({ issuedAt }, now)).toEqual({
      accepted: true,
      ttlSeconds: (SAML_ASSERTION_FALLBACK_WINDOW_MS - 10 * 60 * 1000) / 1000 + 60
    });
  });

  test("covers an IssueInstant in the future until the whole window has passed", () => {
    const issuedAt = new Date(now + 5 * 60 * 1000);
    expect(getSamlAssertionReplayWindow({ issuedAt }, now)).toEqual({
      accepted: true,
      ttlSeconds: (SAML_ASSERTION_FALLBACK_WINDOW_MS + 5 * 60 * 1000) / 1000 + 60
    });
  });

  test("refuses an assertion without NotOnOrAfter issued before the fallback window", () => {
    const issuedAt = new Date(now - SAML_ASSERTION_FALLBACK_WINDOW_MS - 2 * 60 * 1000);
    expect(getSamlAssertionReplayWindow({ issuedAt }, now)).toEqual({ accepted: false, reason: "expired" });
  });

  test("refuses an assertion with neither NotOnOrAfter nor IssueInstant", () => {
    expect(getSamlAssertionReplayWindow({}, now)).toEqual({ accepted: false, reason: "missing-timestamps" });
  });
});

describe("extractSamlAuthnContextClassRefs", () => {
  const classRef = "urn:oasis:names:tc:SAML:2.0:ac:classes:TimeSyncToken";

  test("walks the xml2js shape node-saml produces for an assertion", () => {
    const parsed = {
      Assertion: {
        $: { ID: "_abc" },
        AuthnStatement: [
          { $: { AuthnInstant: "2026-10-29T00:00:00Z" }, AuthnContext: [{ AuthnContextClassRef: [{ _: classRef }] }] }
        ]
      }
    };
    expect(extractSamlAuthnContextClassRefs(parsed)).toEqual([classRef]);
  });

  test("walks an assertion wrapped in a response", () => {
    const parsed = {
      Response: { Assertion: [{ AuthnStatement: [{ AuthnContext: [{ AuthnContextClassRef: [classRef] }] }] }] }
    };
    expect(extractSamlAuthnContextClassRefs(parsed)).toEqual([classRef]);
  });

  test("returns nothing for an assertion without an authentication statement", () => {
    expect(extractSamlAuthnContextClassRefs({ Assertion: { Subject: [{}] } })).toEqual([]);
    expect(extractSamlAuthnContextClassRefs(undefined)).toEqual([]);
  });
});
