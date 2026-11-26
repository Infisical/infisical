import { AxiosError, AxiosHeaders } from "axios";

import {
  getLinearErrorMessage,
  getLinearIssue,
  LinearGraphqlError,
  listLinearLabels,
  listLinearStatuses,
  validateLinearConnectionCredentials
} from "./linear-connection-fns";
import { TLinearConnectionConfig } from "./linear-connection-types";

vi.mock("@app/lib/logger", () => ({ logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
const { post } = vi.hoisted(() => ({
  post: vi.fn<(url: string, body: unknown, options?: { headers?: Record<string, string> }) => Promise<unknown>>()
}));
vi.mock("@app/lib/config/request", () => ({ request: { post } }));
const config = { credentials: { apiKey: "lin_api_x" } } as TLinearConnectionConfig;

const axiosError = (status: number | null, data?: unknown, code?: string) => {
  const error = new AxiosError("Request failed", code);
  if (status) {
    error.response = { status, data, statusText: "", headers: {}, config: { headers: new AxiosHeaders() } };
  }
  return error;
};

const page = (field: string, names: string[], hasNextPage: boolean) => ({
  data: { data: { [field]: { nodes: names.map((name) => ({ name })), pageInfo: { hasNextPage, endCursor: "c" } } } }
});

beforeEach(() => {
  post.mockReset();
});

describe("validateLinearConnectionCredentials", () => {
  test("stores the workspace it read from Linear", async () => {
    post.mockResolvedValue({ data: { data: { viewer: { id: "u" }, organization: { id: "org-1", urlKey: "acme" } } } });

    await expect(validateLinearConnectionCredentials(config)).resolves.toEqual({
      apiKey: "lin_api_x",
      workspaceId: "org-1",
      workspaceUrlKey: "acme"
    });
  });

  test("sends a key pasted with a Bearer prefix without it", async () => {
    post.mockResolvedValue({ data: { data: { organization: { urlKey: "" } } } });

    const result = await validateLinearConnectionCredentials({
      credentials: { apiKey: "Bearer lin_api_x" }
    } as TLinearConnectionConfig);

    expect(post.mock.calls[0][2]?.headers).toMatchObject({ Authorization: "lin_api_x" });
    expect(result.workspaceUrlKey).toBeUndefined();
  });

  test("explains a key Linear rejects in a 400 with GraphQL errors", async () => {
    post.mockImplementation(async () => {
      throw axiosError(400, {
        errors: [{ message: "Authentication required", extensions: { code: "AUTHENTICATION_ERROR" } }]
      });
    });

    const caught = await validateLinearConnectionCredentials(config).catch((error: Error) => error);
    expect((caught as Error).message).toContain("Linear didn't accept this API key");
  });
});

describe("getLinearErrorMessage", () => {
  test("maps Linear's error codes and hides unmapped error text", () => {
    expect(getLinearErrorMessage(new LinearGraphqlError({ message: "x", extensions: { code: "FORBIDDEN" } }))).toBe(
      "The connection's Linear API key doesn't have permission for this"
    );
    expect(getLinearErrorMessage(new LinearGraphqlError({ message: "x", extensions: { code: "RATELIMITED" } }))).toBe(
      "Linear is rate limiting the connection's API key"
    );
    expect(
      getLinearErrorMessage(new LinearGraphqlError({ message: "internal stack", extensions: { code: "INTERNAL" } }))
    ).toBe("Linear returned an error (INTERNAL)");
  });

  test("maps transport failures", () => {
    expect(getLinearErrorMessage(axiosError(null, undefined, "ECONNABORTED"))).toBe(
      "Linear did not respond within 15 seconds"
    );
    expect(getLinearErrorMessage(axiosError(null, undefined, "ERR_CANCELED"))).toBe(
      "The check ran out of time before Linear answered"
    );
    expect(getLinearErrorMessage(axiosError(401))).toBe("Linear rejected the connection's API key");
    expect(getLinearErrorMessage(axiosError(503))).toBe("Linear responded with status 503");
    expect(getLinearErrorMessage(new Error("boom"))).toBe("Couldn't reach Linear");
  });
});

describe("getLinearIssue", () => {
  test("treats a missing issue as not found", async () => {
    post.mockResolvedValue({ data: { data: { issue: null } } });
    await expect(getLinearIssue(config, "ENG-1")).rejects.toThrow("Entity not found: Issue");
  });
});

describe("option lists", () => {
  test("stop after four pages instead of failing", async () => {
    post.mockResolvedValue(page("issueLabels", ["Bug"], true));

    await expect(listLinearLabels(config)).resolves.toEqual(["Bug"]);
    expect(post).toHaveBeenCalledTimes(4);
    expect(post.mock.calls[0][1]).toMatchObject({ variables: { filter: { isGroup: { eq: false } } } });
  });

  test("statuses are deduplicated across teams and filtered by uppercase team keys", async () => {
    post.mockResolvedValue(page("workflowStates", ["Todo", "Done", "Todo"], false));

    await expect(listLinearStatuses(config, { teamKeys: ["eng"] })).resolves.toEqual(["Done", "Todo"]);
    expect(post.mock.calls[0][1]).toMatchObject({ variables: { filter: { team: { key: { in: ["ENG"] } } } } });
  });
});
