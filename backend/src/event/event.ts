import { URL } from "node:url";

import { ForbiddenError } from "@casl/ability";
import jwt from "jsonwebtoken";
import { Server as WebSocketServer, ServerOptions, WebSocket } from "ws";

import { TableName } from "@app/db/schemas";
import { TPermissionServiceFactory } from "@app/ee/services/permission/permission-service";
import { ProjectPermissionActions, ProjectPermissionSub } from "@app/ee/services/permission/project-permission";
import { getConfig } from "@app/lib/config/env";
import { checkIPAgainstBlocklist, TIp } from "@app/lib/ip";
import { ActorType, AuthTokenType } from "@app/services/auth/auth-type";
import { TIdentityAccessTokenDALFactory } from "@app/services/identity-access-token/identity-access-token-dal";
import { TIdentityAccessTokenServiceFactory } from "@app/services/identity-access-token/identity-access-token-service";
import { TIdentityAccessTokenJwtPayload } from "@app/services/identity-access-token/identity-access-token-types";

type TEventSubscriptionFactoryDep = {
  identityAccessTokenDAL: TIdentityAccessTokenDALFactory;
  identityAccessTokenServiceFactory: TIdentityAccessTokenServiceFactory;
  permissionService: TPermissionServiceFactory;
};

enum AuthenticationErrors {
  NO_PROJECT_ID = "Unauthorized. Project ID is missing",
  NO_MACHINE = "Unauthorized. Machine Identity Access Token is missing",
  INVALID_TOKEN_TYPE = "Unauthorized. Invalid token type",
  INVALID_TOKEN = "Unauthorized. Invalid token",
  NO_PERMISSION = "Unauthorized. No permission to access project"
}

export type TEventSubscriptionFactory = ReturnType<typeof eventSubscriptionFactory>;

export const eventSubscriptionFactory = ({
  identityAccessTokenDAL,
  permissionService,
  identityAccessTokenServiceFactory
}: TEventSubscriptionFactoryDep) => {
  const config = getConfig();
  let connection: WebSocketServer | null = null;
  const clients = new Map<string, WebSocket[]>();

  const verifyConnection: ServerOptions["verifyClient"] = (info, cb) => {
    void (async () => {
      const machineIdentityAccessToken = info.req.headers["machine-identity-access-token"];
      const projectId = info.req.headers["project-id"];

      if (!projectId || typeof projectId !== "string") {
        cb(false, 401, AuthenticationErrors.NO_PROJECT_ID);
        return;
      }

      if (!machineIdentityAccessToken || typeof machineIdentityAccessToken !== "string") {
        cb(false, 401, AuthenticationErrors.NO_MACHINE);
        return;
      }

      const decodedToken = jwt.verify(machineIdentityAccessToken, config.AUTH_SECRET) as TIdentityAccessTokenJwtPayload;

      if (decodedToken.authTokenType !== AuthTokenType.IDENTITY_ACCESS_TOKEN) {
        cb(false, 401, AuthenticationErrors.INVALID_TOKEN_TYPE);
        return;
      }

      await identityAccessTokenServiceFactory.fnValidateIdentityAccessToken(
        decodedToken,
        info.req.socket.remoteAddress
      );

      const identityAccessToken = await identityAccessTokenDAL.findOne({
        [`${TableName.IdentityAccessToken}.id` as "id"]: decodedToken.identityAccessTokenId,
        isAccessTokenRevoked: false
      });

      if (!identityAccessToken) {
        cb(false, 401, AuthenticationErrors.INVALID_TOKEN);
        return;
      }

      const ipAddress = info.req.socket.remoteAddress;

      if (ipAddress) {
        // This throws, and im not sure if it really should. TODO
        checkIPAgainstBlocklist({
          ipAddress,
          trustedIps: identityAccessToken?.accessTokenTrustedIps as TIp[]
        });
      }

      const { permission } = await permissionService.getProjectPermission(
        ActorType.IDENTITY,
        identityAccessToken.identityId,
        projectId
      );
      try {
        ForbiddenError.from(permission).throwUnlessCan(ProjectPermissionActions.Read, ProjectPermissionSub.Secrets);
      } catch (err) {
        cb(false, 401, AuthenticationErrors.NO_PERMISSION);
        return;
      }

      cb(true);
    })();
  };

  const init = () => {
    if (connection) return;

    connection = new WebSocketServer({
      port: 8091,
      verifyClient: verifyConnection
    });

    // Purely for testing purposes.
    connection.on("connection", (ws) => {
      const projectId = new URL(ws.url).searchParams.get("projectId");

      if (!projectId) {
        ws.send("Unauthorized. Project ID is missing");
        ws.close();
        return;
      }

      if (!clients.has(projectId)) {
        clients.set(projectId, []);
      }
      clients.get(projectId)?.push(ws);

      ws.on("message", (message) => {
        console.log("received: %s", message);
      });

      ws.on("close", () => {
        const projectClients = clients.get(projectId);

        if (!projectClients) return;

        const index = projectClients.indexOf(ws);

        if (index !== -1) {
          projectClients.splice(index, 1);
        }

        if (projectClients.length === 0) {
          clients.delete(projectId);
        } else {
          clients.set(projectId, projectClients);
        }
      });

      ws.send("Connected.");
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const sendNotification = (projectId: string) => {
    const MESSAGE = "NEW_CHANGE";

    if (!connection) {
      throw new Error("Connection not initialized");
    }

    for (const client of connection.clients) {
      client.send(MESSAGE);
    }
  };

  return {
    init
  };
};

// var WebSocketServer = require("ws").Server;
// var ws = new WebSocketServer({
//   verifyClient: function (info, cb) {
//     var token = info.req.headers.token;
//     if (!token) cb(false, 401, "Unauthorized");
//     else {
//       jwt.verify(token, "secret-key", function (err, decoded) {
//         if (err) {
//           cb(false, 401, "Unauthorized");
//         } else {
//           info.req.user = decoded; //[1]
//           cb(true);
//         }
//       });
//     }
//   }
// });
