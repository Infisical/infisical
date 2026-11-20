import { matchIdpMfaSignal } from "./idp-mfa-signal";

const MULTIPLEAUTHN = "http://schemas.microsoft.com/claims/multipleauthn";
const AUTHN_METHODS_REFERENCES = "http://schemas.microsoft.com/claims/authnmethodsreferences";

const oidc = (claims: Record<string, unknown>, config?: { mfaClaimName?: string; mfaAmrValues?: string[] }) =>
  matchIdpMfaSignal({ kind: "oidc", claims, config });

describe("matchIdpMfaSignal for OIDC", () => {
  test.each([
    ["Okta with a second factor", ["pwd", "mfa", "otp"]],
    ["Entra ID Authenticator push", ["pwd", "rsa", "mfa"]],
    ["Auth0 after an MFA challenge", ["mfa"]],
    ["Google with a hardware key", ["pwd", "hwk", "mfa"]]
  ])("accepts %s", (_, amr) => {
    expect(oidc({ sub: "u1", amr })).toMatchObject({ verified: true, evidence: ["mfa"] });
  });

  test.each([
    ["password only", ["pwd"]],
    ["federated upstream IdP", ["fed", "pwd"]],
    ["missing claim", undefined],
    ["claim of the wrong type", 42],
    ["mfa embedded in another word", ["pwd", "nomfa"]]
  ])("rejects %s", (_, amr) => {
    expect(oidc({ sub: "u1", amr })).toMatchObject({ verified: false, evidence: [] });
  });

  test("ignores case and surrounding whitespace", () => {
    expect(oidc({ amr: [" MFA "] })).toMatchObject({ verified: true, evidence: ["MFA"] });
  });

  test("reads amr when the configuration carries no claim name", () => {
    expect(oidc({ amr: ["mfa"] }, { mfaClaimName: "" }).verified).toBe(true);
    expect(oidc({ amr: ["mfa"] }, undefined).verified).toBe(true);
  });

  test("reads the configured claim instead of amr", () => {
    const config = { mfaClaimName: "authentication_methods" };
    expect(oidc({ amr: ["mfa"], authentication_methods: ["pwd"] }, config).verified).toBe(false);
    expect(oidc({ amr: ["pwd"], authentication_methods: ["mfa"] }, config)).toMatchObject({
      verified: true,
      evidence: ["mfa"]
    });
  });

  test("accepts extra values from the configuration on top of the defaults", () => {
    const config = { mfaAmrValues: ["otp"] };
    expect(oidc({ amr: ["pwd", "otp"] }, config)).toMatchObject({ verified: true, evidence: ["otp"] });
    expect(oidc({ amr: ["mfa"] }, config).verified).toBe(true);
  });
});

const saml = (
  authnContextClassRefs: string[],
  attributes?: Record<string, unknown>,
  config?: { authProvider?: string; mfaSignalAttribute?: string; mfaAuthnContexts?: string[] }
) => matchIdpMfaSignal({ kind: "saml", authnContextClassRefs, attributes, config });

