import main from "../../../../src";
import IpAddress, { IIpAddress } from "../../../../src/models/ipAddress";
import {
  testUserId,
  testWorkspaceId,
  testWorkspaceKeyId,
} from "../../../../src/utils/addDevelopmentUser";
import request from "supertest";
import { getJWTFromTestUser, TokenData } from "../../../helper/helper";
import { Builder } from "builder-pattern";
import { Types } from "mongoose";
import to from "await-to-js";

describe("#IpAddress", () => {
  let server: any;
  let loginResponse: TokenData;
  beforeAll(async () => {
    server = await main;
    loginResponse = await getJWTFromTestUser();
  });

  beforeEach(async () => {
    await IpAddress.deleteMany({});
  })

  afterAll(async () => {
    server.close();
  });

  describe("GET /api/v2/:workspace/ips", () => {
    test("should return an empty array when workspace has no IP address", async () => {
      const response = await request(server)
        .get(`/api/v2/workspace/${testWorkspaceId}/ips`)
        .set("Authorization", `Bearer ${loginResponse.token}`);
      expect(response.statusCode).toEqual(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toEqual(0);
    });

    test("should return a list workspace ips when they exists", async () => {
      const ipAddressBuilder = Builder<IIpAddress>()
        .workspace(new Types.ObjectId(testWorkspaceId))
        .user(new Types.ObjectId(testUserId))
        .build();

      const ip1 = { ...ipAddressBuilder, ip: "127.0.0.3" };
      const ip2 = { ...ipAddressBuilder, ip: "127.0.0.4" };
      const ip3 = Builder<IIpAddress>()
        .workspace(new Types.ObjectId("60b3231ab0d26c001aa55e94"))
        .user(new Types.ObjectId("60b3231ab0d26c001aa55e94"))
        .ip("127.0.0.1")
        .build();

      await IpAddress.create([ip1, ip2, ip3]);

      const response = await request(server)
        .get(`/api/v2/workspace/${testWorkspaceId}/ips`)
        .set("Authorization", `Bearer ${loginResponse.token}`);
      expect(response.statusCode).toEqual(200);
      expect(response.body).toBeInstanceOf(Array);
      expect(response.body.length).toEqual(2);
      const ips = response.body.map((responseBody: any) => responseBody.ip);
      expect(ips).toContain('127.0.0.4')
      expect(ips).toContain("127.0.0.3");
    });
  });

  describe("POST /api/v2/:workspace/ips", () => {
    test("should create an Ip for a workspace", async () => {
      const ip = "134.2.0.6";
      const response = await request(server)
        .post(`/api/v2/workspace/${testWorkspaceId}/ips`)
        .set("Authorization", `Bearer ${loginResponse.token}`)
        .send({ ip: ip });
      expect(response.statusCode).toEqual(201);
      expect(response.body.id).not.toBeNull();

      const numberOfWorkSpaceIps = await IpAddress.count({
        ip,
        workspace: new Types.ObjectId(testWorkspaceId),
      });
      expect(numberOfWorkSpaceIps).toEqual(1);
    });
  });

  test("should return a 400 status code when the IP address already exists", async () => {
    const ip = "134.2.0.6";
    await IpAddress.create({
      ip,
      workspace: new Types.ObjectId(testWorkspaceId),
      user: new Types.ObjectId(testUserId),
    });
    const response = await request(server)
      .post(`/api/v2/workspace/${testWorkspaceId}/ips`)
      .set("Authorization", `Bearer ${loginResponse.token}`)
      .send({ ip: ip });

    expect(response.statusCode).toEqual(400);
  });

  describe("POST /api/v2/:workspace/ips/:ip", () => {
    test("should return a 400 when the IP address does not exist", async () => {
      const response = await request(server)
        .delete(
          `/api/v2/workspace/${testWorkspaceId}/ips/${testWorkspaceKeyId}`
        )
        .set("Authorization", `Bearer ${loginResponse.token}`);

      expect(response.statusCode).toEqual(400);
      expect(response.body.message).toEqual("id does not exist");
    });

    test("should delete an IP by its ID", async () => {
      const ip = "125.94.474.2";
      const [err, createdIp] = await to(
        IpAddress.create({
          ip: ip,
          workspace: new Types.ObjectId(testWorkspaceId),
          user: new Types.ObjectId(testUserId),
        })
      );

      const response = await request(server)
        .delete(`/api/v2/workspace/${testWorkspaceId}/ips/${createdIp?._id}`)
        .set("Authorization", `Bearer ${loginResponse.token}`);

      expect(response.statusCode).toEqual(200);

      const ipAddressCount = await IpAddress.count({ ip });
      expect(ipAddressCount).toEqual(0)
    });
  });
});
