import { parentPort, workerData } from "node:worker_threads";

import type { TExtractPkcs12Result } from "./certificate-pkcs12-fns";

// In development Node loads this file directly and strips its types without a compiler, so keep it
// free of non-erasable TypeScript.

type TWorkerInput = { pkcs12: string; password: string; modulePath: string };

const { pkcs12, password, modulePath } = workerData as TWorkerInput;

type TExtractionModule = {
  extractPkcs12Entries: (input: { pkcs12: Buffer; password: string }) => Promise<TExtractPkcs12Result>;
  Pkcs12ExtractionError: new (code: string, count?: number) => Error & { code: string; count?: number };
};

const run = async () => {
  const mod = (await import(modulePath)) as TExtractionModule;

  try {
    const result = await mod.extractPkcs12Entries({ pkcs12: Buffer.from(pkcs12, "base64"), password });
    parentPort?.postMessage({ ok: true, result });
  } catch (err) {
    if (err instanceof mod.Pkcs12ExtractionError) {
      parentPort?.postMessage({ ok: false, code: err.code, count: err.count });
      return;
    }
    parentPort?.postMessage({ ok: false, unexpected: err instanceof Error ? err.message : "unknown error" });
  }
};

void run();
