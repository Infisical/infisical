import { AxiosError } from "axios";

import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { DatabricksConnectionMethod, DatabricksConnectionScope } from "./databricks-connection-enums";
import { validateDatabricksConnectionCredentials } from "./databricks-connection-fns";
import { TDatabricksConnectionConfig } from "./databricks-connection-types";

const { post } = vi.hoisted(() => ({ post: vi.fn() }));

vi.mock("@app/lib/config/request", () => ({ request: { post } }));
vi.mock("@app/lib/validator", () => ({ blockLocalAndPrivateIpAddresses: async () => {} }));
vi.mock("@app/services/app-connection/app-connection-fns", () => ({ encryptAppConnectionCredentials: vi.fn() }));

const validate = (scopes?: DatabricksConnectionScope[]) =>
  validateDatabricksConnectionCredentials({
    app: AppConnection.Databricks,
    method: DatabricksConnectionMethod.ServicePrincipal,
    orgId: "org-id",
    credentials: {
      workspaceUrl: "https://example.cloud.databricks.com",
      clientId: "client-id",
      clientSecret: "client-secret",
      scopes
    }
  } as TDatabricksConnectionConfig);

describe("validateDatabricksConnectionCredentials", () => {
  beforeEach(() => {
    post.mockReset();
    post.mockResolvedValue({ data: { access_token: "access-token", expires_in: 3600 } });
  });

  test("requests the selected scopes", async () => {
    await validate([DatabricksConnectionScope.Secrets, DatabricksConnectionScope.Scim]);

    expect(String(post.mock.calls[0][1])).toBe("grant_type=client_credentials&scope=secrets+scim");
  });

  test.each([undefined, []])("requests all-apis when scopes are %o", async (scopes) => {
    await validate(scopes);

    expect(String(post.mock.calls[0][1])).toBe("grant_type=client_credentials&scope=all-apis");
  });

  test("surfaces the Databricks error description", async () => {
    post.mockRejectedValue(
      Object.assign(new AxiosError("Request failed with status code 400"), {
        response: { data: { error_description: "Scopes 'all-apis' are not assigned to the client" } }
      })
    );

    await expect(validate()).rejects.toThrow(
      "Unable to validate connection: Scopes 'all-apis' are not assigned to the client"
    );
  });
});
