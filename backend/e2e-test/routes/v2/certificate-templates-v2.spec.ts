import { seedData1 } from "@app/db/seed-data";

describe("Certificate Templates V2 Router", () => {
  let projectId: string;
  let certificateAuthorityId: string;
  let templateId: string;

  beforeAll(async () => {
    projectId = seedData1.project.id;

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
        friendlyName: "Test Root CA",
        organization: "Test Org",
        ou: "Test OU",
        country: "US",
        province: "CA",
        locality: "San Francisco",
        commonName: "Test Root CA",
        ttl: "8760h"
      }
    });
    expect(caRes.statusCode).toBe(200);
    const caPayload = JSON.parse(caRes.payload);
    certificateAuthorityId = caPayload.certificateAuthority.id;
  });

  describe("POST /v2/certificate-templates", () => {
    test("Should create a certificate template v2", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v2/certificate-templates",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          projectId,
          certificateAuthorityId,
          name: "Test Template V2",
          description: "A test certificate template v2",
          policy: {
            allowedDomains: ["example.com", "*.example.com"],
            allowWildcards: true,
            allowAnyName: false,
            allowIpSans: false,
            allowSubdomains: true,
            maxTtl: "8760h",
            keyUsages: ["digital_signature", "key_agreement"],
            extendedKeyUsages: ["server_auth", "client_auth"],
            organizationPolicy: {
              allowedOrganizations: ["Test Org"],
              enforceOrganization: true
            },
            subjectPolicy: {
              allowedCountries: ["US", "CA"],
              allowedProvinces: ["CA", "NY"],
              allowedLocalities: ["San Francisco", "New York"],
              enforceSubject: false
            }
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("certificateTemplate");
      expect(payload.certificateTemplate).toHaveProperty("id");
      expect(payload.certificateTemplate.name).toBe("Test Template V2");
      expect(payload.certificateTemplate.projectId).toBe(projectId);
      expect(payload.certificateTemplate.certificateAuthorityId).toBe(certificateAuthorityId);

      templateId = payload.certificateTemplate.id;
    });

    test("Should fail to create template with invalid project", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v2/certificate-templates",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          projectId: "invalid-project-id",
          certificateAuthorityId,
          name: "Invalid Template",
          policy: {}
        }
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /v2/certificate-templates", () => {
    test("Should list certificate templates v2", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v2/certificate-templates?projectId=${projectId}`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("certificateTemplates");
      expect(payload).toHaveProperty("totalCount");
      expect(Array.isArray(payload.certificateTemplates)).toBe(true);
      expect(payload.totalCount).toBeGreaterThan(0);
    });

    test("Should support pagination", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v2/certificate-templates?projectId=${projectId}&offset=0&limit=1`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload.certificateTemplates.length).toBeLessThanOrEqual(1);
    });
  });

  describe("GET /v2/certificate-templates/:id", () => {
    test("Should get certificate template v2 by ID", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v2/certificate-templates/${templateId}`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("certificateTemplate");
      expect(payload.certificateTemplate.id).toBe(templateId);
      expect(payload.certificateTemplate.name).toBe("Test Template V2");
    });

    test("Should return 404 for non-existent template", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: "/api/v2/certificate-templates/non-existent-id",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("PATCH /v2/certificate-templates/:id", () => {
    test("Should update certificate template v2", async () => {
      const res = await testServer.inject({
        method: "PATCH",
        url: `/api/v2/certificate-templates/${templateId}`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          name: "Updated Test Template V2",
          description: "Updated description",
          policy: {
            allowedDomains: ["updated.com"],
            allowWildcards: false,
            maxTtl: "4380h"
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload.certificateTemplate.name).toBe("Updated Test Template V2");
      expect(payload.certificateTemplate.description).toBe("Updated description");
    });
  });

  describe("POST /v2/certificate-templates/:id/validate", () => {
    test("Should validate certificate request against template policy", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: `/api/v2/certificate-templates/${templateId}/validate`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          request: {
            commonName: "test.updated.com",
            ttl: "24h",
            keyUsages: ["digital_signature"],
            extendedKeyUsages: ["server_auth"]
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("valid");
      expect(typeof payload.valid).toBe("boolean");
      if (!payload.valid) {
        expect(payload).toHaveProperty("errors");
        expect(Array.isArray(payload.errors)).toBe(true);
      }
    });

    test("Should reject invalid certificate request", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: `/api/v2/certificate-templates/${templateId}/validate`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          request: {
            commonName: "invalid.domain.com", // Not in allowed domains
            ttl: "24h"
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload.valid).toBe(false);
      expect(payload.errors).toBeDefined();
    });
  });

  describe("DELETE /v2/certificate-templates/:id", () => {
    test("Should delete certificate template v2", async () => {
      const res = await testServer.inject({
        method: "DELETE",
        url: `/api/v2/certificate-templates/${templateId}`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("certificateTemplate");
      expect(payload.certificateTemplate.id).toBe(templateId);
    });

    test("Should return 404 when deleting non-existent template", async () => {
      const res = await testServer.inject({
        method: "DELETE",
        url: `/api/v2/certificate-templates/${templateId}`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("Authentication", () => {
    test("Should require authentication", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v2/certificate-templates?projectId=${projectId}`
      });

      expect(res.statusCode).toBe(401);
    });

    test("Should reject invalid token", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v2/certificate-templates?projectId=${projectId}`,
        headers: {
          authorization: "Bearer invalid-token"
        }
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
