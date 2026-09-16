import { beforeEach, describe, expect, test, vi } from "vitest";

import { TDynamicSecrets } from "@app/db/schemas";
import { BadRequestError } from "@app/lib/errors";
import { ms } from "@app/lib/ms";
import { createSshKeyPair, SshCertKeyAlgorithm } from "@app/lib/ssh";

import { SshProvider } from "./ssh";

vi.mock("@app/lib/ssh", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@app/lib/ssh")>()),
  createSshKeyPair: vi.fn()
}));

const mockedCreateSshKeyPair = vi.mocked(createSshKeyPair);

const metadata = { projectId: "proj-1" };

const existingCa = {
  caPrivateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nstored-ca\n-----END OPENSSH PRIVATE KEY-----",
  caPublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 stored-ca"
};

const rsaCa = {
  caPrivateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nrsa-2048\n-----END OPENSSH PRIVATE KEY-----",
  caPublicKey: "ssh-rsa AAAAB3NzaC1yc2E stored-ca"
};

describe("SshProvider.validateProviderInputs", () => {
  beforeEach(() => {
    mockedCreateSshKeyPair.mockReset();
    mockedCreateSshKeyPair.mockResolvedValue({
      privateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nnew-ca\n-----END OPENSSH PRIVATE KEY-----",
      publicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 new-ca"
    });
  });

  test("generates a CA with the requested algorithm on first create", async () => {
    const provider = SshProvider();

    const result = await provider.validateProviderInputs(
      {
        principals: ["ubuntu"],
        keyAlgorithm: SshCertKeyAlgorithm.ED25519,
        caKeyAlgorithm: SshCertKeyAlgorithm.RSA_2048
      },
      metadata
    );

    expect(mockedCreateSshKeyPair).toHaveBeenCalledOnce();
    expect(mockedCreateSshKeyPair).toHaveBeenCalledWith(SshCertKeyAlgorithm.RSA_2048);
    expect(result).toMatchObject({
      caPrivateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nnew-ca\n-----END OPENSSH PRIVATE KEY-----",
      caPublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 new-ca",
      principals: ["ubuntu"],
      keyAlgorithm: SshCertKeyAlgorithm.ED25519,
      caKeyAlgorithm: SshCertKeyAlgorithm.RSA_2048
    });
  });

  test("reuses the stored CA when the algorithm is unchanged", async () => {
    const provider = SshProvider();

    const result = await provider.validateProviderInputs(
      {
        ...existingCa,
        principals: ["ubuntu"],
        keyAlgorithm: SshCertKeyAlgorithm.ED25519,
        caKeyAlgorithm: SshCertKeyAlgorithm.ED25519
      },
      metadata
    );

    expect(mockedCreateSshKeyPair).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      caPrivateKey: existingCa.caPrivateKey,
      caPublicKey: existingCa.caPublicKey,
      caKeyAlgorithm: SshCertKeyAlgorithm.ED25519
    });
  });

  test("regenerates the CA when the algorithm changes", async () => {
    const provider = SshProvider();

    const result = await provider.validateProviderInputs(
      {
        ...existingCa,
        principals: ["ubuntu"],
        keyAlgorithm: SshCertKeyAlgorithm.ED25519,
        caKeyAlgorithm: SshCertKeyAlgorithm.RSA_4096
      },
      { ...metadata, previousInputs: { ...existingCa, caKeyAlgorithm: SshCertKeyAlgorithm.ED25519 } }
    );

    expect(mockedCreateSshKeyPair).toHaveBeenCalledOnce();
    expect(mockedCreateSshKeyPair).toHaveBeenCalledWith(SshCertKeyAlgorithm.RSA_4096);
    expect(result).toMatchObject({
      caPrivateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nnew-ca\n-----END OPENSSH PRIVATE KEY-----",
      caPublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 new-ca",
      caKeyAlgorithm: SshCertKeyAlgorithm.RSA_4096
    });
  });

  test("treats a legacy stored secret without caKeyAlgorithm as ED25519 and does not regenerate", async () => {
    const provider = SshProvider();

    const result = await provider.validateProviderInputs(
      {
        ...existingCa,
        principals: ["ubuntu"],
        keyAlgorithm: SshCertKeyAlgorithm.ED25519
      },
      { ...metadata, previousInputs: existingCa }
    );

    expect(mockedCreateSshKeyPair).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      caPrivateKey: existingCa.caPrivateKey,
      caPublicKey: existingCa.caPublicKey,
      caKeyAlgorithm: SshCertKeyAlgorithm.ED25519
    });
  });

  test("regenerates the CA when the RSA key size changes", async () => {
    const provider = SshProvider();

    const result = await provider.validateProviderInputs(
      {
        ...rsaCa,
        principals: ["ubuntu"],
        keyAlgorithm: SshCertKeyAlgorithm.ED25519,
        caKeyAlgorithm: SshCertKeyAlgorithm.RSA_4096
      },
      { ...metadata, previousInputs: { ...rsaCa, caKeyAlgorithm: SshCertKeyAlgorithm.RSA_2048 } }
    );

    expect(mockedCreateSshKeyPair).toHaveBeenCalledOnce();
    expect(mockedCreateSshKeyPair).toHaveBeenCalledWith(SshCertKeyAlgorithm.RSA_4096);
    expect(result).toMatchObject({
      caPrivateKey: "-----BEGIN OPENSSH PRIVATE KEY-----\nnew-ca\n-----END OPENSSH PRIVATE KEY-----",
      caPublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5 new-ca",
      caKeyAlgorithm: SshCertKeyAlgorithm.RSA_4096
    });
  });

  test("reuses an RSA CA when the requested size matches the stored key", async () => {
    const provider = SshProvider();

    const result = await provider.validateProviderInputs(
      {
        ...rsaCa,
        principals: ["ubuntu"],
        keyAlgorithm: SshCertKeyAlgorithm.ED25519,
        caKeyAlgorithm: SshCertKeyAlgorithm.RSA_2048
      },
      { ...metadata, previousInputs: { ...rsaCa, caKeyAlgorithm: SshCertKeyAlgorithm.RSA_2048 } }
    );

    expect(mockedCreateSshKeyPair).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      caPrivateKey: rsaCa.caPrivateKey,
      caPublicKey: rsaCa.caPublicKey,
      caKeyAlgorithm: SshCertKeyAlgorithm.RSA_2048
    });
  });

  test("rejects a stored CA with an unsupported key type instead of regenerating", async () => {
    const provider = SshProvider();

    await expect(
      provider.validateProviderInputs(
        {
          ...existingCa,
          caPublicKey: "ssh-dss AAAA unsupported",
          principals: ["ubuntu"],
          keyAlgorithm: SshCertKeyAlgorithm.ED25519,
          caKeyAlgorithm: SshCertKeyAlgorithm.ED25519
        },
        metadata
      )
    ).rejects.toThrow(BadRequestError);
    expect(mockedCreateSshKeyPair).not.toHaveBeenCalled();
  });
});

describe("SshProvider.create", () => {
  test("rejects a lease TTL above 7 days", async () => {
    const provider = SshProvider();

    await expect(
      provider.create({
        inputs: {},
        expireAt: Date.now() + ms("7d") + 1000,
        identity: { name: "alice" },
        dynamicSecret: {} as TDynamicSecrets,
        metadata
      })
    ).rejects.toThrow("SSH lease TTL must be 7 days or less");
  });
});
