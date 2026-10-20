import assert from "node:assert/strict";
import type { PostHog } from "posthog-js";
import { afterEach, describe, it, vi } from "vitest";

import { ACTIVATION_PRESENTATION_FLAG, resolveActivationVariant } from "./resolveActivationVariant";

const createClient = (value?: string | boolean, immediate = false) => {
  let listener: Parameters<PostHog["onFeatureFlags"]>[0] = () => {};
  const emit = (errorsLoading = false) => listener([], {}, { errorsLoading });
  const unsubscribe = vi.fn();
  const client = {
    getFeatureFlag: vi.fn(() => value),
    onFeatureFlags: (callback: typeof listener) => {
      listener = callback;
      if (immediate) emit();
      return unsubscribe;
    }
  };
  return { client, emit, unsubscribe };
};

describe("resolveActivationVariant", () => {
  afterEach(() => vi.useRealTimers());

  it("uses the original modal without enrolling when telemetry is unavailable", () => {
    const resolved = vi.fn();
    resolveActivationVariant(undefined, resolved)();
    assert.deepEqual(resolved.mock.calls, [[null]]);
  });

  ["control", "card", false, true, undefined, "unknown"].forEach((value) => {
    it(`resolves ${String(value)} without emitting an early exposure`, () => {
      const resolved = vi.fn();
      const { client, unsubscribe } = createClient(value, true);
      const cancel = resolveActivationVariant(client, resolved);
      assert.equal(
        resolved.mock.calls[0][0],
        value === "control" || value === "card" ? value : null
      );
      assert.deepEqual(client.getFeatureFlag.mock.calls[0], [
        ACTIVATION_PRESENTATION_FLAG,
        { send_event: false, fresh: true }
      ]);
      assert.equal(unsubscribe.mock.calls.length, 1);
      cancel();
    });
  });

  it("waits for flags, freezes the assignment, and unsubscribes", () => {
    const { client, emit, unsubscribe } = createClient("card");
    const resolved = vi.fn();
    const cancel = resolveActivationVariant(client, resolved);
    assert.equal(resolved.mock.calls.length, 0);
    emit();
    client.getFeatureFlag.mockImplementation(() => "control");
    emit();
    assert.equal(resolved.mock.calls.length, 1);
    assert.equal(resolved.mock.calls[0][0], "card");
    assert.equal(unsubscribe.mock.calls.length, 1);
    cancel();
  });

  it("falls back after a loading error without using cached flags", () => {
    const resolved = vi.fn();
    const { client, emit } = createClient("card");
    const cancel = resolveActivationVariant(client, resolved);
    emit(true);
    assert.equal(resolved.mock.calls[0][0], null);
    assert.equal(client.getFeatureFlag.mock.calls.length, 0);
    cancel();
  });

  it("times out after three seconds and ignores late flags", () => {
    vi.useFakeTimers();
    const { client, emit } = createClient("card");
    const resolved = vi.fn();
    const cancel = resolveActivationVariant(client, resolved);
    vi.advanceTimersByTime(2999);
    assert.equal(resolved.mock.calls.length, 0);
    vi.advanceTimersByTime(1);
    emit();
    assert.deepEqual(resolved.mock.calls, [[null]]);
    cancel();
  });

  it("cancels pending resolution when the nudge unmounts", () => {
    vi.useFakeTimers();
    const { client, emit, unsubscribe } = createClient("card");
    const resolved = vi.fn();
    const cancel = resolveActivationVariant(client, resolved);
    cancel();
    emit();
    vi.advanceTimersByTime(3000);
    assert.equal(resolved.mock.calls.length, 0);
    assert.equal(unsubscribe.mock.calls.length, 1);
  });
});
