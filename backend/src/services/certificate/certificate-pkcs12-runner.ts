import path from "node:path";
import { Worker } from "node:worker_threads";

import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { Pkcs12ErrorCode, TExtractPkcs12Result, TPkcs12ErrorCode } from "./certificate-pkcs12-fns";

// Two clocks. The keystore only controls how long *decryption* takes, so that is what gets the
// tight budget. Starting the thread and loading its modules is our cost, not the file's, and on a
// cold or busy host it can take seconds — charging that to the file produced false "takes too long"
// failures on ordinary keystores. The startup ceiling is generous and only catches a stuck thread.
const DECRYPTION_TIMEOUT_MS = 3_000;
const STARTUP_TIMEOUT_MS = 30_000;
const MAX_CONCURRENT_EXTRACTIONS = 2;
// Queue a little, then refuse. Waiting is not free: each caller holds its keystore in memory for
// the whole wait, and a queue that only grows turns a burst into a slow failure for everyone
// instead of a fast one for the callers past the line.
const MAX_QUEUED_EXTRACTIONS = 8;

// The keystore itself chooses how much work its own decryption costs, through the PBKDF2 iteration
// count, and node-forge decrypts synchronously. A 2.6KB keystore built with five million rounds
// blocks the event loop for over a minute, and a wrong password costs exactly the same because the
// integrity check runs the same derivation. No pre-flight inspection can bound this: the rounds for
// a shrouded key bag are inside the encrypted blob and only become readable once the outer layer is
// already decrypted. So the work runs on a worker with a wall clock, and too many at once queue.
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

// In development the server runs straight off the TypeScript sources; in production it runs the
// ESM build, where every source file has a sibling .mjs. Anchor on this module's own extension so
// both resolve without a build-time special case.
const isRunningFromSource = __filename.endsWith(".ts");
const moduleExtension = isRunningFromSource ? ".ts" : ".mjs";
const workerPath = path.join(__dirname, `certificate-pkcs12-worker${moduleExtension}`);
const extractionModulePath = path.join(__dirname, `certificate-pkcs12-fns${moduleExtension}`);

// Loading a .ts file directly makes Node sniff the module type and warn about it on every spawn,
// which would bury the dev log. The build output is unambiguous, so only silence the source path.
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
