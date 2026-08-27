import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { getDynamicSecretProviderRuntimeMetadata } from "./runtimeMetadata";

describe("dynamic-secret provider runtime metadata", () => {
  it("defines presentation and lease behavior for every provider", () => {
    Object.values(DynamicSecretProviders).forEach((provider) => {
      const metadata = getDynamicSecretProviderRuntimeMetadata(provider);

      assert.ok(metadata.presentation.brand);
      assert.ok(metadata.lease.provisioner);
      assert.ok(metadata.lease.output.type);

      if (metadata.lease.output.type === "fields") {
        assert.ok(metadata.lease.output.fields.length > 0);
        assert.equal(
          new Set(metadata.lease.output.fields.map(({ key }) => key)).size,
          metadata.lease.output.fields.length
        );
      }
    });
  });

  it("keeps special provisioning and renewal capabilities explicit", () => {
    assert.equal(
      getDynamicSecretProviderRuntimeMetadata(DynamicSecretProviders.Kubernetes).lease.provisioner,
      "kubernetes"
    );
    assert.equal(
      getDynamicSecretProviderRuntimeMetadata(DynamicSecretProviders.Ssh).lease.provisioner,
      "ssh"
    );
    assert.equal(
      getDynamicSecretProviderRuntimeMetadata(DynamicSecretProviders.Totp).lease.autoGenerate,
      true
    );
    assert.equal(
      getDynamicSecretProviderRuntimeMetadata(DynamicSecretProviders.Github).lease.fixedTtl,
      "1h"
    );

    [
      DynamicSecretProviders.Github,
      DynamicSecretProviders.Ssh,
      DynamicSecretProviders.Tailscale
    ].forEach((provider) => {
      assert.equal(getDynamicSecretProviderRuntimeMetadata(provider).lease.supportsRenewal, false);
    });
  });
});
