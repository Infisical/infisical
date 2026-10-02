import { logger } from "@app/lib/logger";

// Read from process.env rather than the parsed env config: a SIGSEGV gives the process no chance to
// run any JS afterwards, so the handler is only useful if it is armed before the fault. Waiting for
// initEnvConfig() would leave an unguarded window and couple crash diagnostics to config loading.
const isSegfaultHandlerEnabled = () => process.env.SEGFAULT_HANDLER_ENABLED === "true";

/**
 * Arms a native crash handler that prints a backtrace naming the faulting module, which is the only
 * way to attribute a SIGSEGV: the process is killed by the kernel, so Node writes no log line, flushes
 * no pino buffer, and emits no diagnostic report (--report-on-fatalerror does not cover signals).
 *
 * The addon is imported behind the flag so a deployment that leaves it off never loads the binary.
 */
export const registerSegfaultHandler = async () => {
  if (!isSegfaultHandlerEnabled()) return;

  try {
    const segfaultHandler = (await import("segfault-handler")).default;

    // No log path: the container filesystem dies with the task, so stderr is the only sink that
    // survives, and it is already shipped to CloudWatch by the awslogs driver.
    segfaultHandler.registerHandler();

    logger.info("registerSegfaultHandler: native crash handler armed, backtraces will go to stderr");
  } catch (err) {
    // An optional native dependency that is missing or failed to build must never stop the boot.
    logger.error(err, "registerSegfaultHandler: failed to arm native crash handler");
  }
};
