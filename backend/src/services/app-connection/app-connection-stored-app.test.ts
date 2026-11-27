import { describe, expect, it } from "vitest";

import { AppConnection } from "./app-connection-enums";
import {
  fromStoredAppConnectionApp,
  getStoredAppConnectionAppValues,
  toStoredAppConnectionApp
} from "./app-connection-stored-app";

describe("stored app connection app", () => {
  it("writes Redfish connections with the value earlier releases read", () => {
    expect(toStoredAppConnectionApp(AppConnection.Redfish)).toBe("hpe-ilo");
  });

  it("reads both the legacy and the current stored value as Redfish", () => {
    expect(fromStoredAppConnectionApp("hpe-ilo")).toBe(AppConnection.Redfish);
    expect(fromStoredAppConnectionApp("redfish")).toBe(AppConnection.Redfish);
  });

  it("matches both stored values when filtering by Redfish", () => {
    expect(getStoredAppConnectionAppValues(AppConnection.Redfish)).toEqual(["redfish", "hpe-ilo"]);
  });

  it("leaves other apps untouched", () => {
    expect(toStoredAppConnectionApp(AppConnection.SSH)).toBe(AppConnection.SSH);
    expect(fromStoredAppConnectionApp(AppConnection.SSH)).toBe(AppConnection.SSH);
    expect(getStoredAppConnectionAppValues(AppConnection.SSH)).toEqual([AppConnection.SSH]);
  });
});
