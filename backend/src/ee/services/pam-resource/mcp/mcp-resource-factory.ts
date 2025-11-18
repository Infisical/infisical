import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";

import { PamResource } from "../pam-resource-enums";
import {
  TPamResourceFactory,
  TPamResourceFactoryRotateAccountCredentials,
  TPamResourceFactoryValidateAccountCredentials
} from "../pam-resource-types";
import { TMcpAccountCredentials, TMcpResourceConnectionDetails } from "./mcp-resource-types";

export interface McpResourceConnection {
  /**
   * Check and see if the connection is good or not.
   *
   * @returns Promise to be resolved when the connection is good, otherwise an error will be errbacked
   */
  validate: () => Promise<void>;

  /**
   * Close the connection.
   *
   * @returns Promise for closing the connection
   */
  close: () => Promise<void>;
}

const makeMcpConnection = (config: {
  connectionDetails: TMcpResourceConnectionDetails;
  resourceType: PamResource;
  resourceName: string;
}): McpResourceConnection => {
  const { connectionDetails } = config;
  const { url } = connectionDetails;

  return {
    validate: async () => {
      const issuer = new URL(url);
      const { status } = await request.get(`${issuer.origin}/.well-known/oauth-authorization-server`);
      if (status >= 400) throw new BadRequestError({ message: "Provided server is not a MCP server" });
    },
    close: async () => {}
  };
};

export const mcpResourceFactory: TPamResourceFactory<TMcpResourceConnectionDetails, TMcpAccountCredentials> = (
  resourceType,
  connectionDetails
) => {
  const validateConnection = async () => {
    let mcpConnector: McpResourceConnection | null = null;
    try {
      mcpConnector = makeMcpConnection({ connectionDetails, resourceName: "test-mcp", resourceType });
      await mcpConnector.validate();
      return connectionDetails;
    } catch (error) {
      if (error instanceof BadRequestError && error.message === "Connection terminated unexpectedly") {
        throw new BadRequestError({
          message: "Connection terminated unexpectedly. Verify that host and port are correct"
        });
      }

      throw new BadRequestError({
        message: `Unable to validate connection to ${resourceType}: ${(error as Error).message || String(error)}`
      });
    } finally {
      if (mcpConnector) await mcpConnector.close();
    }
  };

  const validateAccountCredentials: TPamResourceFactoryValidateAccountCredentials<TMcpAccountCredentials> = async (
    credentials
  ) => {
    try {
      return credentials;
    } catch (error) {
      throw new BadRequestError({
        message: `Unable to validate account credentials for ${resourceType}: ${(error as Error).message || String(error)}`
      });
    }
  };

  const rotateAccountCredentials: TPamResourceFactoryRotateAccountCredentials<TMcpAccountCredentials> = async (
    _rotationAccountCredentials,
    currentCredentials
  ) => currentCredentials;

  return {
    validateConnection,
    validateAccountCredentials,
    rotateAccountCredentials
  };
};
