import jsrp from "jsrp";

import { seedData1 } from "@app/db/seed-data";

describe("Login V1 Router", async () => {
  // eslint-disable-next-line
  const client = new jsrp.client();
  await new Promise((resolve) => {
    client.init({ username: seedData1.email, password: seedData1.password }, () => resolve(null));
  });
  let clientProof: string;

  test("Login first phase", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/auth/login1",
      body: {
        email: "test@localhost.local",
        clientPublicKey: client.getPublicKey()
      }
    });
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload).toHaveProperty("serverPublicKey");
    expect(payload).toHaveProperty("salt");
    client.setSalt(payload.salt);
    client.setServerPublicKey(payload.serverPublicKey);
    clientProof = client.getProof(); // called M1
  });

  test("Login second phase", async () => {
    const res = await testServer.inject({
      method: "POST",
      url: "/api/v3/auth/login2",
      body: {
        email: seedData1.email,
        clientProof
      }
    });
    expect(res.statusCode).toBe(200);
    const payload = JSON.parse(res.payload);
    expect(payload).toHaveProperty("token");
  });
});
