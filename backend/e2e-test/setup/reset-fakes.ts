import { fakeAwsConnection } from "e2e-test/fakes/aws-connection-fns";
import { fakeParameterStore } from "e2e-test/fakes/aws-parameter-store-sync-fns";

// The fakes are module singletons shared with the server booted in this same process, and the
// suite runs in a single fork with fileParallelism disabled. So a spec that seeds a
// destination, or makes credential validation fail, would otherwise leak that state into every
// file that runs after it — and into files that never mention secret syncs at all.
//
// Resetting at the start of every file makes each one self-healing regardless of how its
// predecessor ended, including a hard death that skips its own afterAll. Same reasoning as
// reset-shared-org-flags.ts, which this sits alongside.
//
// A spec still resets between its own tests; that is its own beforeEach, not this hook.
beforeAll(() => {
  fakeParameterStore.reset();
  fakeAwsConnection.reset();
});
