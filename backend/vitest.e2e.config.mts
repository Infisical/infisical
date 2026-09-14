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
    // Runs per test file, after the environment is up — see each file for why.
    setupFiles: ["./e2e-test/setup/reset-shared-org-flags.ts", "./e2e-test/setup/reset-fakes.ts"],
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

    // AWS Parameter Store and the AWS app connection are replaced by fakes for the whole e2e
    // run, so the secret sync specs can assert what Infisical hands a destination without
    // reaching AWS. Nothing under src/ knows the fakes exist — see e2e-test/fakes/.
    //
    // Entries match the *import specifier*, which is what keeps this surgical rather than
    // sweeping: "./aws-parameter-store-sync-fns" is imported only by its own barrel, and
    // "./aws-connection-fns" only by aws/index.ts. The full-path entry covers the twelve
    // modules that import the connection functions directly, of which secret-sync-maps.ts
    // matters here: it calls getAwsAccountId on every sync creation, which would otherwise be
    // a real STS request that fails slowly and silently.
    //
    // An ordered array rather than an object so the exact @app/… entry is matched before the
    // generic "@app" prefix alias in resolve.alias below.
    alias: [
      {
        find: "./license-fns",
        replacement: path.resolve(__dirname, "./src/ee/services/license/__mocks__/license-fns")
      },
      {
        find: "./aws-parameter-store-sync-fns",
        replacement: path.resolve(__dirname, "./e2e-test/fakes/aws-parameter-store-sync-fns")
      },
      {
        find: /^@app\/services\/app-connection\/aws\/aws-connection-fns$/,
        replacement: path.resolve(__dirname, "./e2e-test/fakes/aws-connection-fns")
      },
      {
        find: "./aws-connection-fns",
        replacement: path.resolve(__dirname, "./e2e-test/fakes/aws-connection-fns")
      }
    ]
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "./src"),
      "@bdd_routes/bdd-nock-router": path.resolve(__dirname, "./src/server/routes/bdd/bdd-nock-router.dev.ts")
    }
  }
});
