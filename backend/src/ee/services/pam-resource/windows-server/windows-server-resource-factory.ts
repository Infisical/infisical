import net from "node:net";

import axios from "axios";

import { BadRequestError } from "@app/lib/errors";
import { GatewayProxyProtocol } from "@app/lib/gateway";
import { withGatewayV2Proxy } from "@app/lib/gateway-v2/gateway-v2";
import { logger } from "@app/lib/logger";

import { verifyHostInputValidity } from "../../dynamic-secret/dynamic-secret-fns";
import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { PamResource } from "../pam-resource-enums";
import {
  TPamResourceFactory,
  TPamResourceFactoryRotateAccountCredentials,
  TPamResourceFactoryValidateAccountCredentials
} from "../pam-resource-types";
import { TWindowsAccountCredentials, TWindowsResourceConnectionDetails } from "./windows-server-resource-types";

const EXTERNAL_REQUEST_TIMEOUT = 10 * 1000;
const WINRM_HTTP_PORT = 5985;

const executeWithGateway = async <T>(
  config: {
    connectionDetails: TWindowsResourceConnectionDetails;
    resourceType: PamResource;
    gatewayId: string;
    targetPortOverride?: number;
  },
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  operation: (proxyPort: number) => Promise<T>
): Promise<T> => {
  const { connectionDetails, gatewayId, targetPortOverride } = config;
  const [targetHost] = await verifyHostInputValidity({
    host: connectionDetails.hostname,
    isGateway: true,
    isDynamicSecret: false
  });
  const platformConnectionDetails = await gatewayV2Service.getPlatformConnectionDetailsByGatewayId({
    gatewayId,
    targetHost,
    targetPort: targetPortOverride ?? connectionDetails.port
  });

  if (!platformConnectionDetails) {
    throw new BadRequestError({ message: "Unable to connect to gateway, no platform connection details found" });
  }

  return withGatewayV2Proxy(
    async (proxyPort) => {
      return operation(proxyPort);
    },
    {
      protocol: GatewayProxyProtocol.Tcp,
      relayHost: platformConnectionDetails.relayHost,
      gateway: platformConnectionDetails.gateway,
      relay: platformConnectionDetails.relay
    }
  );
};

export const windowsResourceFactory: TPamResourceFactory<
  TWindowsResourceConnectionDetails,
  TWindowsAccountCredentials
> = (resourceType, connectionDetails, gatewayId, gatewayV2Service) => {
  const validateConnection = async () => {
    if (!gatewayId) {
      throw new BadRequestError({ message: "Gateway ID is required" });
    }

    try {
      await executeWithGateway({ connectionDetails, gatewayId, resourceType }, gatewayV2Service, async (proxyPort) => {
        return new Promise<void>((resolve, reject) => {
          const socket = new net.Socket();
          let settled = false;

          const finish = (error?: Error) => {
            if (settled) return;
            settled = true;
            socket.destroy();
            if (error) reject(error);
            else resolve();
          };

          socket.setTimeout(EXTERNAL_REQUEST_TIMEOUT);
          socket.on("timeout", () => finish(new Error("Connection timeout")));
          socket.on("error", (err) => finish(err));
          socket.on("close", () => finish(new Error("Connection closed before RDP handshake completed")));

          socket.on("connect", () => {
            // Send a minimal RDP X.224 Connection Request to verify the server speaks RDP.
            // TPKT header (4 bytes) + X.224 CR (7 bytes) + RDP Negotiation Request (8 bytes) = 19 bytes
            // prettier-ignore
            socket.write(Buffer.from([
              0x03, 0x00, 0x00, 0x13,                         // TPKT: version 3, length 19
              0x0e, 0xe0, 0x00, 0x00, 0x00, 0x00, 0x00,       // X.224 Connection Request
              0x01, 0x00, 0x08, 0x00, 0x01, 0x00, 0x00, 0x00  // RDP Neg Request: TLS
            ]));
          });

          socket.on("data", (data: Buffer) => {
            // An RDP server responds with X.224 Connection Confirm:
            // byte 0 = 0x03 (TPKT version), byte 5 = 0xD0 (CC code)
            if (data.length >= 7 && data[0] === 0x03 && data[5] === 0xd0) {
              logger.info("[Windows Server Resource Factory] RDP handshake successful");
              finish();
            } else {
              finish(new Error("Server is not an RDP server"));
            }
          });

          socket.connect(proxyPort, "localhost");
        });
      });
    } catch (error) {
      throw new BadRequestError({
        message: `Unable to validate connection to ${resourceType}: ${(error as Error).message || String(error)}`
      });
    }

    return connectionDetails;
  };

  const validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<TWindowsAccountCredentials> = async (
    credentials
  ) => {
    if (!gatewayId) {
      throw new BadRequestError({ message: "Gateway ID is required" });
    }

    try {
      const statusCode = await executeWithGateway(
        { connectionDetails, gatewayId, resourceType, targetPortOverride: WINRM_HTTP_PORT },
        gatewayV2Service,
        async (proxyPort) => {
          const resp = await axios.post(`http://localhost:${proxyPort}/wsman`, "", {
            headers: { "Content-Type": "application/soap+xml;charset=UTF-8" },
            auth: { username: credentials.username, password: credentials.password },
            timeout: EXTERNAL_REQUEST_TIMEOUT,
            validateStatus: () => true
          });
          return resp.status;
        }
      );

      if (statusCode === 401) {
        throw new BadRequestError({
          message:
            "Account credentials invalid: username or password is incorrect, or the account does not have WinRM access (only administrators can authenticate via WinRM by default)"
        });
      }
    } catch (error) {
      if (error instanceof BadRequestError) throw error;

      const errMsg = error instanceof Error ? error.message : String(error);
      throw new BadRequestError({
        message: `Unable to validate account credentials via WinRM (port 5985): ${errMsg}. Ensure WinRM is enabled (run 'winrm quickconfig' on the server) and that port 5985 is open.`
      });
    }

    return credentials;
  };

  const rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<
    TWindowsAccountCredentials
  > = async () => {
    throw new BadRequestError({
      message: "Credential rotation is not yet supported for Windows Server resources"
    });
  };

  const handleOverwritePreventionForCensoredValues = async (
    updatedAccountCredentials: TWindowsAccountCredentials,
    currentCredentials: TWindowsAccountCredentials
  ) => {
    if (updatedAccountCredentials.password === "__INFISICAL_UNCHANGED__") {
      return {
        ...updatedAccountCredentials,
        password: currentCredentials.password
      };
    }

    return updatedAccountCredentials;
  };

  return {
    validateConnection,
    validateAccountCredentials,
    rotateAccountCredentials,
    handleOverwritePreventionForCensoredValues
  };
};
