import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { PostHog } from "posthog-js";

import {
  ACTIVATION_PRESENTATION_FLAG,
  ActivationVariant,
  resolveActivationVariant
} from "./resolveActivationVariant";

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
      const unsubscribe = mock.fn();
      const getFeatureFlag = mock.fn(() => value);
      const cancel = resolveActivationVariant(
        {
          getFeatureFlag,
          onFeatureFlags: (callback) => {
            callback([], {}, { errorsLoading: false });
            return unsubscribe;
          }
        },
        resolved
      );
      assert.equal(
        resolved.mock.calls[0].arguments[0],
        value === "control" || value === "card" ? value : null
      );
      assert.deepEqual(getFeatureFlag.mock.calls[0].arguments, [
        ACTIVATION_PRESENTATION_FLAG,
        { send_event: false, fresh: true }
      ]);
      assert.equal(unsubscribe.mock.callCount(), 1);
      cancel();
    });
  });

  it("waits for flags, freezes the assignment, and unsubscribes", () => {
    let listener: Parameters<PostHog["onFeatureFlags"]>[0] | undefined;
    let value = "card";
    const resolved: ActivationVariant[] = [];
    const unsubscribe = mock.fn();
    const cancel = resolveActivationVariant(
      {
        getFeatureFlag: () => value,
        onFeatureFlags: (callback) => {
          listener = callback;
          return unsubscribe;
        }
      },
      (variant) => resolved.push(variant)
    );
    assert.deepEqual(resolved, []);
    listener?.([], {}, { errorsLoading: false });
    value = "control";
    listener?.([], {}, { errorsLoading: false });
    assert.deepEqual(resolved, ["card"]);
    assert.equal(unsubscribe.mock.callCount(), 1);
    cancel();
  });

  it("falls back after a loading error without using cached flags", () => {
    const resolved = mock.fn();
    const getFeatureFlag = mock.fn(() => "card");
    resolveActivationVariant(
      {
        getFeatureFlag,
        onFeatureFlags: (callback) => {
          callback([], {}, { errorsLoading: true });
          return () => {};
        }
      },
      resolved
    )();
    assert.equal(resolved.mock.calls[0].arguments[0], null);
    assert.equal(getFeatureFlag.mock.callCount(), 0);
  });

  it("times out after three seconds and ignores late flags", (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    let listener: Parameters<PostHog["onFeatureFlags"]>[0] | undefined;
    const resolved = mock.fn();
    const cancel = resolveActivationVariant(
      {
        getFeatureFlag: () => "card",
        onFeatureFlags: (callback) => {
          listener = callback;
          return () => {};
        }
      },
      resolved
    );
    context.mock.timers.tick(2999);
    assert.equal(resolved.mock.callCount(), 0);
    context.mock.timers.tick(1);
    listener?.([], {}, { errorsLoading: false });
    assert.deepEqual(
      resolved.mock.calls.map(({ arguments: args }) => args),
      [[null]]
    );
    cancel();
  });

  it("cancels pending resolution when the nudge unmounts", (context) => {
    context.mock.timers.enable({ apis: ["setTimeout"] });
    let listener: Parameters<PostHog["onFeatureFlags"]>[0] | undefined;
    const resolved = mock.fn();
    const unsubscribe = mock.fn();
    const cancel = resolveActivationVariant(
      {
        getFeatureFlag: () => "card",
        onFeatureFlags: (callback) => {
          listener = callback;
          return unsubscribe;
        }
      },
      resolved
    );
    cancel();
    listener?.([], {}, { errorsLoading: false });
    context.mock.timers.tick(3000);
    assert.equal(resolved.mock.callCount(), 0);
    assert.equal(unsubscribe.mock.callCount(), 1);
  });
});
