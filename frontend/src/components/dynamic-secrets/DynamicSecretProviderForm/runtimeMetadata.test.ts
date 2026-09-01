import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DynamicSecretProviders } from "@app/hooks/api/dynamicSecret/types";

import { getDynamicSecretProviderRuntimeMetadata } from "./runtimeMetadata";

describe("dynamic-secret provider runtime metadata", () => {
  it("defines presentation and lease behavior for every provider", () => {
    Object.values(DynamicSecretProviders).forEach((provider) => {
      const metadata = getDynamicSecretProviderRuntimeMetadata(provider);

      assert.ok(metadata.presentation.providerFamily);
      assert.ok(metadata.leaseCapabilities.provisioner);
      assert.ok(metadata.leaseCapabilities.output.type);

      if (metadata.leaseCapabilities.output.type === "fields") {
        assert.ok(metadata.leaseCapabilities.output.fields.length > 0);
        assert.equal(
          new Set(metadata.leaseCapabilities.output.fields.map(({ key }) => key)).size,
          metadata.leaseCapabilities.output.fields.length
        );
      }
    });
  });

  it("keeps special provisioning and renewal capabilities explicit", () => {
    assert.equal(
      getDynamicSecretProviderRuntimeMetadata(DynamicSecretProviders.Kubernetes).leaseCapabilities
        .provisioner,
      "kubernetes"
    );
    assert.equal(
      getDynamicSecretProviderRuntimeMetadata(DynamicSecretProviders.Ssh).leaseCapabilities
        .provisioner,
      "ssh"
    );
    assert.equal(
      getDynamicSecretProviderRuntimeMetadata(DynamicSecretProviders.Totp).leaseCapabilities
        .autoGenerate,
      true
    );
    assert.equal(
      getDynamicSecretProviderRuntimeMetadata(DynamicSecretProviders.Github).leaseCapabilities
        .fixedTtl,
      "1h"
    );

    [
      DynamicSecretProviders.Github,
      DynamicSecretProviders.Ssh,
      DynamicSecretProviders.Tailscale
    ].forEach((provider) => {
      assert.equal(
        getDynamicSecretProviderRuntimeMetadata(provider).leaseCapabilities.supportsRenewal,
        false
      );
    });
  });
});