describe("matchIdpMfaSignal for SAML", () => {
  test.each([
    ["MobileTwoFactorContract", "urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorContract"],
    ["Entra ID passkey (SmartcardPKI)", "urn:oasis:names:tc:SAML:2.0:ac:classes:SmartcardPKI"],
    ["REFEDS MFA profile", "https://refeds.org/profile/mfa"],
    ["Entra ID multipleauthn context", MULTIPLEAUTHN]
  ])("accepts the %s context class", (_, classRef) => {
    expect(saml([classRef])).toMatchObject({ verified: true, evidence: [classRef] });
  });

  test.each([
    ["PasswordProtectedTransport (Okta default)", "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport"],
    ["MobileTwoFactorUnregistered", "urn:oasis:names:tc:SAML:2.0:ac:classes:MobileTwoFactorUnregistered"],
    ["Password", "urn:oasis:names:tc:SAML:2.0:ac:classes:Password"],
    ["possession-only Smartcard", "urn:oasis:names:tc:SAML:2.0:ac:classes:Smartcard"],
    ["possession-only SoftwarePKI", "urn:oasis:names:tc:SAML:2.0:ac:classes:SoftwarePKI"],
    ["possession-only TimeSyncToken", "urn:oasis:names:tc:SAML:2.0:ac:classes:TimeSyncToken"],
    ["unspecified", "urn:oasis:names:tc:SAML:2.0:ac:classes:unspecified"]
  ])("rejects the single-factor %s context class", (_, classRef) => {
    expect(saml([classRef]).verified).toBe(false);
  });

  test("accepts an Okta amr attribute statement built from session.amr", () => {
    const passwordOnly = "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport";
    expect(saml([passwordOnly], { amr: ["pwd", "mfa", "swk"] })).toMatchObject({
      verified: true,
      evidence: ["amr=mfa"]
    });
  });

  test("reads a single-valued attribute as a string, whatever its case", () => {
    expect(saml([], { AMR: "mfa" })).toMatchObject({ verified: true, evidence: ["AMR=mfa"] });
  });

  describe("default attribute per provider", () => {
    const passwordMethod = "http://schemas.microsoft.com/ws/2008/06/identity/authenticationmethod/password";
    const passwordClass = "urn:oasis:names:tc:SAML:2.0:ac:classes:Password";
    const entraPush = { [AUTHN_METHODS_REFERENCES]: [passwordMethod, MULTIPLEAUTHN] };

    // Entra ID reports a push or TOTP login as Password in AuthnContextClassRef.
    test("reads authnmethodsreferences for an Entra ID config with no attribute set", () => {
      expect(saml([passwordClass], entraPush, { authProvider: "azure-saml" })).toMatchObject({
        verified: true,
        evidence: [`${AUTHN_METHODS_REFERENCES}=${MULTIPLEAUTHN}`]
      });
      expect(
        saml([passwordClass], { [AUTHN_METHODS_REFERENCES]: [passwordMethod] }, { authProvider: "azure-saml" }).verified
      ).toBe(false);
    });

    test("reads amr, not authnmethodsreferences, for every other provider", () => {
      expect(saml([passwordClass], entraPush, { authProvider: "okta-saml" }).verified).toBe(false);
      expect(saml([], { amr: ["mfa"] }, { authProvider: "okta-saml" }).verified).toBe(true);
    });

    test("an attribute set on the config overrides the provider default", () => {
      expect(
        saml([], { amr: ["mfa"], ...entraPush }, { authProvider: "azure-saml", mfaSignalAttribute: "amr" })
      ).toMatchObject({ verified: true, evidence: ["amr=mfa"] });
    });
  });

  test("reads only the configured attribute, not amr, once a name is set", () => {
    const attributes = { amr: ["mfa"], authMethods: ["pwd"] };
    expect(saml([], attributes, { mfaSignalAttribute: "authMethods" }).verified).toBe(false);
  });

  test("accepts extra context classes from the configuration on top of the defaults", () => {
    const custom = "urn:example:ac:classes:HardwareToken";
    expect(saml([custom]).verified).toBe(false);
    expect(saml([custom], undefined, { mfaAuthnContexts: [custom] })).toMatchObject({
      verified: true,
      evidence: [custom]
    });
  });

  test("rejects a password-only assertion with unrelated attributes", () => {
    const passwordOnly = "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport";
    expect(saml([passwordOnly], { email: "user@example.com", groups: ["admins"], amr: ["pwd"] })).toMatchObject({
      verified: false,
      evidence: []
    });
  });
});

describe("matchIdpMfaSignal received values", () => {
  test("keeps every value the OIDC claim carried, matched or not", () => {
    expect(oidc({ amr: ["pwd", "otp"] })).toEqual({ verified: false, evidence: [], received: ["pwd", "otp"] });
    expect(oidc({ amr: ["pwd", "mfa"] }).received).toEqual(["pwd", "mfa"]);
    expect(oidc({ sub: "u1" }).received).toEqual([]);
  });

  test("keeps the SAML context classes and the attribute values that were read", () => {
    const passwordOnly = "urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport";
    expect(saml([passwordOnly], { amr: ["pwd", "swk"], groups: ["admins"] })).toEqual({
      verified: false,
      evidence: [],
      received: [passwordOnly, "amr=pwd", "amr=swk"]
    });
  });

  test("bounds the received list like the matched one", () => {
    const amr = Array.from({ length: 60 }, (_, index) => `method-${index}`);
    expect(oidc({ amr }).received).toHaveLength(50);
  });
});
