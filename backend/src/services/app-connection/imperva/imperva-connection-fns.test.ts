import { AxiosError } from "axios";

import { extractImpervaErrorMessage } from "./imperva-connection-fns";

const axiosErrorWith = (status: number, data: unknown) => {
  const error = new AxiosError("Request failed");
  error.response = { status, data } as never;
  return error;
};

describe("Imperva error messages", () => {
  test("keeps the reason Imperva gives for rejecting a credential", () => {
    const message = extractImpervaErrorMessage(
      axiosErrorWith(401, { errCode: 1003, errMsg: "Unauthorized request for account: 9999999" }),
      "fallback"
    );

    expect(message).toContain("Unauthorized request for account: 9999999");
    expect(message).toContain("the account ID names an account the key can reach");
  });

  test("falls back to its own wording when Imperva sends no reason", () => {
    expect(extractImpervaErrorMessage(axiosErrorWith(403, {}), "fallback")).toContain(
      "Imperva rejected the API ID or API key"
    );
  });

  test("prefers the provisioning API's message over the status fallback", () => {
    expect(extractImpervaErrorMessage(axiosErrorWith(404, { res_message: "Unknown/unauthorized site_id" }), "x")).toBe(
      "Unknown/unauthorized site_id"
    );
  });

  test("explains a 404 that carries no message", () => {
    expect(extractImpervaErrorMessage(axiosErrorWith(404, {}), "x")).toContain("could not find the website");
  });

  test("reads the REST API's error list", () => {
    const message = extractImpervaErrorMessage(
      axiosErrorWith(400, { errors: [{ title: "Bad Request", detail: "size must be one of [10, 25, 50, 100]" }] }),
      "x"
    );

    expect(message).toBe("Bad Request: size must be one of [10, 25, 50, 100]");
  });
});
