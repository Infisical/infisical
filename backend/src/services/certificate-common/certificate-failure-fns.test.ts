import { describe, expect, it } from "vitest";

import { BadRequestError } from "@app/lib/errors";
import { CaType } from "@app/services/certificate-authority/certificate-authority-enums";

import { describeCaOperationFailure } from "./certificate-failure-fns";

const describeFailure = (error: unknown, ca?: Parameters<typeof describeCaOperationFailure>[0]["ca"]) =>
  describeCaOperationFailure({ action: "Renewing the certificate", ca, error, fallback: "Renewal failed." });

describe("describeCaOperationFailure", () => {
  it("names an external CA and its type, and ends the CA's message as a sentence", () => {
    expect(
      describeFailure(new BadRequestError({ message: "Unable to connect to gateway" }), {
        name: "e2e-adcs-ca",
        externalCa: { type: CaType.ADCS }
      })
    ).toBe("Renewing the certificate at CA 'e2e-adcs-ca' (Microsoft ADCS) failed: Unable to connect to gateway.");
  });

  it("says the CA failed unexpectedly without passing on an internal error's text", () => {
    expect(describeFailure(new Error("relation does not exist"), { name: "root-ca" })).toBe(
      "Renewing the certificate at CA 'root-ca' failed with an unexpected error."
    );
  });

  it("uses the fallback for an internal error when no CA is known", () => {
    expect(describeFailure(new Error("socket hang up"))).toBe("Renewal failed.");
  });
});
