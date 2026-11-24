import { createMongoAbility } from "@casl/ability";
import Fastify from "fastify";
import { describe, expect, test, vi } from "vitest";

import { orgMemberPermissions, orgNoAccessPermissions } from "@app/ee/services/permission/org-permission";
import { ForbiddenRequestError } from "@app/lib/errors";
import { fastifyErrHandler } from "@app/server/plugins/error-handler";
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from "@app/server/plugins/fastify-zod";
import { AuthMode } from "@app/services/auth/auth-type";

import { registerPamProjectRouter } from "./pam-project-router";

vi.mock("@app/lib/config/env", () => ({
  getConfig: () => ({}),
  getOriginalConfig: () => ({})
}));

const PAM_PROJECT_ID = "pam-project-id";

const getPamProject = async ({ orgRules, isPamMember }: { orgRules: unknown[]; isPamMember: boolean }) => {
  const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(fastifyErrHandler);

  app.decorate("services", {
    permission: {
      getOrgPermission: vi.fn().mockResolvedValue({ permission: createMongoAbility(orgRules as never) }),
      getProjectPermission: vi.fn().mockImplementation(async () => {
        if (!isPamMember) throw new ForbiddenRequestError({ name: "ProjectMembershipNotFound" });
        return { hasRole: () => false };
      })
    }
  } as never);
  app.addHook("onRequest", async (req) => {
    Object.assign(req, {
      auth: { authMode: AuthMode.JWT },
      permission: { type: "user", id: "user-id", orgId: "org-id", authMethod: null },
      internalPamProjectId: PAM_PROJECT_ID
    });
  });
  await app.register(registerPamProjectRouter as never, { prefix: "/api/v1/pam/project" });

  const res = await app.inject({ method: "GET", url: "/api/v1/pam/project" });
  await app.close();
  return res;
};

describe("GET /api/v1/pam/project", () => {
  test.each([
    ["an org member outside it", orgMemberPermissions, false],
    ["a member of it with a no-access org role", orgNoAccessPermissions, true]
  ])("returns the project to %s", async (_label, orgRules, isPamMember) => {
    const res = await getPamProject({ orgRules, isPamMember });

    expect(res.json()).toEqual({ projectId: PAM_PROJECT_ID });
  });

  test("refuses a no-access org role outside it", async () => {
    const res = await getPamProject({ orgRules: orgNoAccessPermissions, isPamMember: false });

    expect(res.statusCode).toBe(403);
    expect(res.json<Record<string, unknown>>()).toMatchObject({
      error: "ProjectMembershipNotFound",
      message: "You do not have access to Privileged Access Manager. Ask an organization admin to add you."
    });
  });
});
