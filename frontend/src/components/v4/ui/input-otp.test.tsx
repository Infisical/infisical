// @vitest-environment jsdom
import * as React from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

import { InputOTP, InputOTPGroup, InputOTPSlot } from "./input-otp";

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    }
  );
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await React.act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const slots = (
  <InputOTPGroup>
    {[0, 1, 2, 3, 4, 5].map((index) => (
      <InputOTPSlot key={index} index={index} />
    ))}
  </InputOTPGroup>
);
const render = async (child: React.ReactNode) => {
  await React.act(async () => root.render(child));
};
const inputValue = async (value: string) => {
  const input = host.querySelector("input");
  if (!input) throw new Error("Missing OTP input");
  await React.act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
it("bridges an uncontrolled default once, preserves the ref and reports whole partial/empty strings", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const changed = vi.fn();
  const ref = React.createRef<HTMLInputElement>();
  const draw = (defaultValue: string) => (
    <InputOTP
      ref={ref}
      defaultValue={defaultValue}
      maxLength={6}
      onChange={changed}
      pattern="^[0-9]+$"
      aria-label="Verification code"
      pushPasswordManagerStrategy="none"
    >
      {slots}
    </InputOTP>
  );
  await render(draw("123"));
  expect(ref.current).toBe(host.querySelector("input"));
  expect(ref.current?.value).toBe("123");
  await render(draw("999"));
  expect(ref.current?.value).toBe("123");
  await inputValue("4567");
  expect(changed).toHaveBeenLastCalledWith("4567");
  expect(ref.current?.value).toBe("4567");
  await inputValue("");
  expect(changed).toHaveBeenLastCalledWith("");
  expect(ref.current?.value).toBe("");
  expect(errors.mock.calls.flat().join(" ")).not.toMatch(
    /both value and defaultValue|changing an uncontrolled input|changing a controlled input/
  );
});
it("leaves controlled values with the owner while reporting edits without native default-value warnings", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const changed = vi.fn();
  const draw = (value: string) => (
    <InputOTP
      value={value}
      defaultValue="999999"
      maxLength={6}
      onChange={changed}
      pattern="^[0-9]+$"
      aria-label="Controlled verification code"
      pushPasswordManagerStrategy="none"
    >
      {slots}
    </InputOTP>
  );
  await render(draw("12"));
  await inputValue("123");
  expect(changed).toHaveBeenLastCalledWith("123");
  expect(host.querySelector("input")?.value).toBe("12");
  changed.mockClear();
  await render(draw("654321"));
  expect(host.querySelector("input")?.value).toBe("654321");
  expect(changed).not.toHaveBeenCalled();
  await render(draw(""));
  expect(host.querySelector("input")?.value).toBe("");
  expect(errors.mock.calls.flat().join(" ")).not.toMatch(
    /both value and defaultValue|changing an uncontrolled input|changing a controlled input/
  );
});
it("keeps default-valued disabled and invalid specimens warning-free", async () => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  await render(
    <>
      <InputOTP
        defaultValue="123456"
        disabled
        maxLength={6}
        aria-label="Unavailable code"
        pushPasswordManagerStrategy="none"
      >
        {slots}
      </InputOTP>
      <InputOTP
        defaultValue="654321"
        aria-invalid
        maxLength={6}
        aria-label="Invalid code"
        pushPasswordManagerStrategy="none"
      >
        {slots}
      </InputOTP>
    </>
  );
  expect([...host.querySelectorAll("input")].map((input) => input.value)).toEqual([
    "123456",
    "654321"
  ]);
  expect(host.querySelector<HTMLInputElement>("input[disabled]")?.disabled).toBe(true);
  expect(host.querySelector('input[aria-invalid="true"]')).not.toBeNull();
  expect(errors.mock.calls.flat().join(" ")).not.toMatch(
    /both value and defaultValue|changing an uncontrolled input|changing a controlled input/
  );
});
