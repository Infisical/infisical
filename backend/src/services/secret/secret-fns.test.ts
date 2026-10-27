import { describe, expect, test, vi } from "vitest";

import { ClientClosedRequestError } from "@app/lib/errors";

import { interpolateSecrets } from "./secret-fns";

type Args = Parameters<typeof interpolateSecrets>[0];

describe("interpolateSecrets", () => {
  test("stops after the folder lookup when the signal aborts during it", async () => {
    const controller = new AbortController();
    const findBySecretPath = vi.fn<Args["folderDAL"]["findBySecretPath"]>().mockImplementation(async () => {
      controller.abort();
      return { id: "folder" } as Awaited<ReturnType<Args["folderDAL"]["findBySecretPath"]>>;
    });
    const findByFolderId = vi.fn<Args["secretDAL"]["findByFolderId"]>().mockResolvedValue([]);

    const expandSecret = interpolateSecrets({
      projectId: "project",
      secretEncKey: "key",
      folderDAL: { findBySecretPath },
      secretDAL: { findByFolderId },
      abortSignal: controller.signal
    });

    await expect(
      expandSecret({ value: `\${dev.shared.SOURCE}`, secretPath: "/app", environment: "dev" })
    ).rejects.toBeInstanceOf(ClientClosedRequestError);
    expect(findBySecretPath).toHaveBeenCalledOnce();
    expect(findByFolderId).not.toHaveBeenCalled();
  });

  test("does no lookups once the signal has already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const findBySecretPath = vi.fn<Args["folderDAL"]["findBySecretPath"]>();
    const findByFolderId = vi.fn<Args["secretDAL"]["findByFolderId"]>();

    const expandSecret = interpolateSecrets({
      projectId: "project",
      secretEncKey: "key",
      folderDAL: { findBySecretPath },
      secretDAL: { findByFolderId },
      abortSignal: controller.signal
    });

    await expect(
      expandSecret({ value: `\${dev.shared.SOURCE}`, secretPath: "/app", environment: "dev" })
    ).rejects.toBeInstanceOf(ClientClosedRequestError);
    expect(findBySecretPath).not.toHaveBeenCalled();
  });
});
