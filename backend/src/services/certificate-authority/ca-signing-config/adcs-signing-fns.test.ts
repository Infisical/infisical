import { webcrypto } from "node:crypto";

import * as x509 from "@peculiar/x509";

import { convertRawCertsToPkcs7 } from "@app/ee/services/certificate-est/certificate-est-fns";
import { BadRequestError } from "@app/lib/errors";
import { splitPemChain } from "@app/services/certificate/certificate-fns";

import { fetchAdcsCaChain, getAdcsRenewalCount } from "./adcs-signing-fns";

vi.mock("@app/lib/logger", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() }
}));

const certcarcPage = (nRenewals: number) =>
  `<html><script>var nRenewals=${nRenewals};\nvar sCAName="Contoso CA";</script></html>`;

const ADCS_ERROR_PAGE = `<html><body><p>Certificate Services could not be started</p><p>Error Parsing Request</p></body></html>`;

type TRoute = string | Error | ((endpoint: string) => string | Error);

const fakeClient = (routes: Record<string, TRoute>) => {
  const requests: string[] = [];
  return {
    requests,
    get: (endpoint: string) => {
      requests.push(endpoint);
      const route = routes[endpoint];
      if (route === undefined) return Promise.reject(new Error(`Request failed with status code 404: ${endpoint}`));
      const value = typeof route === "function" ? route(endpoint) : route;
      if (value instanceof Error) return Promise.reject(value);
      return Promise.resolve({ data: value });
    }
  };
};

const caCertUrl = (renewal: number) => `/certsrv/certnew.cer?ReqID=CACert&Renewal=${renewal}&Enc=b64`;
const caChainUrl = (renewal: number) => `/certsrv/certnew.p7b?ReqID=CACert&Renewal=${renewal}&Enc=b64`;

const base64Body = (cert: x509.X509Certificate) =>
  Buffer.from(cert.rawData)
    .toString("base64")
    .replace(/(.{64})/g, "$1\r\n");

const pkcs7Pem = (certs: x509.X509Certificate[]) =>
  `-----BEGIN PKCS7-----\n${convertRawCertsToPkcs7(certs.map((c) => c.rawData))}\n-----END PKCS7-----`;

describe("getAdcsRenewalCount", () => {
  test("reads nRenewals from certcarc.asp", async () => {
    const client = fakeClient({ "/certsrv/certcarc.asp": certcarcPage(3) });
    await expect(getAdcsRenewalCount(client)).resolves.toBe(3);
  });

  test("tolerates whitespace and casing variations in the script", async () => {
    const client = fakeClient({ "/certsrv/certcarc.asp": "<script>VAR  nRenewals = 12 ;</script>" });
    await expect(getAdcsRenewalCount(client)).resolves.toBe(12);
  });

  test("rejects a page that does not report nRenewals instead of assuming the original certificate", async () => {
    const client = fakeClient({ "/certsrv/certcarc.asp": ADCS_ERROR_PAGE });
    await expect(getAdcsRenewalCount(client)).rejects.toThrow(/did not report nRenewals/);
  });

  test("rejects an implausible renewal count", async () => {
    const client = fakeClient({ "/certsrv/certcarc.asp": certcarcPage(99999) });
    await expect(getAdcsRenewalCount(client)).rejects.toBeInstanceOf(BadRequestError);
  });

  test("falls back to renewal 0 only when the page cannot be fetched", async () => {
    const client = fakeClient({});
    await expect(getAdcsRenewalCount(client)).resolves.toBe(0);
  });
});

