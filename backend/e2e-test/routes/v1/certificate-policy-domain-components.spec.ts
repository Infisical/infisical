import { ProjectType } from "@app/db/schemas";

const CERT_MANAGER_PROJECT_SLUG = "dc-order-policies";

type TSubjectRule = {
  type: string;
  allowed?: unknown;
  required?: unknown;
  denied?: unknown;
};

let projectId = "";

const createProject = async () => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/projects",
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: {
      projectName: "DC order policies",
      slug: CERT_MANAGER_PROJECT_SLUG,
      type: ProjectType.CertificateManager
    }
  });

  expect(res.statusCode).toBe(200);
  return (JSON.parse(res.payload) as { project: { id: string } }).project.id;
};

const createPolicy = async (name: string, subject: TSubjectRule[]) =>
  testServer.inject({
    method: "POST",
    url: "/api/v1/cert-manager/certificate-policies",
    headers: { authorization: `Bearer ${jwtAuthToken}` },
    body: { projectId, name, subject }
  });

const getPolicy = async (policyId: string) =>
  testServer.inject({
    method: "GET",
    url: `/api/v1/cert-manager/certificate-policies/${policyId}?projectId=${projectId}`,
    headers: { authorization: `Bearer ${jwtAuthToken}` }
  });

const subjectOf = (payload: string) =>
  (JSON.parse(payload) as { certificatePolicy: { subject: TSubjectRule[] } }).certificatePolicy.subject;

const domainComponentRule = (subject: TSubjectRule[]) => subject.find((rule) => rule.type === "domain_component");

describe("Certificate policy domain component rules", async () => {
  const createdPolicyIds: string[] = [];

  beforeAll(async () => {
    projectId = await createProject();
  });

  afterAll(async () => {
    for (const policyId of createdPolicyIds) {
      // eslint-disable-next-line no-await-in-loop
      await testServer.inject({
        method: "DELETE",
        url: `/api/v1/cert-manager/certificate-policies/${policyId}?projectId=${projectId}`,
        headers: { authorization: `Bearer ${jwtAuthToken}` }
      });
    }

    await testServer.inject({
      method: "DELETE",
      url: `/api/v1/projects/${projectId}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` }
    });
  });

  const trackPolicy = (payload: string) => {
    const { certificatePolicy } = JSON.parse(payload) as { certificatePolicy: { id: string } };
    createdPolicyIds.push(certificatePolicy.id);
    return certificatePolicy.id;
  };

  test("stores ordered sequences as given", async () => {
    const res = await createPolicy("dc-sequences", [
      {
        type: "domain_component",
        allowed: [
          ["corp", "example", "com"],
          ["*", "internal", "example", "com"]
        ],
        denied: [["evil", "example", "com"]]
      }
    ]);

    expect(res.statusCode).toBe(200);
    const policyId = trackPolicy(res.payload);

    const read = await getPolicy(policyId);
    expect(read.statusCode).toBe(200);
    expect(domainComponentRule(subjectOf(read.payload))).toEqual({
      type: "domain_component",
      allowed: [
        ["corp", "example", "com"],
        ["*", "internal", "example", "com"]
      ],
      denied: [["evil", "example", "com"]]
    });
  });

  test("reads a flat label list as the single sequence it describes", async () => {
    const res = await createPolicy("dc-flat-list", [{ type: "domain_component", allowed: ["corp", "example", "com"] }]);

    expect(res.statusCode).toBe(200);
    const policyId = trackPolicy(res.payload);

    expect(domainComponentRule(subjectOf(res.payload))?.allowed).toEqual([["corp", "example", "com"]]);

    const read = await getPolicy(policyId);
    expect(domainComponentRule(subjectOf(read.payload))?.allowed).toEqual([["corp", "example", "com"]]);
  });

  test("leaves the rules of other subject attributes flat", async () => {
    const res = await createPolicy("dc-other-attributes", [
      { type: "common_name", allowed: ["*.example.com"], denied: ["admin.example.com"] },
      { type: "domain_component", required: [["corp", "example", "com"]] }
    ]);

    expect(res.statusCode).toBe(200);
    trackPolicy(res.payload);

    const subject = subjectOf(res.payload);
    expect(subject.find((rule) => rule.type === "common_name")).toEqual({
      type: "common_name",
      allowed: ["*.example.com"],
      denied: ["admin.example.com"]
    });
    expect(domainComponentRule(subject)?.required).toEqual([["corp", "example", "com"]]);
  });

  test("updates a rule from one sequence to several", async () => {
    const created = await createPolicy("dc-update", [
      { type: "domain_component", allowed: ["corp", "example", "com"] }
    ]);
    expect(created.statusCode).toBe(200);
    const policyId = trackPolicy(created.payload);

    const updated = await testServer.inject({
      method: "PATCH",
      url: `/api/v1/cert-manager/certificate-policies/${policyId}?projectId=${projectId}`,
      headers: { authorization: `Bearer ${jwtAuthToken}` },
      body: {
        subject: [
          {
            type: "domain_component",
            allowed: [
              ["corp", "example", "com"],
              ["example", "com"]
            ]
          }
        ]
      }
    });

    expect(updated.statusCode).toBe(200);
    expect(domainComponentRule(subjectOf(updated.payload))?.allowed).toEqual([
      ["corp", "example", "com"],
      ["example", "com"]
    ]);
  });

  test.each([
    ["a value list mixing labels and sequences", ["corp", ["example", "com"]]],
    ["an empty component", [["corp", ""]]],
    ["a component holding the separator", [["corp,example", "com"]]]
  ])("rejects %s", async (_label, allowed) => {
    const res = await createPolicy(`dc-invalid-${_label.replace(/[^a-z]/g, "")}`, [
      { type: "domain_component", allowed }
    ]);

    expect(res.statusCode).toBe(422);
  });
});
