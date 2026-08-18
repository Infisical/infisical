import path from "node:path";
import { Worker } from "node:worker_threads";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { Pkcs12ErrorCode, TExtractPkcs12Result, TPkcs12ErrorCode } from "./certificate-pkcs12-fns";

// The uploaded file picks its own decryption cost through its key-derivation round count, and
// node-forge decrypts synchronously, so extraction runs in a worker under a wall clock. Only
// decryption gets the tight budget: charging thread startup to the file failed ordinary keystores.
const DECRYPTION_TIMEOUT_MS = 3_000;
const STARTUP_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT_EXTRACTIONS = 2;
// Each waiter holds its keystore in memory for the whole wait.
const MAX_QUEUED_EXTRACTIONS = 8;

let inFlight = 0;
const waiting: (() => void)[] = [];

const acquireSlot = async () => {
  if (inFlight < MAX_CONCURRENT_EXTRACTIONS) {
    inFlight += 1;
    return;
  }

  if (waiting.length >= MAX_QUEUED_EXTRACTIONS) {
    throw new BadRequestError({
      message: "Too many keystores are being read right now. Try again in a moment."
    });
  }

  await new Promise<void>((resolve) => {
    waiting.push(resolve);
  });
  inFlight += 1;
};

const releaseSlot = () => {
  inFlight -= 1;
  waiting.shift()?.();
};

// Dev runs the TypeScript sources, production the ESM build; anchor on this module's own extension.
const isRunningFromSource = __filename.endsWith(".ts");
const moduleExtension = isRunningFromSource ? ".ts" : ".mjs";
const workerPath = path.join(__dirname, `certificate-pkcs12-worker${moduleExtension}`);
const extractionModulePath = path.join(__dirname, `certificate-pkcs12-fns${moduleExtension}`);

// Node sniffs the module type of a .ts file and warns on every spawn, burying the dev log.
const workerExecArgv = isRunningFromSource ? ["--no-warnings"] : undefined;

type TWorkerResponse =
  | { ready: true }
  | { ok: true; result: TExtractPkcs12Result }
  | { ok: false; code?: TPkcs12ErrorCode; count?: number; unexpected?: string };

const errorMessage = (code: TPkcs12ErrorCode, count?: number) => {
  switch (code) {
    case Pkcs12ErrorCode.NotAKeystore:
      return "This file is not a valid PKCS#12 keystore. Upload a .p12 or .pfx file.";
    case Pkcs12ErrorCode.UnsupportedEntries:
      return "This keystore contains entry types we cannot read, such as secret keys. Export only the certificate and its private key, then try again.";
    case Pkcs12ErrorCode.TooManyBags:
      return `This keystore contains ${count ?? "too many"} entries, which is more than we can import at once.`;
    case Pkcs12ErrorCode.NoEntries:
      return "This keystore contains no certificates or private keys.";
    case Pkcs12ErrorCode.NoPairs:
      return `This keystore contains ${count ?? "some"} private key${count === 1 ? "" : "s"}, but none of them match a certificate in the file.`;
    case Pkcs12ErrorCode.BadPassword:
    default:
      return "Could not open the keystore. Check the password and try again.";
  }
};

export const runPkcs12Extraction = async ({
  pkcs12,
  password
}: {
  pkcs12: Buffer;
  password: string;
}): Promise<TExtractPkcs12Result> => {
  await acquireSlot();

  try {
    return await new Promise<TExtractPkcs12Result>((resolve, reject) => {
      const worker = new Worker(workerPath, {
        workerData: { pkcs12: pkcs12.toString("base64"), password, modulePath: extractionModulePath },
        ...(workerExecArgv ? { execArgv: workerExecArgv } : {})
      });

      let settled = false;
      let timer: NodeJS.Timeout | undefined;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        void worker.terminate();
        fn();
      };

      const startClock = (ms: number, message: string) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => finish(() => reject(new BadRequestError({ message }))), ms);
      };

      startClock(STARTUP_TIMEOUT_MS, "Could not read this keystore.");

      worker.on("message", (message: TWorkerResponse) => {
        if ("ready" in message) {
          startClock(
            DECRYPTION_TIMEOUT_MS,
            "This keystore takes too long to open. It may use an unusually high number of key-derivation rounds."
          );
          return;
        }

        finish(() => {
          if (message.ok) {
            resolve(message.result);
            return;
          }
          if (message.unexpected) {
            logger.error(`PKCS#12 extraction failed unexpectedly [reason=${message.unexpected}]`);
            reject(new BadRequestError({ message: "Could not read this keystore." }));
            return;
          }
          reject(
            new BadRequestError({ message: errorMessage(message.code ?? Pkcs12ErrorCode.BadPassword, message.count) })
          );
        });
      });

      worker.on("error", (err) => {
        finish(() => {
          logger.error(err, "PKCS#12 extraction worker failed");
          reject(new BadRequestError({ message: "Could not read this keystore." }));
        });
      });

      worker.on("exit", (code) => {
        finish(() => {
          logger.error(`PKCS#12 extraction worker exited early [exitCode=${code}]`);
          reject(new BadRequestError({ message: "Could not read this keystore." }));
        });
      });
    });
  } finally {
    releaseSlot();
  }
};
