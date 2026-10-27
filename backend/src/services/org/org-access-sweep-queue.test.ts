import { ActorType } from "@app/services/auth/auth-type";
import { TEventInput } from "@app/services/event-outbox/event-outbox-types";

import {
  ORG_ACCESS_SWEEP_LIMIT,
  ORG_ACCESS_SWEEP_STATEMENT_TIMEOUT_MS,
  orgAccessSweepQueueFactory
} from "./org-access-sweep-queue";
import { ORG_MEMBERSHIP_REMOVED_EVENT } from "./org-membership-events";

const { loggerWarn, appCfg } = vi.hoisted(() => ({
  loggerWarn: vi.fn<(...args: unknown[]) => void>(),
  appCfg: { isSecondaryInstance: false }
}));
vi.mock("@app/lib/config/env", () => ({ getConfig: () => appCfg }));
vi.mock("@app/lib/logger", () => ({
  logger: { info: () => {}, warn: loggerWarn, error: () => {}, debug: () => {} },
  initLogger: () => {}
}));

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ORG_A = uuid(1);
const ORG_B = uuid(2);

const build = (orphans: { actorUserId: string | null; actorIdentityId: string | null; scopeOrgId: string }[]) => {
  const emitted: TEventInput[] = [];
  const register = vi.fn();
  const findOrphanedProjectActors = vi.fn().mockResolvedValue(orphans);
  const queue = orgAccessSweepQueueFactory({
    cronJob: { register } as never,
    orgDAL: { findOrphanedProjectActors },
    eventEmitter: {
      emit: async (event) => {
        emitted.push(event);
      }
    }
  });
  return { queue, emitted, register, findOrphanedProjectActors };
};

describe("orgAccessSweepQueue", () => {
  beforeEach(() => loggerWarn.mockClear());

  test("reports each orphaned actor as a removed org membership", async () => {
    const { queue, emitted, findOrphanedProjectActors } = build([
      { actorUserId: uuid(10), actorIdentityId: null, scopeOrgId: ORG_A },
      { actorUserId: null, actorIdentityId: uuid(20), scopeOrgId: ORG_B }
    ]);

    expect(await queue.runSweep()).toEqual({ orphans: 2 });
    expect(findOrphanedProjectActors).toHaveBeenCalledWith({
      limit: ORG_ACCESS_SWEEP_LIMIT,
      statementTimeoutMs: ORG_ACCESS_SWEEP_STATEMENT_TIMEOUT_MS
    });
    expect(emitted).toEqual([
      {
        eventType: ORG_MEMBERSHIP_REMOVED_EVENT,
        payload: { orgId: ORG_A, actorType: ActorType.USER, actorId: uuid(10) }
      },
      {
        eventType: ORG_MEMBERSHIP_REMOVED_EVENT,
        payload: { orgId: ORG_B, actorType: ActorType.IDENTITY, actorId: uuid(20) }
      }
    ]);
    expect(loggerWarn).not.toHaveBeenCalled();
  });

  test("runs the sweep only on the primary instance", () => {
    for (const isSecondaryInstance of [false, true]) {
      appCfg.isSecondaryInstance = isSecondaryInstance;
      const { queue, register } = build([]);
      queue.init();
      expect(register).toHaveBeenCalledWith(expect.objectContaining({ enabled: !isSecondaryInstance }));
    }
    appCfg.isSecondaryInstance = false;
  });

  test("warns when a run hits its row limit", async () => {
    const { queue } = build(
      Array.from({ length: ORG_ACCESS_SWEEP_LIMIT }, (_, i) => ({
        actorUserId: uuid(100000 + i),
        actorIdentityId: null,
        scopeOrgId: ORG_A
      }))
    );
    await queue.runSweep();
    expect(loggerWarn).toHaveBeenCalledTimes(1);
  });
});
