import https from "https";

import { TCloudflareConnectionConfig } from "../../app-connection/cloudflare/cloudflare-connection-types";

interface CloudflareTxtRecord {
  id: string;
  name: string;
  content: string;
  type: string;
  ttl: number;
}

interface CloudflareResponse {
  success: boolean;
  result: CloudflareTxtRecord[];
  errors?: any[];
}

interface CloudflareCreateResponse {
  success: boolean;
  result: CloudflareTxtRecord;
  errors?: any[];
}

interface CloudflareDeleteResponse {
  success: boolean;
  result: { id: string };
  errors?: any[];
}

function makeHttpsRequest(options: https.RequestOptions, data?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        try {
          const parsed = JSON.parse(body);
          resolve(parsed);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${body}`));
        }
      });
    });

    req.on("error", (error) => {
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

/**
 * Creates a TXT DNS record in Cloudflare to solve an ACME DNS-01 challenge.
 * This is the Cloudflare equivalent of the `route53InsertTxtRecord` function.
 * @param domain - The full domain name for the TXT record (e.g., _acme-challenge.example.com).
 * @param name - The name of the TXT record (e.g., _acme-challenge).
 * @param value - The unique value provided by the ACME server for the challenge.
 * @param config - The Cloudflare connection configuration containing the API token.
 * @returns The ID of the newly created DNS record, which is needed for deletion.
 */
export const cloudflareInsertTxtRecord = async (
  apiToken: string,
  zoneId: string,
  domain: string,
  value: string
): Promise<string> => {
  try {
    const postData = {
      type: "TXT",
      name: `_acme-challenge.${domain}`,
      content: value,
      ttl: 60
    };

    const options: https.RequestOptions = {
      hostname: "api.cloudflare.com",
      port: 443,
      path: `/client/v4/zones/${zoneId}/dns_records`,
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
        "Content-Length": JSON.stringify(postData).length
      }
    };

    const response = await makeHttpsRequest(options, postData) as CloudflareCreateResponse;

    if (!response.success) {
      throw new Error(
        `Cloudflare API error: ${JSON.stringify(response.errors)}`
      );
    }

    return response.result.id;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to create Cloudflare TXT record: ${error.message}`
      );
    }
    throw error;
  }
};

/**
 * Deletes a TXT DNS record from Cloudflare using its specific record ID.
 * This is the Cloudflare equivalent of the `route53DeleteTxtRecord` function.
 *
 * NOTE: Unlike the AWS version which can find and delete a record by its properties,
 * the Cloudflare API requires the unique ID of the record to delete it.
 * The ID should be retrieved from the `cloudflareInsertTxtRecord` function's return value.
 * @param domain - The full domain name for the TXT record (e.g., _acme-challenge.example.com).
 * @param recordId - The unique ID of the DNS record to be deleted.
 * @param config - The Cloudflare connection configuration containing the API token.
 */
export const cloudflareDeleteTxtRecord = async (
  apiToken: string,
  zoneId: string,
  recordId: string
): Promise<void> => {
  try {
    const options: https.RequestOptions = {
      hostname: "api.cloudflare.com",
      port: 443,
      path: `/client/v4/zones/${zoneId}/dns_records/${recordId}`,
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json"
      }
    };

    const response = await makeHttpsRequest(options) as CloudflareDeleteResponse;

    if (!response.success) {
      throw new Error(
        `Cloudflare API error: ${JSON.stringify(response.errors)}`
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(
        `Failed to delete Cloudflare TXT record: ${error.message}`
      );
    }
    throw error;
  }
}; 