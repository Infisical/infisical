import { testBuiltConnectionWithGateway as realTest } from "../../src/ee/services/gateway-v2/gateway-v2-fns";
import type * as Real from "../../src/ee/services/gateway-v2/gateway-v2-fns";

export * from "../../src/ee/services/gateway-v2/gateway-v2-fns";
const scope = globalThis as typeof globalThis & {
  pamTestConnectionFailure?: boolean;
  pamFixtureGateways?: Set<string>;
};
scope.pamFixtureGateways ??= new Set();
export const registerPamFixtureGateway = (id: string) => scope.pamFixtureGateways!.add(id);
export const setPamConnectionTestFailure = (value: boolean) => {
  scope.pamTestConnectionFailure = value;
};
export const testBuiltConnectionWithGateway: typeof Real.testBuiltConnectionWithGateway = async (...args) =>
  !scope.pamFixtureGateways!.has(args[1])
    ? realTest(...args)
    : scope.pamTestConnectionFailure
      ? { ok: false, status: 503, errorMessage: "Fixture app is offline", kind: "transport" }
      : { ok: true, status: 200 };
