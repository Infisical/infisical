import { KmsCoreModule } from "../module";
import { TKmsCoreHooks } from "../service/kms-core-hooks";
import { TKmsCoreEnv } from "../service/root-key-service";
import { InMemoryKmsCoreStore } from "./in-memory-kms-core-store";

// The throwaway key the integration config and the fixtures use. Test data, never a default.
export const TEST_ENCRYPTION_KEY = "4bnfe4e407b8921c104518903515b218";

export const testKmsCoreEnv = (overrides: Partial<TKmsCoreEnv> = {}): TKmsCoreEnv => ({
  ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  ROOT_ENCRYPTION_KEY: undefined,
  KMS_ROOT_KEY_RETENTION_DAYS: 30,
  isHsmConfigured: false,
  ...overrides
});

// KMS Core over an in-memory store, not started. Unit tests call start() themselves.
export const buildInMemoryKmsCore = ({
  env,
  hooks = {},
  isFipsEnabled = () => false
}: { env?: Partial<TKmsCoreEnv>; hooks?: TKmsCoreHooks; isFipsEnabled?: () => boolean } = {}) => {
  const store = new InMemoryKmsCoreStore();
  const module = new KmsCoreModule({
    db: undefined as never,
    storage: store.storage,
    env: testKmsCoreEnv(env),
    hooks,
    isFipsEnabled
  });
  return { module, kms: module.service, store, state: store.state };
};
