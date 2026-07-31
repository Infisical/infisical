import path from "path";
import { defineConfig } from "vitest/config";
import { BaseSequencer, type TestSpecification } from "vitest/node";

// Vitest's default sequencer picks one of two orders depending on whether a
// results cache exists: size-descending when it doesn't, and
// failed-first-then-slowest-first when it does. That cache lives at
// `node_modules/.vite/vitest/<hash>/results.json` — inside the very directory
// CI restores from `actions/cache`, keyed on package-lock.json. So the suite
// runs in size order on the first build after a dependency bump, then in a
// frozen duration order for every build after that, and developers get whatever
// their own local cache implies.
//
// These specs share one database and one seeded org, so run order is part of
// their contract; an order that silently changes turns shared-state bugs into
// flakes that reproduce on some builds and not others. Sorting by path is
// deterministic everywhere and costs nothing here: the size heuristic exists to
// pack parallel workers, and this suite is deliberately single-fork with
// `fileParallelism: false`.
class PathSequencer extends BaseSequencer {
  // eslint-disable-next-line class-methods-use-this
  async sort(files: TestSpecification[]) {
    return [...files].sort((a, b) => a.moduleId.localeCompare(b.moduleId));
  }
}

export default defineConfig({
  test: {
    globals: true,
    env: {
      NODE_ENV: "test",
      E2E_TEST_ORACLE_DB_19_HOST: process.env.E2E_TEST_ORACLE_DB_19_HOST!,
      E2E_TEST_ORACLE_DB_19_USERNAME: process.env.E2E_TEST_ORACLE_DB_19_USERNAME!,
      E2E_TEST_ORACLE_DB_19_PASSWORD: process.env.E2E_TEST_ORACLE_DB_19_PASSWORD!,
      E2E_TEST_ORACLE_DB_19_DATABASE: process.env.E2E_TEST_ORACLE_DB_19_DATABASE!
    },
    environment: "./e2e-test/vitest-environment-knex.ts",
    include: ["./e2e-test/**/*.spec.ts"],
    // Runs per test file, after the environment is up — see the file for why.
    setupFiles: ["./e2e-test/setup/reset-shared-org-flags.ts"],
    sequence: { sequencer: PathSequencer },
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
        minForks: 1,
        maxForks: 1
      }
    },
    fileParallelism: false,

    alias: {
      "./license-fns": path.resolve(__dirname, "./src/ee/services/license/__mocks__/license-fns")
    }
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "./src"),
      "@bdd_routes/bdd-nock-router": path.resolve(__dirname, "./src/server/routes/bdd/bdd-nock-router.dev.ts")
    }
  }
});
