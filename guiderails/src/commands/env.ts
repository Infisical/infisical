import { InfisicalApi } from "../env/api.js";
import {
  bootstrapInstance,
  clearInstanceState,
  loadInstanceState,
  STATE_FILE,
  waitForInstance
} from "../env/bootstrap.js";
import { listFixtures, setupFixture } from "../env/fixtures.js";
import { composeDown, composeLogs, composeUp } from "../env/stack.js";

/**
 * Read lazily rather than at module load, so this cannot depend on whether the .env loader
 * happened to be evaluated first.
 */
const defaultBaseUrl = (): string =>
  process.env.GUIDERAILS_BASE_URL ?? "http://localhost:8080";

const USAGE = `guiderails env <subcommand>

  up [--base-url u]        Start the stack, wait for readiness, bootstrap, print credentials.
  down [--volumes]         Stop the stack. --volumes also drops the database.
  bootstrap [--force]      Bootstrap an already-running instance.
  wait [--base-url u]      Block until the instance answers.
  finish-setup             Mark instance onboarding complete (repair path).
  logs [--tail n]          Tail the backend logs.
  fixture <name>           Set up one fixture and print what it created.
  fixtures                 List the registered fixtures.
`;

const flag = (argv: string[], name: string): string | null => {
  const index = argv.indexOf(name);
  return index >= 0 ? (argv[index + 1] ?? null) : null;
};

export const runEnv = async (argv: string[]): Promise<number> => {
  const [subcommand, ...rest] = argv;
  const baseUrl = flag(rest, "--base-url") ?? defaultBaseUrl();

  switch (subcommand) {
    case "up": {
      process.stdout.write("starting the stack\n");
      await composeUp();

      process.stdout.write(`waiting for ${baseUrl}\n`);
      await waitForInstance(baseUrl, {
        onAttempt: (attempt, elapsed) => {
          if (attempt % 5 === 0) {
            process.stdout.write(`  still waiting (${Math.round(elapsed / 1000)}s)\n`);
          }
        }
      });

      const { state, reused } = await bootstrapInstance({ baseUrl });
      process.stdout.write(
        reused
          ? `reusing cached bootstrap from ${STATE_FILE}\n`
          : `bootstrapped a fresh instance\n`
      );
      process.stdout.write(`\n  url:      ${state.baseUrl}\n`);
      process.stdout.write(`  email:    ${state.adminEmail}\n`);
      process.stdout.write(`  password: ${state.adminPassword}\n`);
      process.stdout.write(`  org:      ${state.organizationSlug} (${state.organizationId})\n`);
      process.stdout.write(`\ncredentials cached in ${STATE_FILE}\n`);
      return 0;
    }

    case "down": {
      const withVolumes = rest.includes("--volumes");
      await composeDown(withVolumes);
      if (withVolumes) {
        // The cached credentials describe a database that no longer exists; keeping them
        // would make the next `up` reuse them and then fail confusingly on login.
        clearInstanceState();
        process.stdout.write("stack and database removed, cached credentials cleared\n");
      } else {
        process.stdout.write("stack stopped, database preserved\n");
      }
      return 0;
    }

    case "bootstrap": {
      const { state, reused } = await bootstrapInstance({
        baseUrl,
        force: rest.includes("--force")
      });
      process.stdout.write(
        `${reused ? "reused cached" : "created"} admin ${state.adminEmail} in org ${
          state.organizationSlug
        }\n`
      );
      if (!reused) process.stdout.write(`password: ${state.adminPassword}\n`);
      return 0;
    }

    case "wait": {
      await waitForInstance(baseUrl);
      process.stdout.write(`${baseUrl} is ready\n`);
      return 0;
    }

    case "finish-setup": {
      // Repair path for an instance bootstrapped before this step existed, or one where the
      // super-admin is still being redirected into the /admin/setup wizard.
      const state = loadInstanceState();
      const api = new InfisicalApi(state.baseUrl);
      const login = await api.login(state.adminEmail, state.adminPassword);
      const scoped = await api.selectOrganization(login.accessToken, state.organizationId);
      await api.completeOnboarding(scoped.token);
      process.stdout.write("instance onboarding marked complete\n");
      return 0;
    }

    case "logs": {
      const tail = Number.parseInt(flag(rest, "--tail") ?? "200", 10);
      await composeLogs(Number.isFinite(tail) ? tail : 200);
      return 0;
    }

    case "fixtures": {
      for (const fixture of listFixtures()) {
        process.stdout.write(`${fixture.name}\n    ${fixture.description}\n`);
      }
      return 0;
    }

    case "fixture": {
      const name = rest.find((arg) => !arg.startsWith("--"));
      if (!name) {
        process.stderr.write("usage: guiderails env fixture <name>\n");
        return 2;
      }
      const result = await setupFixture(name, loadInstanceState());
      process.stdout.write(`${result.name}\n`);
      for (const line of result.describe) process.stdout.write(`    ${line}\n`);
      process.stdout.write(`\nvalues:\n`);
      for (const [key, value] of Object.entries(result.values)) {
        process.stdout.write(`    ${key}: ${value}\n`);
      }
      return 0;
    }

    default:
      process.stderr.write(USAGE);
      return subcommand === undefined ? 0 : 2;
  }
};
