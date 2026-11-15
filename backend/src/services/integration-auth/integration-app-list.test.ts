import { describe, expect, it } from "vitest";

import { getOctopusDeployBaseUrl } from "./integration-app-list";

describe("getOctopusDeployBaseUrl", () => {
  it.each([
    ["https://octopus.example", "https://octopus.example"],
    ["https://octopus.example/", "https://octopus.example"],
    ["https://octopus.example/api", "https://octopus.example"],
    ["https://octopus.example/api/", "https://octopus.example"],
    ["https://octopus.example/octopus/api", "https://octopus.example/octopus"],
    ["https://octopus.example/octopus", "https://octopus.example/octopus"]
  ])("normalizes %s to %s, as the Octopus SDK did", (instanceURL, expected) => {
    expect(getOctopusDeployBaseUrl(instanceURL)).toBe(expected);
  });
});
