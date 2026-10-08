import { describe, expect, test, vi } from "vitest";

import { INFISICAL_SECRET_VALUE_HIDDEN_MASK } from "@app/services/secret/secret-fns";

import { ProjectPermissionSecretActions } from "../permission/project-permission";
import {
  buildSecretApprovalCommitValueAccess,
  formatSecretApprovalCommitsV2Bridge
} from "./secret-approval-request-details-fns";
import { TSecretApprovalBridgeCommit } from "./secret-approval-request-merge-fns";

const decryptor = vi.fn(({ cipherTextBlob }: { cipherTextBlob: Buffer }) =>
  Buffer.from(`plain:${cipherTextBlob.toString()}`)
);

const commit = (overrides: Partial<TSecretApprovalBridgeCommit> = {}) =>
  ({
    id: "commit-1",
    op: "update",
    key: "KEY",
    version: 2,
    encryptedValue: Buffer.from("new"),
    encryptedComment: Buffer.from("comment"),
    skipMultilineEncoding: true,
    secretMetadata: [
      { key: "plain", value: "visible" },
      { key: "hidden", encryptedValue: Buffer.from("meta").toString("base64") }
    ],
    tags: [{ id: "tag-1", name: "t", slug: "t", color: "red" }],
    secret: {
      id: "secret-1",
      version: 1,
      key: "KEY",
      encryptedValue: Buffer.from("live"),
      encryptedComment: null,
      isRotatedSecret: false,
      rotationId: null
    },
    secretVersion: {
      id: "version-1",
      version: 1,
      key: "KEY",
      encryptedValue: Buffer.from("old"),
      encryptedComment: Buffer.from("old comment"),
      skipMultilineEncoding: false,
      tags: []
    },
    oldSecretMetadata: [{ id: "meta-1", key: "old", value: null, encryptedValue: Buffer.from("old meta") }],
    ...overrides
  }) as unknown as TSecretApprovalBridgeCommit;

describe("formatSecretApprovalCommitsV2Bridge", () => {
  test("decrypts the commit, the live secret and the reviewed version when the value is readable", () => {
    const [formatted] = formatSecretApprovalCommitsV2Bridge({
      commits: [commit()],
      decryptor,
      canReadSecretValue: () => true
    });

    expect(formatted).toMatchObject({
      id: "commit-1",
      secretKey: "KEY",
      version: 2,
      secretValueHidden: false,
      secretValue: "plain:new",
      secretComment: "plain:comment",
      skipMultilineEncoding: true,
      isRotatedSecret: false,
      secretMetadata: [
        { key: "plain", isEncrypted: false, value: "visible" },
        { key: "hidden", isEncrypted: true, value: "plain:meta" }
      ],
      secret: {
        id: "secret-1",
        secretKey: "KEY",
        secretValueHidden: false,
        secretValue: "plain:live",
        secretComment: ""
      },
      secretVersion: {
        id: "version-1",
        secretKey: "KEY",
        secretValueHidden: false,
        secretValue: "plain:old",
        secretComment: "plain:old comment",
        skipMultilineEncoding: false,
        secretMetadata: [{ key: "old", isEncrypted: true, value: "plain:old meta" }]
      }
    });
  });

  test("masks every value when the caller cannot read it and still decrypts the comment", () => {
    const canReadSecretValue = vi.fn().mockReturnValue(false);
    const [formatted] = formatSecretApprovalCommitsV2Bridge({ commits: [commit()], decryptor, canReadSecretValue });

    expect(canReadSecretValue).toHaveBeenCalledTimes(1);
    expect(canReadSecretValue).toHaveBeenCalledWith([{ id: "tag-1", name: "t", slug: "t", color: "red" }]);
    expect(formatted).toMatchObject({
      secretValueHidden: true,
      secretValue: INFISICAL_SECRET_VALUE_HIDDEN_MASK,
      secretComment: "plain:comment",
      secret: { secretValueHidden: true, secretValue: INFISICAL_SECRET_VALUE_HIDDEN_MASK },
      secretVersion: { secretValueHidden: true, secretValue: INFISICAL_SECRET_VALUE_HIDDEN_MASK }
    });
  });

  test("leaves a rotated secret's value out and tolerates a commit without relations", () => {
    const [rotated, bare] = formatSecretApprovalCommitsV2Bridge({
      commits: [
        commit({ secret: { ...commit().secret, isRotatedSecret: true } }),
        commit({
          id: "commit-2",
          encryptedValue: null,
          encryptedComment: null,
          skipMultilineEncoding: null,
          secretMetadata: null,
          secret: undefined,
          secretVersion: undefined,
          oldSecretMetadata: []
        })
      ],
      decryptor,
      canReadSecretValue: () => true
    });

    expect(rotated).toMatchObject({ isRotatedSecret: true, secretValue: undefined, secretValueHidden: false });
    expect(bare).toMatchObject({
      id: "commit-2",
      secretValue: undefined,
      secretComment: undefined,
      skipMultilineEncoding: undefined,
      secretMetadata: [],
      secret: undefined,
      secretVersion: undefined
    });
  });
});

describe("buildSecretApprovalCommitValueAccess", () => {
  test("grants a reviewer access while the request is open without consulting the permission", () => {
    const permission = { can: vi.fn().mockReturnValue(false) };
    const canRead = buildSecretApprovalCommitValueAccess({
      permission: permission as never,
      isReviewer: true,
      isRequestOpen: true,
      environment: "dev",
      secretPath: "/app"
    });
    expect(canRead([{ slug: "t" }])).toBe(true);
    expect(permission.can).not.toHaveBeenCalled();
  });

  test("otherwise asks the permission about the environment, path and tags", () => {
    const permission = { can: vi.fn().mockReturnValue(true) };
    const canRead = buildSecretApprovalCommitValueAccess({
      permission: permission as never,
      isReviewer: true,
      isRequestOpen: false,
      environment: "dev",
      secretPath: null
    });
    expect(canRead([{ slug: "t" }])).toBe(true);
    expect(permission.can).toHaveBeenCalledWith(
      ProjectPermissionSecretActions.ReadValue,
      expect.objectContaining({ environment: "dev", secretPath: "/", secretTags: ["t"] })
    );
  });
});
