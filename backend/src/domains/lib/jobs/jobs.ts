import type { TCronJobFactory } from "@app/lib/cron/cron-job";
import type { TQueueServiceFactory } from "@app/queue";

// Type-only imports: @app/queue and @app/lib/cron are in an import cycle with @app/lib/crypto, so a module that
// loads them at runtime breaks any test that imports it first. domains.ts passes the runtime pieces in.
export type TDomainQueue = Pick<TQueueServiceFactory, "queue" | "start">;

export type TDomainCron = Pick<TCronJobFactory, "register">;
