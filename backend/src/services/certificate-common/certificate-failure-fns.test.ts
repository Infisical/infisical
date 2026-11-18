import { describe, expect, it } from "vitest";

import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

import { CaOperationFailureStage } from "./certificate-constants";
import { describeCaOperationFailure } from "./certificate-failure-fns";

const adcsCa = { name: "e2e-adcs-ca", externalCa: { type: CaType.ADCS } };

const describeFailure = (
  stage: CaOperationFailureStage,
  error: unknown,
  { ca, message }: { ca?: Parameters<typeof describeCaOperationFailure>[0]["ca"]; message?: string } = {}
) =>
  describeCaOperationFailure({
    action: "Renewing the certificate",
    stage,
    ca,
    error,
    message,
    fallback: "Renewal failed."
  });

describe("describeCaOperationFailure", () => {
  it("names an external CA and its type, and ends the CA's message as a sentence", () => {
    expect(
      describeFailure(CaOperationFailureStage.Ca, new BadRequestError({ message: "Unable to connect to gateway" }), {
        ca: adcsCa
      })
    ).toBe("Renewing the certificate at CA 'e2e-adcs-ca' (Microsoft ADCS) failed: Unable to connect to gateway.");
  });

  it("quotes the upstream error rather than the job's stored reason, so the reason isn't prefixed twice", () => {
    expect(
      describeFailure(CaOperationFailureStage.Ca, new Error("AccessDeniedException: not authorized"), {
        ca: { name: "acm", externalCa: { type: CaType.AWS_ACM_PUBLIC_CA } },
        message: "Certificate issuance failed: AccessDeniedException: not authorized"
      })
    ).toBe("Renewing the certificate at CA 'acm' (AWS ACM Public CA) failed: AccessDeniedException: not authorized.");
  });

  it("quotes a CA's stored reason when the job had no error", () => {
    expect(
      describeFailure(CaOperationFailureStage.Ca, undefined, {
        ca: { name: "digicert" },
        message: "DigiCert order rejected"
      })
    ).toBe("Renewing the certificate at CA 'digicert' failed: DigiCert order rejected.");
  });

  it("doesn't blame the CA for Infisical's own database error", () => {
    expect(
      describeFailure(CaOperationFailureStage.Ca, new DatabaseError({ error: new Error("deadlock"), name: "x" }), {
        ca: adcsCa
      })
    ).toBe("Renewal failed.");
  });

  it("quotes Infisical's own check without naming the CA", () => {
    expect(
      describeFailure(
        CaOperationFailureStage.Infisical,
        new BadRequestError({ message: "TTL exceeds the policy maximum" }),
        {
          ca: adcsCa
        }
      )
    ).toBe("TTL exceeds the policy maximum.");
  });

  it("uses the fallback for an unexpected error Infisical hit, without passing on its text", () => {
    expect(describeFailure(CaOperationFailureStage.Infisical, new Error("socket hang up"), { ca: adcsCa })).toBe(
      "Renewal failed."
    );
  });

  it("says the CA issued the certificate when linking it to the request failed, so nobody retries into a duplicate", () => {
    expect(
      describeFailure(CaOperationFailureStage.AttachingIssuedCertificate, new Error("Failed to execute db ops"), {
        ca: adcsCa,
        message: "Failed to attach certificate: Failed to execute db ops"
      })
    ).toBe(
      "CA 'e2e-adcs-ca' (Microsoft ADCS) issued the certificate, but Infisical couldn't link it to this request. Find it in the certificate inventory before you renew or request it again."
    );
  });
});
