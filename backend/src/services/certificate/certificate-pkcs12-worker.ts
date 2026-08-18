import { parentPort, workerData } from "node:worker_threads";

import type { TExtractPkcs12Result } from "./certificate-pkcs12-fns";

// Runs on a worker thread. Decrypting a PKCS#12 keystore is synchronous CPU work whose cost is
// chosen inside the uploaded file (the PBKDF2 iteration count), so on the main thread one crafted
// keystore stalls every other request on the instance for as long as it likes.
//
// The extraction module is imported by absolute path supplied by the parent, because the parent is
// the only side that knows whether it is running from TypeScript sources or from the build output.
// Keep this file, and everything it pulls in at runtime, free of non-erasable TypeScript: in
// development Node loads it directly and strips types without a compiler.

type TWorkerInput = { pkcs12: string; password: string; modulePath: string };

const { pkcs12, password, modulePath } = workerData as TWorkerInput;

type TExtractionModule = {
  extractPkcs12Entries: (input: { pkcs12: Buffer; password: string }) => Promise<TExtractPkcs12Result>;
  Pkcs12ExtractionError: new (code: string, count?: number) => Error & { code: string; count?: number };
};

const run = async () => {
  const mod = (await import(modulePath)) as TExtractionModule;

  // Loading this thread's modules is not decryption, and on a busy or cold host it can take
  // seconds. Tell the parent we are ready so its clock measures only the work the keystore
  // controls, instead of blaming the file for a slow start.
  parentPort?.postMessage({ ready: true });

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
