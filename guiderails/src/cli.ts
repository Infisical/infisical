// Must stay first: loads guiderails/.env before any module reads process.env.
import "./load-env.js";

import { runCheckDrift, runCompile } from "./commands/compile.js";
import { runEnv } from "./commands/env.js";
import { runExtract } from "./commands/extract.js";
import { runLintImages } from "./commands/lint-images.js";
import { runRun } from "./commands/run.js";
import { runSelect } from "./commands/select.js";

const USAGE = `guiderails <command> [args]

Every command that takes [guide...] accepts a substring, so \`folder\` finds
docs/documentation/platform/folder.mdx. Naming none means all of them.

Commands
  lint-images [guide...] [--json]         Verify local image references resolve.
  extract <guide>... [--tab t] [--json]   Show what the parser sees in a guide.
  select --all | --changed-files <path>   Resolve which guides a change should re-check.
  env <up|down|bootstrap|wait|logs|finish-setup|fixture|fixtures>
                                          Manage the instance under test.
  compile [guide...] [--force]            Compile guides to committed plan artifacts.
  check-drift [guide...] [--json]         Fail if a plan is missing or stale.
  run [guide...] [--live] [--headed]      Walk guides against the running instance.
             [--screenshots] [--force-agent]
             [--changed-files <path>] [--diff <path>]
`;

const main = async (): Promise<number> => {
  const [command, ...rest] = process.argv.slice(2);

  switch (command) {
    case "lint-images":
      return runLintImages(rest);
    case "extract":
      return runExtract(rest);
    case "select":
      return runSelect(rest);
    case "env":
      return runEnv(rest);
    case "compile":
      return runCompile(rest);
    case "check-drift":
      return runCheckDrift(rest);
    case "run":
      return runRun(rest);
    case undefined:
    case "-h":
    case "--help":
      process.stdout.write(USAGE);
      return 0;
    default:
      process.stderr.write(`Unknown command "${command}".\n\n${USAGE}`);
      return 2;
  }
};

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error: unknown) => {
    // Most failures here are the user naming a guide that does not exist or is ambiguous, and a
    // stack trace buries the one line that tells them what to type instead. The stack is still
    // available when something is genuinely broken.
    if (error instanceof Error) {
      process.stderr.write(`${error.message}\n`);
      if (process.env.GUIDERAILS_DEBUG) process.stderr.write(`\n${error.stack}\n`);
    } else {
      process.stderr.write(`${String(error)}\n`);
    }
    process.exitCode = 1;
  });
