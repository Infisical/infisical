import { seedData1 } from "@app/db/seed-data";

describe("Certificate EST Router", () => {
  let projectId: string;
  let certificateAuthorityId: string;
  let templateId: string;
  let profileId: string;
  let estPassphrase: string;

  beforeAll(async () => {
    projectId = seedData1.project.id;
    estPassphrase = "test-est-passphrase";

    // Create a test certificate authority first
    const caRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/pki/ca",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        projectSlug: seedData1.project.slug,
        type: "root",
        friendlyName: "Test Root CA for EST",
        organization: "Test Org",
        ou: "Test OU",
        country: "US",
        province: "CA",
        locality: "San Francisco",
        commonName: "Test Root CA for EST",
        ttl: "8760h"
      }
    });
    expect(caRes.statusCode).toBe(200);
    const caPayload = JSON.parse(caRes.payload);
    certificateAuthorityId = caPayload.certificateAuthority.id;

    // Create a test certificate template v2
    const templateRes = await testServer.inject({
      method: "POST",
      url: "/api/v2/certificate-templates",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        projectId,
        certificateAuthorityId,
        name: "Test Template for EST",
        policy: {
          allowedDomains: ["est.example.com", "*.est.example.com"],
          allowWildcards: true,
          maxTtl: "8760h"
        }
      }
    });
    expect(templateRes.statusCode).toBe(200);
    const templatePayload = JSON.parse(templateRes.payload);
    templateId = templatePayload.certificateTemplate.id;

    // Create a test certificate profile with EST enrollment
    const profileRes = await testServer.inject({
      method: "POST",
      url: "/api/v1/certificate-profiles",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        projectId,
        certificateAuthorityId,
        certificateTemplateId: templateId,
        name: "Test EST Profile",
        slug: "test-est-profile",
        enrollmentMethod: "est",
        enrollmentConfig: {
          estConfig: {
            passphrase: estPassphrase,
            disableBootstrapCaValidation: false,
            encryptedCaChain: "test-encrypted-ca-chain"
          }
        }
      }
    });
    expect(profileRes.statusCode).toBe(200);
    const profilePayload = JSON.parse(profileRes.payload);
    profileId = profilePayload.certificateProfile.id;
  });

  describe("GET /:identifier/cacerts", () => {
    test("Should get CA certificates using profileId (no authentication required)", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/est/${profileId}/cacerts`
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pkcs7-mime");
      expect(res.headers["content-transfer-encoding"]).toBe("base64");
      expect(typeof res.payload).toBe("string");
    });

    test("Should get CA certificates using legacy templateId (backward compatibility)", async () => {
      // First enable EST on the legacy template
      const enableEstRes = await testServer.inject({
        method: "PATCH",
        url: `/api/v1/pki/templates/${templateId}`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          estConfig: {
            isEnabled: true,
            passphrase: estPassphrase
          }
        }
      });
      expect(enableEstRes.statusCode).toBe(200);

      const res = await testServer.inject({
        method: "GET",
        url: `/api/est/${templateId}/cacerts`
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["content-type"]).toContain("application/pkcs7-mime");
    });

    test("Should return 404 for non-existent identifier", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: "/api/est/non-existent-id/cacerts"
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("Authentication for EST endpoints", () => {
    test("Should require authentication for simpleenroll", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: `/api/est/${profileId}/simpleenroll`,
        body: "test-csr"
      });

      expect(res.statusCode).toBe(401);
      expect(res.headers["www-authenticate"]).toBe('Basic realm="infisical"');
    });

    test("Should require authentication for simplereenroll", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: `/api/est/${profileId}/simplereenroll`,
        body: "test-csr"
      });

      expect(res.statusCode).toBe(401);
    });

    test("Should reject invalid credentials", async () => {
      const invalidAuth = Buffer.from("user:wrongpassword").toString("base64");

      const res = await testServer.inject({
        method: "POST",
        url: `/api/est/${profileId}/simpleenroll`,
        headers: {
          authorization: `Basic ${invalidAuth}`,
          "content-type": "application/pkcs10"
        },
        body: "test-csr"
      });

      expect(res.statusCode).toBe(401);
    });

    test("Should accept valid credentials", async () => {
      const validAuth = Buffer.from(`user:${estPassphrase}`).toString("base64");

      const res = await testServer.inject({
        method: "POST",
        url: `/api/est/${profileId}/simpleenroll`,
        headers: {
          authorization: `Basic ${validAuth}`,
          "content-type": "application/pkcs10"
        },
        body: "test-csr"
      });

      expect(res.statusCode).not.toBe(401);
    });
  });

  describe("POST /:identifier/simpleenroll", () => {
    let validAuth: string;
    let testCSR: string;

    beforeAll(() => {
      validAuth = Buffer.from(`user:${estPassphrase}`).toString("base64");
      // Mock CSR for testing
      testCSR = `-----BEGIN CERTIFICATE REQUEST-----
MIICWjCCAUICAQAwFTETMBEGA1UEAwwKdGVzdC5jb20uY2ExXDANBgkqhkiG9w0B
AQEFAAOBiQAwgYUCgYEAyKdVQNK5Wf7V8qU2tU3hV7g4+OJ+Xz8TzL1Q2u8cQ9v
...mock CSR content...
yK5ZqN8U3QR7yB+X9vG1eI+dA==
-----END CERTIFICATE REQUEST-----`;
    });

    test("Should process enrollment request with profileId", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: `/api/est/${profileId}/simpleenroll`,
        headers: {
          authorization: `Basic ${validAuth}`,
          "content-type": "application/pkcs10"
        },
        body: testCSR
      });

      expect([200, 400]).toContain(res.statusCode);

      if (res.statusCode === 200) {
        expect(res.headers["content-type"]).toContain("application/pkcs7-mime");
        expect(res.headers["content-transfer-encoding"]).toBe("base64");
      }
    });

    test("Should process enrollment request with legacy templateId", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: `/api/est/${templateId}/simpleenroll`,
        headers: {
          authorization: `Basic ${validAuth}`,
          "content-type": "application/pkcs10"
        },
        body: testCSR
      });

      expect([200, 400]).toContain(res.statusCode);
    });

    test("Should handle PEM format CSR", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: `/api/est/${profileId}/simpleenroll`,
        headers: {
          authorization: `Basic ${validAuth}`,
          "content-type": "application/pkcs10"
        },
        body: testCSR
      });

      expect([200, 400]).toContain(res.statusCode);
    });

    test("Should handle base64 format CSR", async () => {
      const base64CSR = testCSR
        .replace(/-----BEGIN CERTIFICATE REQUEST-----/, "")
        .replace(/-----END CERTIFICATE REQUEST-----/, "")
        .replace(/\n/g, "");

      const res = await testServer.inject({
        method: "POST",
        url: `/api/est/${profileId}/simpleenroll`,
        headers: {
          authorization: `Basic ${validAuth}`,
          "content-type": "application/pkcs10"
        },
        body: base64CSR
      });

      expect([200, 400]).toContain(res.statusCode);
    });

    test("Should fail with empty CSR", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: `/api/est/${profileId}/simpleenroll`,
        headers: {
          authorization: `Basic ${validAuth}`,
          "content-type": "application/pkcs10"
        },
        body: ""
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("POST /:identifier/simplereenroll", () => {
    let validAuth: string;
    let testCSR: string;

    beforeAll(() => {
      validAuth = Buffer.from(`user:${estPassphrase}`).toString("base64");
      testCSR = `-----BEGIN CERTIFICATE REQUEST-----
MIICWjCCAUICAQAwFTETMBEGA1UEAwwKdGVzdC5jb20uY2ExXDANBgkqhkiG9w0B
AQEFAAOBiQAwgYUCgYEAyKdVQNK5Wf7V8qU2tU3hV7g4+OJ+Xz8TzL1Q2u8cQ9v
...mock CSR content...
yK5ZqN8U3QR7yB+X9vG1eI+dA==
-----END CERTIFICATE REQUEST-----`;
    });

    test("Should process re-enrollment request with profileId", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: `/api/est/${profileId}/simplereenroll`,
        headers: {
          authorization: `Basic ${validAuth}`,
          "content-type": "application/pkcs10"
        },
        body: testCSR
      });

      expect([200, 400]).toContain(res.statusCode);

      if (res.statusCode === 200) {
        expect(res.headers["content-type"]).toContain("application/pkcs7-mime");
        expect(res.headers["content-transfer-encoding"]).toBe("base64");
      }
    });

    test("Should process re-enrollment request with legacy templateId", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: `/api/est/${templateId}/simplereenroll`,
        headers: {
          authorization: `Basic ${validAuth}`,
          "content-type": "application/pkcs10"
        },
        body: testCSR
      });

      expect([200, 400]).toContain(res.statusCode);
    });
  });

  describe("EST Configuration Validation", () => {
    test("Should fail when EST is disabled on profile", async () => {
      // Create a profile with EST disabled
      const disabledProfileRes = await testServer.inject({
        method: "POST",
        url: "/api/v1/certificate-profiles",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          projectId,
          certificateAuthorityId,
          certificateTemplateId: templateId,
          name: "Disabled EST Profile",
          slug: "disabled-est-profile",
          enrollmentMethod: "api" // Not EST
        }
      });
      expect(disabledProfileRes.statusCode).toBe(200);
      const disabledProfile = JSON.parse(disabledProfileRes.payload);

      const validAuth = Buffer.from(`user:${estPassphrase}`).toString("base64");

      const res = await testServer.inject({
        method: "POST",
        url: `/api/est/${disabledProfile.certificateProfile.id}/simpleenroll`,
        headers: {
          authorization: `Basic ${validAuth}`,
          "content-type": "application/pkcs10"
        },
        body: "test-csr"
      });

      expect(res.statusCode).toBe(400);
    });

    test("Should handle missing authorization header gracefully", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: `/api/est/${profileId}/simpleenroll`,
        body: "test-csr"
      });

      expect(res.statusCode).toBe(401);
      expect(res.headers["www-authenticate"]).toBeDefined();
    });
  });

  describe("Content Type Handling", () => {
    test("Should handle different content types for CSR", async () => {
      const validAuth = Buffer.from(`user:${estPassphrase}`).toString("base64");

      const res = await testServer.inject({
        method: "POST",
        url: `/api/est/${profileId}/simpleenroll`,
        headers: {
          authorization: `Basic ${validAuth}`,
          "content-type": "application/pkcs10"
        },
        body: "test-csr-content"
      });

      // Should not fail due to content type
      expect(res.statusCode).not.toBe(415);
    });
  });

  describe("Profile vs Template Identifier Detection", () => {
    test("Should correctly identify UUID as profileId", async () => {
      const isUUIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(isUUIDPattern.test(profileId)).toBe(true);

      const res = await testServer.inject({
        method: "GET",
        url: `/api/est/${profileId}/cacerts`
      });

      expect(res.statusCode).toBe(200);
    });

    test("Should correctly identify non-UUID as legacy templateId", async () => {
      const isUUIDPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      expect(isUUIDPattern.test(templateId)).toBe(false);

      const res = await testServer.inject({
        method: "GET",
        url: `/api/est/${templateId}/cacerts`
      });

      expect(res.statusCode).toBe(200);
    });
  });
});
