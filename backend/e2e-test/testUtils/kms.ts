import { ProjectType } from "@app/db/schemas";

export const KEY_AGREEMENT_ALGORITHM = "ECC_NIST_P256";
// ECDH over the P-256 curve yields a 32-byte shared secret (the field size of the curve).
export const P256_SHARED_SECRET_BYTE_LENGTH = 32;

// CMEK/KMS operations are gated on the project's product type (ActionProjectType.KMS), so they
// need a project actually provisioned as type "kms" — the default seeded project is a
// secret-manager project and is rejected with "Operations of type kms are not allowed."
export const createKmsProject = async (slug: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      projectName: slug,
      slug,
      type: ProjectType.KMS
    }
  });

  expect(res.statusCode).toBe(200);
  return res.json().project.id;
};

export const deleteProject = async (projectId: string) => {
  await testServer.inject({
    method: "DELETE",
    url: `/api/v1/projects/${projectId}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
};

export const createKeyAgreementKey = async (name: string, projectId: string) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/kms/keys",
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: {
      projectId,
      name,
      keyUsage: "key-agreement",
      algorithm: KEY_AGREEMENT_ALGORITHM
    }
  });

  return res;
};

export const deleteCmekKey = async (keyId: string) => {
  await testServer.inject({
    method: "DELETE",
    url: `/api/v1/kms/keys/${keyId}`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
};

export const getCmekPublicKey = async (keyId: string) => {
  const res = await testServer.inject({
    method: "GET",
    url: `/api/v1/kms/keys/${keyId}/public-key`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    }
  });
  return res.json();
};

export const deriveSharedSecret = async (keyId: string, publicKey: string) => {
  return testServer.inject({
    method: "POST",
    url: `/api/v1/kms/keys/${keyId}/derive-shared-secret`,
    headers: {
      authorization: `Bearer ${jwtAuthToken}`
    },
    body: { publicKey }
  });
};
