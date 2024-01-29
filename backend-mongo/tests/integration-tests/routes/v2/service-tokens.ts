import request from "supertest"
import main from "../../../../src/index"
import { getServiceTokenFromTestUser } from "../../../helper/helper";
let server: any;

beforeAll(async () => {
  server = await main;
});

afterAll(async () => {
  server.close();
});

describe("GET /api/v2/service-token", () => {
  describe("Get service token details", () => {
    test("should respond create and get the details of a service token", async () => {
      // generate a service token
      const serviceToken = await getServiceTokenFromTestUser()

      // get the service token details 
      const serviceTokenDetails = await request(server)
        .get("/api/v2/service-token")
        .set("Authorization", `Bearer ${serviceToken}`)

      expect(serviceTokenDetails.body).toMatchObject({
        _id: expect.any(String),
        name: "test service token",
        workspace: "63cefb15c8d3175601cfa989",
        environment: "dev",
        user: {
          _id: "63cefa6ec8d3175601cfa980",
          email: "test@localhost.local",
          firstName: "Jake",
          lastName: "Moni",
          isMfaEnabled: false,
          mfaMethods: expect.any(Array),
          devices: [
            {
              ip: expect.any(String),
              userAgent: expect.any(String),
              _id: expect.any(String),
            },
          ],
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        },
        lastUsed: expect.any(String),
        expiresAt: expect.any(String),
        encryptedKey: expect.any(String),
        iv: expect.any(String),
        tag: expect.any(String),
        permissions: ["read"],
        createdAt: expect.any(String),
        updatedAt: expect.any(String),
      });
    })
  })
})