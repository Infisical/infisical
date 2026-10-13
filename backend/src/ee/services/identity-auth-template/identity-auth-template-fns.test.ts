import { describe, expect, it, vi } from "vitest";

import { ConflictError, NotFoundError } from "@app/lib/errors";

import { assertTemplateUnchangedForLink } from "./identity-auth-template-fns";

const UPDATED_AT = new Date("2026-10-01T00:00:00Z");
const template = { id: "template-id", name: "auth-template", updatedAt: UPDATED_AT };
const tx = { marker: "tx" };

describe("assertTemplateUnchangedForLink", () => {
  it("locks the row through the caller's transaction and passes when the template is unchanged", async () => {
    const findByIdForShare = vi.fn().mockResolvedValue({ ...template, updatedAt: new Date(UPDATED_AT) });

    await expect(assertTemplateUnchangedForLink({ findByIdForShare }, template, tx as never)).resolves.toBeUndefined();

    expect(findByIdForShare).toHaveBeenCalledWith(template.id, tx);
  });

  it("rejects with a conflict when the template was edited since it was read", async () => {
    const findByIdForShare = vi.fn().mockResolvedValue({ ...template, updatedAt: new Date("2026-10-01T00:00:01Z") });

    const error = await assertTemplateUnchangedForLink({ findByIdForShare }, template, tx as never).catch(
      (err: unknown) => err
    );

    expect(error).toBeInstanceOf(ConflictError);
    expect((error as ConflictError).message).toContain("'auth-template' was modified");
  });

  it("rejects as not found when the template was deleted since it was read", async () => {
    const findByIdForShare = vi.fn().mockResolvedValue(undefined);

    await expect(assertTemplateUnchangedForLink({ findByIdForShare }, template, tx as never)).rejects.toBeInstanceOf(
      NotFoundError
    );
  });
});
