declare module "segfault-handler" {
  interface SegfaultHandler {
    /**
     * Installs a native handler for SIGSEGV/SIGBUS/SIGILL/SIGFPE that writes a backtrace
     * to stderr (and to `logPath`, when given) before the process dies.
     */
    registerHandler(logPath?: string): void;

    /** Dereferences a null pointer on purpose. Only for verifying the handler is armed. */
    causeSegfault(): void;
  }

  const segfaultHandler: SegfaultHandler;
  export = segfaultHandler;
}
