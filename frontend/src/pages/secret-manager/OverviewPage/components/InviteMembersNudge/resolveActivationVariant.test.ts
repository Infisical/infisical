import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { PostHog } from "posthog-js";

import { ACTIVATION_PRESENTATION_FLAG, resolveActivationVariant } from "./resolveActivationVariant";

const createClient = (value?: string | boolean, immediate = false) => {
  let listener: Parameters<PostHog["onFeatureFlags"]>[0] = () => {};
  const emit = (errorsLoading = false) => listener([], {}, { errorsLoading });
  const unsubscribe = mock.fn();
  const client = {
    getFeatureFlag: mock.fn(() => value),
    onFeatureFlags: (callback: typeof listener) => {
      listener = callback;
      if (immediate) emit();
      return unsubscribe;
    }
  };
  return { client, emit, unsubscribe };
};

describe("resolveActivationVariant", () => {
  it("uses the original modal without enrolling when telemetry is unavailable", () => {
    const resolved = mock.fn();
    resolveActivationVariant(undefined, resolved)();
    assert.deepEqual(
      resolved.mock.calls.map(({ arguments: args }) => args),
      [[null]]
    );
  });

  ["control", "card", false, true, undefined, "unknown"].forEach((value) => {
    it(`resolves ${String(value)} without emitting an early exposure`, () => {
      const resolved = mock.fn();
      const { client, unsubscribe } = createClient(value, true);
      const cancel = resolveActivationVariant(client, resolved);
      assert.equal(
        resolved.mock.calls[0].arguments[0],
        value === "control" || value === "card" ? value : null
      );
      assert.deepEqual(client.getFeatureFlag.mock.calls[0].arguments, [
        ACTIVATION_PRESENTATION_FLAG,
        { send_event: false, fresh: true }
      ]);
      assert.equal(unsubscribe.mock.callCount(), 1);
      cancel();
    });
  });

  it("waits for flags, freezes the assignment, and unsubscribes", () => {
    const { client, emit, unsubscribe } = createClient("card");
    const resolved = mock.fn();
    const cancel = resolveActivationVariant(client, resolved);
    assert.equal(resolved.mock.callCount(), 0);
    emit();
    client.getFeatureFlag.mock.mockImplementation(() => "control");
    emit();
    assert.equal(resolved.mock.callCount(), 1);
    assert.equal(resolved.mock.calls[0].arguments[0], "card");
    assert.equal(unsubscribe.mock.callCount(), 1);
    cancel();
  });

  it("falls back after a loading error without using cached flags", () => {
    const resolved = mock.fn();
    const { client, emit } = createClient("card");
    const cancel = resolveActivationVariant(client, resolved);
    emit(true);
    assert.equal(resolved.mock.calls[0].arguments[0], null);
    assert.equal(client.getFeatureFlag.mock.callCount(), 0);
    cancel();
  });

  it("times out after three seconds and ignores late flags", (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const { client, emit } = createClient("card");
    const resolved = mock.fn();
    const cancel = resolveActivationVariant(client, resolved);
    context.mock.timers.tick(2999);
    assert.equal(resolved.mock.callCount(), 0);
    context.mock.timers.tick(1);
    emit();
    assert.deepEqual(
      resolved.mock.calls.map(({ arguments: args }) => args),
      [[null]]
    );
    cancel();
  });

  it("cancels pending resolution when the nudge unmounts", (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    const { client, emit, unsubscribe } = createClient("card");
    const resolved = mock.fn();
    const cancel = resolveActivationVariant(client, resolved);
    cancel();
    emit();
    context.mock.timers.tick(3000);
    assert.equal(resolved.mock.callCount(), 0);
    assert.equal(unsubscribe.mock.callCount(), 1);
  });
});
