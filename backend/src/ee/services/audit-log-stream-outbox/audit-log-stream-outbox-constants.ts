// Debounce window: first writer for a stream enqueues a flush job delayed by this many ms.
// Subsequent writers within the window are absorbed by the same job (SETNX is a no-op for them).
export const FLUSH_DEBOUNCE_MS = 5_000;

// A row that fails this many deliveries is dropped (there is no DLQ).
export const MAX_ATTEMPTS = 5;
