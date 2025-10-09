import { seedData1 } from "@app/db/seed-data";

describe("Certificate Profiles Router", () => {
  let projectId: string;
  let certificateAuthorityId: string;
  let templateId: string;
  let profileId: string;

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
        name: "Test Template for Profile",
        policy: {
          allowedDomains: ["example.com"],
          maxTtl: "8760h"
        }
      }
    });
    expect(templateRes.statusCode).toBe(200);
    const templatePayload = JSON.parse(templateRes.payload);
    templateId = templatePayload.certificateTemplate.id;
  });

  describe("POST /v1/certificate-profiles", () => {
    test("Should create a certificate profile", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v1/certificate-profiles",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          projectId,
          certificateAuthorityId,
          certificateTemplateId: templateId,
          name: "Test Profile",
          slug: "test-profile",
          description: "A test certificate profile",
          enrollmentMethod: "api",
          enrollmentConfig: {
            apiConfig: {
              autoRenew: true,
              autoRenewDays: 30
            }
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("certificateProfile");
      expect(payload.certificateProfile).toHaveProperty("id");
      expect(payload.certificateProfile.name).toBe("Test Profile");
      expect(payload.certificateProfile.slug).toBe("test-profile");
      expect(payload.certificateProfile.projectId).toBe(projectId);
      expect(payload.certificateProfile.certificateAuthorityId).toBe(certificateAuthorityId);
      expect(payload.certificateProfile.certificateTemplateId).toBe(templateId);

      profileId = payload.certificateProfile.id;
    });

    test("Should create profile with EST enrollment", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v1/certificate-profiles",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          projectId,
          certificateAuthorityId,
          certificateTemplateId: templateId,
          name: "EST Profile",
          slug: "est-profile",
          enrollmentMethod: "est",
          enrollmentConfig: {
            estConfig: {
              passphrase: "test-passphrase",
              disableBootstrapCaValidation: false,
              encryptedCaChain: "encrypted-ca-chain-data"
            }
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload.certificateProfile.enrollmentMethod).toBe("est");
    });

    test("Should fail to create profile with invalid project", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v1/certificate-profiles",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          projectId: "invalid-project-id",
          certificateAuthorityId,
          certificateTemplateId: templateId,
          name: "Invalid Profile",
          slug: "invalid-profile"
        }
      });

      expect(res.statusCode).toBe(400);
    });

    test("Should fail to create profile with duplicate slug", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v1/certificate-profiles",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          projectId,
          certificateAuthorityId,
          certificateTemplateId: templateId,
          name: "Duplicate Profile",
          slug: "test-profile" // Same slug as first profile
        }
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("GET /v1/certificate-profiles", () => {
    test("Should list certificate profiles", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/certificate-profiles?projectId=${projectId}`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("certificateProfiles");
      expect(payload).toHaveProperty("totalCount");
      expect(Array.isArray(payload.certificateProfiles)).toBe(true);
      expect(payload.totalCount).toBeGreaterThan(0);
    });

    test("Should support pagination and search", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/certificate-profiles?projectId=${projectId}&offset=0&limit=1&search=Test`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload.certificateProfiles.length).toBeLessThanOrEqual(1);
    });
  });

  describe("GET /v1/certificate-profiles/:id", () => {
    test("Should get certificate profile by ID with configs", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/certificate-profiles/${profileId}`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("certificateProfile");
      expect(payload.certificateProfile.id).toBe(profileId);
      expect(payload.certificateProfile.name).toBe("Test Profile");
      expect(payload.certificateProfile).toHaveProperty("certificateAuthority");
      expect(payload.certificateProfile).toHaveProperty("certificateTemplate");
      expect(payload.certificateProfile).toHaveProperty("apiConfig");
    });

    test("Should return 404 for non-existent profile", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: "/api/v1/certificate-profiles/non-existent-id",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("GET /v1/certificate-profiles/slug/:slug", () => {
    test("Should get certificate profile by slug", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/certificate-profiles/slug/test-profile?projectId=${projectId}`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("certificateProfile");
      expect(payload.certificateProfile.slug).toBe("test-profile");
    });

    test("Should return 404 for non-existent slug", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/certificate-profiles/slug/non-existent?projectId=${projectId}`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("PATCH /v1/certificate-profiles/:id", () => {
    test("Should update certificate profile", async () => {
      const res = await testServer.inject({
        method: "PATCH",
        url: `/api/v1/certificate-profiles/${profileId}`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          name: "Updated Test Profile",
          description: "Updated description",
          enrollmentConfig: {
            apiConfig: {
              autoRenew: false,
              autoRenewDays: 60
            }
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload.certificateProfile.name).toBe("Updated Test Profile");
      expect(payload.certificateProfile.description).toBe("Updated description");
    });
  });

  describe("GET /v1/certificate-profiles/:id/certificates", () => {
    test("Should list certificates for profile", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/certificate-profiles/${profileId}/certificates`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("certificates");
      expect(Array.isArray(payload.certificates)).toBe(true);
    });

    test("Should support filtering and pagination", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/certificate-profiles/${profileId}/certificates?status=active&offset=0&limit=10`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload.certificates.length).toBeLessThanOrEqual(10);
    });
  });

  describe("GET /v1/certificate-profiles/:id/metrics", () => {
    test("Should get profile metrics", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/certificate-profiles/${profileId}/metrics?expiringDays=30`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("metrics");
      expect(payload.metrics).toHaveProperty("profileId");
      expect(payload.metrics).toHaveProperty("totalCertificates");
      expect(payload.metrics).toHaveProperty("activeCertificates");
      expect(payload.metrics).toHaveProperty("expiredCertificates");
      expect(payload.metrics).toHaveProperty("expiringCertificates");
      expect(payload.metrics).toHaveProperty("revokedCertificates");
      expect(payload.metrics.profileId).toBe(profileId);
    });
  });

  describe("DELETE /v1/certificate-profiles/:id", () => {
    test("Should delete certificate profile", async () => {
      const res = await testServer.inject({
        method: "DELETE",
        url: `/api/v1/certificate-profiles/${profileId}`,
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("certificateProfile");
      expect(payload.certificateProfile.id).toBe(profileId);
    });

    test("Should return 404 when deleting non-existent profile", async () => {
      const res = await testServer.inject({
        method: "DELETE",
        url: `/api/v1/certificate-profiles/${profileId}`,
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
        url: `/api/v1/certificate-profiles?projectId=${projectId}`
      });

      expect(res.statusCode).toBe(401);
    });

    test("Should reject invalid token", async () => {
      const res = await testServer.inject({
        method: "GET",
        url: `/api/v1/certificate-profiles?projectId=${projectId}`,
        headers: {
          authorization: "Bearer invalid-token"
        }
      });

      expect(res.statusCode).toBe(401);
    });
  });
});
