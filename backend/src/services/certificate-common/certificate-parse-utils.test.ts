import * as x509 from "@peculiar/x509";
import { describe, expect, it, vi } from "vitest";

import * as parseUtils from "./certificate-parse-utils";

vi.mock("./certificate-parse-utils", async (importOriginal) => {
  const actual = await importOriginal<typeof parseUtils>();
  return { ...actual, toX509Certificate: vi.fn(actual.toX509Certificate) };
});

// eslint-disable-next-line import/first
import { extractExternallyIssuedCertificateFields } from "../certificate/certificate-fns";

const { crypto } = globalThis;
x509.cryptoProvider.set(crypto as never);

describe("certificate parsing is not repeated", () => {
  it("every normalisation receives an already-parsed certificate, never bytes", async () => {
    const keys = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" } as EcKeyGenParams, true, [
      "sign",
      "verify"
    ]);
    const cert = await x509.X509CertificateGenerator.createSelfSigned(
      {
        serialNumber: "01",
        name: "CN=parse.example.com,O=Example",
        notBefore: new Date(),
        notAfter: new Date(Date.now() + 86400000),
        keys,
        signingAlgorithm: { name: "ECDSA", hash: { name: "SHA-256" } },
        extensions: [
          new x509.SubjectAlternativeNameExtension([{ type: "dns", value: "parse.example.com" }], false),
          new x509.Extension("1.3.6.1.4.1.55555.1", false, new Uint8Array([0x0c, 0x02, 0x68, 0x69]).buffer)
        ]
      },
      crypto as never
    );

    const spy = vi.mocked(parseUtils.toX509Certificate);
    spy.mockClear();

    const fields = extractExternallyIssuedCertificateFields(cert);

    const args = spy.mock.calls.map(([source]) => source);
    const buffersParsed = args.filter((a) => Buffer.isBuffer(a)).length;
    // eslint-disable-next-line no-console
    console.log(`normalisation calls: ${args.length}, of which needed a real parse: ${buffersParsed}`);
    // eslint-disable-next-line no-console
    console.log(
      `  cn=${fields.commonName} san=${(fields as { altNames?: string }).altNames} alg=${fields.keyAlgorithm}`
    );
    expect(buffersParsed).toBe(0);
    expect(args.every((a) => a === cert)).toBe(true);
  });
});
