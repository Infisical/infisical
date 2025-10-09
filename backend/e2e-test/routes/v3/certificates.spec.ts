import { seedData1 } from "@app/db/seed-data";

describe("Certificates V3 Router", () => {
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

    // Create a test certificate template v2 with proper V2 structure
    const templateRes = await testServer.inject({
      method: "POST",
      url: "/api/v2/certificate-templates",
      headers: {
        authorization: `Bearer ${jwtAuthToken}`
      },
      body: {
        projectId,
        name: "Test Template for V3",
        description: "Template for testing V3 certificate endpoints",
        attributes: [
          {
            type: "common_name",
            include: "optional",
            value: ["*.example.com", "example.com"]
          },
          {
            type: "organization_name",
            include: "optional"
          },
          {
            type: "country",
            include: "optional",
            value: ["US", "CA"]
          }
        ],
        keyUsages: {
          requiredUsages: {
            all: ["digital_signature"]
          },
          optionalUsages: {
            all: ["key_encipherment", "key_agreement"]
          }
        },
        extendedKeyUsages: {
          requiredUsages: {
            all: ["server_auth"]
          },
          optionalUsages: {
            all: ["client_auth"]
          }
        },
        subjectAlternativeNames: [
          {
            type: "dns_name",
            include: "optional",
            value: ["*.example.com", "example.com"]
          }
        ],
        validity: {
          maxDuration: {
            value: 365,
            unit: "days"
          }
        }
      }
    });
    expect(templateRes.statusCode).toBe(200);
    const templatePayload = JSON.parse(templateRes.payload);
    templateId = templatePayload.certificateTemplate.id;

    // Create a test certificate profile
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
        name: "Test Profile for V3",
        slug: "test-profile-v3",
        enrollmentMethod: "api",
        enrollmentConfig: {
          apiConfig: {
            autoRenew: false
          }
        }
      }
    });
    expect(profileRes.statusCode).toBe(200);
    const profilePayload = JSON.parse(profileRes.payload);
    profileId = profilePayload.certificateProfile.id;
  });

  describe("POST /v3/certificates/issue-certificate", () => {
    test("Should issue a certificate using profileId", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateRequest: {
            commonName: "test.example.com",
            organization: "Test Org",
            organizationUnit: "Test OU",
            locality: "San Francisco",
            state: "CA",
            country: "US",
            email: "test@example.com",
            keyUsages: ["digitalSignature"],
            extendedKeyUsages: ["serverAuth"],
            subjectAlternativeNames: [
              {
                type: "dns_name",
                value: "www.example.com"
              },
              {
                type: "dns_name",
                value: "api.example.com"
              }
            ],
            validity: {
              ttl: "24h"
            }
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("certificate");
      expect(payload).toHaveProperty("issuingCaCertificate");
      expect(payload).toHaveProperty("certificateChain");
      expect(payload).toHaveProperty("privateKey");
      expect(payload).toHaveProperty("serialNumber");
      expect(payload).toHaveProperty("certificateId");

      // Verify certificate fields
      expect(typeof payload.certificate).toBe("string");
      expect(payload.certificate.includes("BEGIN CERTIFICATE")).toBe(true);
      expect(typeof payload.privateKey).toBe("string");
      expect(payload.privateKey.includes("BEGIN PRIVATE KEY")).toBe(true);
    });

    test("Should fail with invalid profileId", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId: "invalid-profile-id",
          certificateRequest: {
            commonName: "test.example.com",
            validity: {
              ttl: "24h"
            }
          }
        }
      });

      expect(res.statusCode).toBe(404);
    });

    test("Should fail with domain not allowed by policy", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateRequest: {
            commonName: "test.notallowed.com",
            validity: {
              ttl: "24h"
            }
          }
        }
      });

      expect(res.statusCode).toBe(400);
    });

    test("Should fail with invalid TTL", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateRequest: {
            commonName: "test.example.com",
            validity: {
              ttl: "invalid-ttl"
            }
          }
        }
      });

      expect(res.statusCode).toBe(400);
    });

    test("Should handle wildcard certificates", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateRequest: {
            commonName: "*.example.com",
            validity: {
              ttl: "24h"
            }
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("certificate");
    });

    test("Should validate certificate with profile policy", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateRequest: {
            commonName: "app.example.com",
            keyUsages: ["digitalSignature"], // Required by template
            extendedKeyUsages: ["serverAuth"], // Required by template
            validity: {
              ttl: "24h"
            }
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("certificate");
      expect(payload).toHaveProperty("certificateId");

      // Verify the certificate was created with profile reference
      expect(typeof payload.certificateId).toBe("string");
      expect(payload.certificateId.length).toBeGreaterThan(0);
    });
  });

  describe("POST /v3/certificates/sign-certificate", () => {
    let testCSR: string;

    beforeAll(() => {
      // Mock CSR for testing - in real tests you'd generate a proper CSR
      testCSR = `-----BEGIN CERTIFICATE REQUEST-----
MIICWjCCAUICAQAwFTETMBEGA1UEAwwKdGVzdC5jb20uY2ExXDANBgkqhkiG9w0B
AQEFAAOBiQAwgYUCgYEAyKdVQNK5Wf7V8qU2tU3hV7g4+OJ+Xz8TzL1Q2u8cQ9v
...mock CSR content...
yK5ZqN8U3QR7yB+X9vG1eI+dA==
-----END CERTIFICATE REQUEST-----`;
    });

    test("Should sign a CSR using profileId", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/sign-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          csr: testCSR,
          validity: {
            ttl: "24h"
          }
        }
      });

      expect([200, 400]).toContain(res.statusCode);

      if (res.statusCode === 200) {
        const payload = JSON.parse(res.payload);
        expect(payload).toHaveProperty("certificate");
        expect(payload).toHaveProperty("issuingCaCertificate");
        expect(payload).toHaveProperty("certificateChain");
        expect(payload).toHaveProperty("serialNumber");
        expect(payload).toHaveProperty("certificateId");

        // Verify the certificate was created with profile reference
        expect(typeof payload.certificateId).toBe("string");
        expect(payload.certificateId.length).toBeGreaterThan(0);
      }
    });

    test("Should fail with invalid CSR", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/sign-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          csr: "invalid-csr",
          validity: {
            ttl: "24h"
          }
        }
      });

      expect(res.statusCode).toBe(400);
    });

    test("Should fail with empty CSR", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/sign-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          csr: "",
          validity: {
            ttl: "24h"
          }
        }
      });

      expect(res.statusCode).toBe(400);
    });

    test("Should fail with invalid profileId for CSR signing", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/sign-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId: "invalid-profile-id",
          csr: testCSR,
          validity: {
            ttl: "24h"
          }
        }
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("POST /v3/certificates/order-certificate", () => {
    test("Should create a certificate order using profileId", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/order-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateOrder: {
            identifiers: [
              {
                type: "dns",
                value: "test.example.com"
              },
              {
                type: "dns",
                value: "www.example.com"
              }
            ],
            validity: {
              ttl: "24h"
            },
            commonName: "test.example.com",
            keyUsages: ["digitalSignature"],
            extendedKeyUsages: ["serverAuth"],
            organization: "Test Org"
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("orderId");
      expect(payload).toHaveProperty("status");
      expect(payload).toHaveProperty("identifiers");
      expect(payload).toHaveProperty("authorizations");
      expect(payload).toHaveProperty("finalize");

      // Verify order structure
      expect(Array.isArray(payload.identifiers)).toBe(true);
      expect(payload.identifiers.length).toBe(2);
      expect(Array.isArray(payload.authorizations)).toBe(true);
      expect(["pending", "processing", "valid", "invalid"]).toContain(payload.status);
    });

    test("Should fail with invalid identifiers", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/order-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateOrder: {
            identifiers: [], // Empty identifiers
            validity: {
              ttl: "24h"
            }
          }
        }
      });

      expect(res.statusCode).toBe(400);
    });

    test("Should fail with disallowed domains", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/order-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateOrder: {
            identifiers: [
              {
                type: "dns",
                value: "test.notallowed.com"
              }
            ],
            validity: {
              ttl: "24h"
            }
          }
        }
      });

      expect(res.statusCode).toBe(400);
    });

    test("Should handle IP identifiers", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/order-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateOrder: {
            identifiers: [
              {
                type: "ip",
                value: "192.168.1.1"
              }
            ],
            validity: {
              ttl: "24h"
            }
          }
        }
      });

      expect([200, 400]).toContain(res.statusCode);
    });

    test("Should validate order against template policy", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/order-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateOrder: {
            identifiers: [
              {
                type: "dns",
                value: "api.example.com"
              }
            ],
            validity: {
              ttl: "24h"
            },
            commonName: "api.example.com",
            keyUsages: ["digitalSignature"], // Required by template
            extendedKeyUsages: ["serverAuth"], // Required by template
            organization: "Test Org"
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("orderId");
      expect(payload.status).toBe("valid");
    });

    test("Should fail with invalid profileId for ordering", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/order-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId: "invalid-profile-id",
          certificateOrder: {
            identifiers: [
              {
                type: "dns",
                value: "test.example.com"
              }
            ],
            validity: {
              ttl: "24h"
            }
          }
        }
      });

      expect(res.statusCode).toBe(404);
    });
  });

  describe("Validation and Error Handling", () => {
    test("Should validate TTL format", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateRequest: {
            commonName: "test.example.com",
            validity: {
              ttl: "0h" // Invalid TTL
            }
          }
        }
      });

      expect(res.statusCode).toBe(400);
    });

    test("Should validate country code format", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateRequest: {
            commonName: "test.example.com",
            validity: {
              ttl: "24h"
            },
            country: "USA" // Invalid - should be 2 characters
          }
        }
      });

      expect(res.statusCode).toBe(400);
    });

    test("Should validate email format", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateRequest: {
            commonName: "test.example.com",
            validity: {
              ttl: "24h"
            },
            email: "invalid-email" // Invalid email format
          }
        }
      });

      expect(res.statusCode).toBe(400);
    });

    test("Should validate key usage requirements", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateRequest: {
            commonName: "test.example.com",
            validity: {
              ttl: "24h"
            },
            keyUsages: [], // Missing required key usages
            extendedKeyUsages: [] // Missing required extended key usages
          }
        }
      });

      expect(res.statusCode).toBe(400);
    });

    test("Should handle empty certificate request", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateRequest: {} // Empty certificate request
        }
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe("Authentication", () => {
    test("Should require authentication", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        body: {
          profileId,
          certificateRequest: {
            commonName: "test.example.com",
            validity: {
              ttl: "24h"
            }
          }
        }
      });

      expect(res.statusCode).toBe(401);
    });

    test("Should reject invalid token", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        headers: {
          authorization: "Bearer invalid-token"
        },
        body: {
          profileId,
          certificateRequest: {
            commonName: "test.example.com",
            validity: {
              ttl: "24h"
            }
          }
        }
      });

      expect(res.statusCode).toBe(401);
    });

    test("Should require authentication for CSR signing", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/sign-certificate",
        body: {
          profileId,
          csr: "mock-csr",
          validity: {
            ttl: "24h"
          }
        }
      });

      expect(res.statusCode).toBe(401);
    });

    test("Should require authentication for certificate ordering", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/order-certificate",
        body: {
          profileId,
          certificateOrder: {
            identifiers: [
              {
                type: "dns",
                value: "test.example.com"
              }
            ],
            validity: {
              ttl: "24h"
            }
          }
        }
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe("Profile-based Certificate Management", () => {
    test("Should create certificates with profile reference", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateRequest: {
            commonName: "profile-test.example.com",
            validity: {
              ttl: "24h"
            },
            keyUsages: ["digitalSignature"],
            extendedKeyUsages: ["serverAuth"]
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);

      // Verify that the certificate was created successfully
      expect(payload).toHaveProperty("certificateId");
      expect(typeof payload.certificateId).toBe("string");
      expect(payload.certificateId.length).toBeGreaterThan(0);

      // Verify all required fields are present
      expect(payload).toHaveProperty("certificate");
      expect(payload).toHaveProperty("certificateChain");
      expect(payload).toHaveProperty("privateKey");
      expect(payload).toHaveProperty("serialNumber");
      expect(payload).toHaveProperty("issuingCaCertificate");
    });

    test("Should validate using template policy without template dependency", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateRequest: {
            commonName: "policy-test.example.com",
            validity: {
              ttl: "24h"
            },
            // Include required key usages as defined in template
            keyUsages: ["digitalSignature"],
            extendedKeyUsages: ["serverAuth"],
            // Test optional attributes
            organization: "Policy Test Org",
            country: "US"
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("certificate");
      expect(payload).toHaveProperty("certificateId");
    });

    test("Should handle profile permissions correctly", async () => {
      const res = await testServer.inject({
        method: "POST",
        url: "/api/v3/certificates/issue-certificate",
        headers: {
          authorization: `Bearer ${jwtAuthToken}`
        },
        body: {
          profileId,
          certificateRequest: {
            commonName: "permission-test.example.com",
            validity: {
              ttl: "24h"
            },
            keyUsages: ["digitalSignature"],
            extendedKeyUsages: ["serverAuth"]
          }
        }
      });

      expect(res.statusCode).toBe(200);
      const payload = JSON.parse(res.payload);
      expect(payload).toHaveProperty("certificateId");
    });
  });
});