describe("fetchAdcsCaChain", () => {
  const alg = { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" };
  let serial = 0;

  const genKeys = async () => (await webcrypto.subtle.generateKey(alg, true, ["sign", "verify"])) as CryptoKeyPair;

  const genCert = async (subject: string, issuer: string, publicKey: CryptoKey, signingKey: CryptoKey) => {
    serial += 1;
    return x509.X509CertificateGenerator.create({
      serialNumber: serial.toString(16).padStart(2, "0"),
      subject,
      issuer,
      notBefore: new Date("2026-01-01"),
      notAfter: new Date("2036-01-01"),
      publicKey,
      signingKey,
      signingAlgorithm: alg,
      extensions: [new x509.BasicConstraintsExtension(true, undefined, true)]
    });
  };

  let root: x509.X509Certificate;
  let issuingOriginal: x509.X509Certificate;
  let issuingCurrent: x509.X509Certificate;
  let issuedByOriginal: x509.X509Certificate;
  let issuedByCurrent: x509.X509Certificate;

  const subjects = (pem: string) => splitPemChain(pem).map((c) => new x509.X509Certificate(c).serialNumber);

  beforeAll(async () => {
    x509.cryptoProvider.set(webcrypto as unknown as Crypto);

    const rootKeys = await genKeys();
    const originalKeys = await genKeys();
    const currentKeys = await genKeys();
    const leafKeys = await genKeys();

    root = await genCert("CN=Root", "CN=Root", rootKeys.publicKey, rootKeys.privateKey);
    issuingOriginal = await genCert("CN=Issuing", "CN=Root", originalKeys.publicKey, rootKeys.privateKey);
    issuingCurrent = await genCert("CN=Issuing", "CN=Root", currentKeys.publicKey, rootKeys.privateKey);
    issuedByOriginal = await genCert("CN=Leaf", "CN=Issuing", leafKeys.publicKey, originalKeys.privateKey);
    issuedByCurrent = await genCert("CN=Leaf", "CN=Issuing", leafKeys.publicKey, currentKeys.privateKey);
  });

  test("returns the current CA certificate and its chain after a new-key renewal", async () => {
    const client = fakeClient({
      "/certsrv/certcarc.asp": certcarcPage(1),
      [caCertUrl(1)]: base64Body(issuingCurrent),
      [caChainUrl(1)]: pkcs7Pem([root, issuingCurrent])
    });

    const chain = await fetchAdcsCaChain(client, issuedByCurrent.toString("pem"));

    expect(subjects(chain)).toEqual([issuingCurrent.serialNumber, root.serialNumber]);
    expect(client.requests).toEqual(["/certsrv/certcarc.asp", caCertUrl(1), caChainUrl(1)]);
  });

  test("walks back to the superseded CA certificate when it issued the certificate", async () => {
    const client = fakeClient({
      "/certsrv/certcarc.asp": certcarcPage(1),
      [caCertUrl(1)]: base64Body(issuingCurrent),
      [caCertUrl(0)]: issuingOriginal.toString("pem"),
      [caChainUrl(0)]: pkcs7Pem([issuingOriginal, root])
    });

    const chain = await fetchAdcsCaChain(client, issuedByOriginal.toString("pem"));

    expect(subjects(chain)).toEqual([issuingOriginal.serialNumber, root.serialNumber]);
    expect(client.requests).toEqual(["/certsrv/certcarc.asp", caCertUrl(1), caCertUrl(0), caChainUrl(0)]);
  });

  test("skips a renewal index whose certificate cannot be fetched or parsed", async () => {
    const client = fakeClient({
      "/certsrv/certcarc.asp": certcarcPage(2),
      [caCertUrl(2)]: ADCS_ERROR_PAGE,
      [caCertUrl(0)]: base64Body(issuingOriginal),
      [caChainUrl(0)]: pkcs7Pem([issuingOriginal, root])
    });

    const chain = await fetchAdcsCaChain(client, issuedByOriginal.toString("pem"));

    expect(subjects(chain)).toEqual([issuingOriginal.serialNumber, root.serialNumber]);
  });

  test("returns only the issuing CA certificate when the PKCS#7 chain is unavailable", async () => {
    const client = fakeClient({
      "/certsrv/certcarc.asp": certcarcPage(0),
      [caCertUrl(0)]: base64Body(issuingOriginal)
    });

    const chain = await fetchAdcsCaChain(client, issuedByOriginal.toString("pem"));

    expect(subjects(chain)).toEqual([issuingOriginal.serialNumber]);
  });

  test("returns only the issuing CA certificate when the PKCS#7 response is not SignedData", async () => {
    const client = fakeClient({
      "/certsrv/certcarc.asp": certcarcPage(0),
      [caCertUrl(0)]: base64Body(issuingOriginal),
      [caChainUrl(0)]: ADCS_ERROR_PAGE
    });

    const chain = await fetchAdcsCaChain(client, issuedByOriginal.toString("pem"));

    expect(subjects(chain)).toEqual([issuingOriginal.serialNumber]);
  });

  test("verifies renewal 0 against the issued certificate when certcarc.asp cannot be fetched", async () => {
    const client = fakeClient({
      [caCertUrl(0)]: base64Body(issuingOriginal),
      [caChainUrl(0)]: pkcs7Pem([issuingOriginal, root])
    });

    await expect(fetchAdcsCaChain(client, issuedByOriginal.toString("pem"))).resolves.toBeTruthy();
    await expect(fetchAdcsCaChain(client, issuedByCurrent.toString("pem"))).rejects.toThrow(
      "None of the 1 CA certificate(s)"
    );
  });

  test("rejects when no published CA certificate issued the certificate", async () => {
    const client = fakeClient({
      "/certsrv/certcarc.asp": certcarcPage(1),
      [caCertUrl(1)]: base64Body(issuingCurrent),
      [caCertUrl(0)]: base64Body(issuingOriginal)
    });

    const strangerKeys = await genKeys();
    const stranger = await genCert("CN=Leaf", "CN=Issuing", strangerKeys.publicKey, strangerKeys.privateKey);

    await expect(fetchAdcsCaChain(client, stranger.toString("pem"))).rejects.toThrow("None of the 2 CA certificate(s)");
  });

  test("propagates the certcarc.asp parse failure instead of silently using the original certificate", async () => {
    const client = fakeClient({
      "/certsrv/certcarc.asp": ADCS_ERROR_PAGE,
      [caCertUrl(0)]: base64Body(issuingOriginal)
    });

    await expect(fetchAdcsCaChain(client, issuedByOriginal.toString("pem"))).rejects.toBeInstanceOf(BadRequestError);
    expect(client.requests).toEqual(["/certsrv/certcarc.asp"]);
  });
});
