import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { decryptAppConnectionCredentials } from "@app/services/app-connection/app-connection-fns";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

export type TServiceNowAccessRequestPayload = {
  request_id: string;
  external_request_id: string;
  callback_url: string;
  request_type: "secret_access";
  project_id: string;
  project_name: string;
  environment: string;
  secret_path: string;
  permissions: unknown;
  requestor_email: string;
  requestor_name: string;
  justification: string | null;
  is_temporary: boolean;
  temporary_range: string | null;
};

export type TServiceNowConnectionCredentials = {
  instanceUrl: string;
  username: string;
  password: string;
};

export const sendAccessRequestToServiceNow = async ({
  encryptedCredentials,
  orgId,
  projectId,
  payload,
  kmsService
}: {
  encryptedCredentials: Buffer;
  orgId: string;
  projectId: string | null | undefined;
  payload: TServiceNowAccessRequestPayload;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
}): Promise<void> => {
  const credentials = (await decryptAppConnectionCredentials({
    orgId,
    encryptedCredentials,
    kmsService,
    projectId
  })) as TServiceNowConnectionCredentials;

  const { instanceUrl, username, password } = credentials;
  const baseUrl = instanceUrl.endsWith("/") ? instanceUrl.slice(0, -1) : instanceUrl;

  try {
    await request.post(`${baseUrl}/api/x_infisical/v1/infisical/access_request`, payload, {
      auth: { username, password },
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      }
    });
  } catch (error) {
    const axiosError = error as AxiosError;
    const statusCode = axiosError.response?.status;
    const errorMessage = axiosError.message;

    throw new BadRequestError({
      message: `Failed to send access request to ServiceNow: ${statusCode ? `HTTP ${statusCode}` : errorMessage}. The request has been created but requires manual intervention.`
    });
  }
};
