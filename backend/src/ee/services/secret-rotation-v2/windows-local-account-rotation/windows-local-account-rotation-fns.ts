import {
  TRotationFactory,
  TRotationFactoryCheckActiveCredentials,
  TRotationFactoryGetSecretsPayload,
  TRotationFactoryIssueCredentials,
  TRotationFactoryRevokeCredentials,
  TRotationFactoryRotateCredentials
} from "@app/ee/services/secret-rotation-v2/secret-rotation-v2-types";
import { BadRequestError } from "@app/lib/errors";
import { changeWindowsPassword, SmbRpcConfig, verifyWindowsCredentials } from "@app/lib/smb-rpc";
import {
  executeSmbWithPotentialGateway,
  SmbConnectionMethod,
  TSmbConnectionConfig
} from "@app/services/app-connection/smb";

import { generatePassword } from "../shared/utils";
import { WindowsLocalAccountRotationMethod } from "./windows-local-account-rotation-schemas";
import {
  TWindowsLocalAccountRotationGeneratedCredentials,
  TWindowsLocalAccountRotationInput,
  TWindowsLocalAccountRotationWithConnection
} from "./windows-local-account-rotation-types";

export const windowsLocalAccountRotationFactory: TRotationFactory<
  TWindowsLocalAccountRotationWithConnection,
  TWindowsLocalAccountRotationGeneratedCredentials,
  TWindowsLocalAccountRotationInput["temporaryParameters"]
> = (secretRotation, _appConnectionDAL, _kmsService, _gatewayService, gatewayV2Service, gatewayPoolService) => {
  const { connection, parameters, secretsMapping, activeIndex } = secretRotation;
  const { username, passwordRequirements, rotationMethod = WindowsLocalAccountRotationMethod.LoginAsRoot } = parameters;

  let resolvedConnection: typeof connection | undefined;
  const getResolvedConnection = async () => {
    if (!resolvedConnection) {
      const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
        gatewayId: connection.gatewayId,
        gatewayPoolId: connection.gatewayPoolId
      });
      resolvedConnection = { ...connection, gatewayId: effectiveGatewayId, gatewayPoolId: null };
    }
    return resolvedConnection;
  };

  const $verifyCredentials = async (targetUsername: string, targetPassword: string): Promise<void> => {
    const conn = await getResolvedConnection();

    const verifyConfig: TSmbConnectionConfig = {
      method: SmbConnectionMethod.Credentials,
      app: conn.app,
      orgId: conn.orgId,
      gatewayId: conn.gatewayId,
      credentials: {
        host: conn.credentials.host,
        port: conn.credentials.port,
        domain: undefined,
        username: targetUsername,
        password: targetPassword
      }
    };

    await executeSmbWithPotentialGateway(verifyConfig, gatewayV2Service, async (targetHost, targetPort) => {
      await verifyWindowsCredentials(targetHost, targetPort, targetUsername, targetPassword, undefined);
    });
  };

  const $rotatePassword = async (currentPassword?: string): Promise<{ username: string; password: string }> => {
    const conn = await getResolvedConnection();
    const { credentials } = conn;
    const credentialsDomain: string | undefined = credentials.domain;
    const credentialsPassword: string = credentials.password;
    const newPassword = generatePassword(passwordRequirements);

    const isSelfRotation = rotationMethod === WindowsLocalAccountRotationMethod.LoginAsTarget;
    if (username === credentials.username)
      throw new BadRequestError({ message: "Provided username is used in Infisical app connections." });

    const smbConfig: SmbRpcConfig = {
      host: credentials.host,
      port: credentials.port,
      adminUser: credentials.username,
      adminPassword: credentialsPassword,
      domain: credentialsDomain
    };

    if (isSelfRotation && currentPassword) {
      smbConfig.adminUser = username;
      smbConfig.adminPassword = currentPassword;
      smbConfig.domain = undefined;
    }

    const connectConfig: TSmbConnectionConfig = {
      method: conn.method,
      app: conn.app,
      orgId: conn.orgId,
      gatewayId: conn.gatewayId,
      credentials: {
        host: credentials.host,
        port: credentials.port,
        domain: credentialsDomain,
        username: credentials.username,
        password: credentialsPassword
      }
    };

    if (isSelfRotation && currentPassword) {
      connectConfig.credentials.username = username;
      connectConfig.credentials.password = currentPassword;
      connectConfig.credentials.domain = undefined;
    }

    await executeSmbWithPotentialGateway(connectConfig, gatewayV2Service, async (targetHost, targetPort) => {
      const configWithProxiedHost: SmbRpcConfig = {
        ...smbConfig,
        host: targetHost,
        port: targetPort
      };

      await changeWindowsPassword(configWithProxiedHost, username, newPassword);
    });

    await $verifyCredentials(username, newPassword);

    return { username, password: newPassword };
  };

  const issueCredentials: TRotationFactoryIssueCredentials<
    TWindowsLocalAccountRotationGeneratedCredentials,
    TWindowsLocalAccountRotationInput["temporaryParameters"]
  > = async (callback, temporaryParameters) => {
    const newCredentials = await $rotatePassword(temporaryParameters?.password);
    return callback(newCredentials);
  };

  const revokeCredentials: TRotationFactoryRevokeCredentials<TWindowsLocalAccountRotationGeneratedCredentials> = async (
    credentialsToRevoke,
    callback
  ) => {
    const currentPassword = credentialsToRevoke[activeIndex].password;
    // We just rotate to a new password, essentially revoking old credentials
    // For self rotation: we need current password to authenticate
    // For managed rotation: admin uses their own credentials
    await $rotatePassword(currentPassword);
    return callback();
  };

  const rotateCredentials: TRotationFactoryRotateCredentials<TWindowsLocalAccountRotationGeneratedCredentials> = async (
    _,
    callback,
    activeCredentials
  ) => {
    // For both methods, pass the current password
    // Self rotation: needed to authenticate as the user
    // Managed rotation: admin doesn't need it but it's harmless to pass
    const newCredentials = await $rotatePassword(activeCredentials.password);
    return callback(newCredentials);
  };

  const getSecretsPayload: TRotationFactoryGetSecretsPayload<TWindowsLocalAccountRotationGeneratedCredentials> = (
    generatedCredentials
  ) => {
    return [
      { key: secretsMapping.username, value: generatedCredentials.username },
      { key: secretsMapping.password, value: generatedCredentials.password }
    ];
  };

  const checkActiveCredentials: TRotationFactoryCheckActiveCredentials<
    TWindowsLocalAccountRotationGeneratedCredentials
  > = async ({ username: activeUsername, password }) => {
    await $verifyCredentials(activeUsername, password);
  };

  return {
    issueCredentials,
    revokeCredentials,
    rotateCredentials,
    getSecretsPayload,
    checkActiveCredentials
  };
};
