import { AxiosError } from "axios";

import { request } from "@app/lib/config/request";
import { BadRequestError } from "@app/lib/errors";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { IntegrationUrls } from "@app/services/integration-auth/integration-list";

import { DNSMadeEasyConnectionMethod } from "./dns-made-easy-connection-enum";
import {
  TDNSMadeEasyConnection,
  TDNSMadeEasyConnectionConfig,
  TDNSMadeEasyZone
} from "./dns-made-easy-connection-types";

export const getDNSMadeEasyConnectionListItem = () => {
  return {
    name: "DNS Made Easy" as const,
    app: AppConnection.DNSMadeEasy as const,
    methods: Object.values(DNSMadeEasyConnectionMethod) as [DNSMadeEasyConnectionMethod.APIKey]
  };
};

export const listDNSMadeEasyZones = async (appConnection: TDNSMadeEasyConnection): Promise<TDNSMadeEasyZone[]> => {
  // TODO: Implement DNS Made Easy zones listing
  // This should call the DNS Made Easy API to list all zones/domains
  // Example API endpoint: GET https://api.dnsmadeeasy.com/V2.0/dns/managed
  // Authentication: Use API key and secret from appConnection.credentials
  // Return format: Array of { id: string, name: string }

  if (appConnection.method !== DNSMadeEasyConnectionMethod.APIKey) {
    throw new Error("Unsupported DNS Made Easy connection method");
  }

  const {
    credentials: { apiKey, apiSecret }
  } = appConnection;

  // TODO: Make API request to DNS Made Easy
  // const { data } = await request.get<{ data: { id: number; name: string }[] }>(
  //   `${IntegrationUrls.DNS_MADE_EASY_API_URL}/V2.0/dns/managed`,
  //   {
  //     headers: {
  //       "x-dnsme-apiKey": apiKey,
  //       "x-dnsme-hmac": generateHMAC(apiSecret, ...),
  //       "x-dnsme-requestDate": requestDate,
  //       Accept: "application/json"
  //     }
  //   }
  // );

  // TODO: Transform response data to match TDNSMadeEasyZone format
  // return data.data.map((zone) => ({
  //   name: zone.name,
  //   id: zone.id.toString()
  // }));

  throw new Error("Not implemented: listDNSMadeEasyZones");
};

export const validateDNSMadeEasyConnectionCredentials = async (config: TDNSMadeEasyConnectionConfig) => {
  // TODO: Implement DNS Made Easy credentials validation
  // This should call the DNS Made Easy API to validate the API key and secret
  // Example API endpoint: GET https://api.dnsmadeeasy.com/V2.0/account
  // Authentication: Use API key and secret from config.credentials

  if (config.method !== DNSMadeEasyConnectionMethod.APIKey) {
    throw new Error("Unsupported DNS Made Easy connection method");
  }

  const { apiKey, apiSecret } = config.credentials;

  try {
    // TODO: Make API request to validate credentials
    // const resp = await request.get(`${IntegrationUrls.DNS_MADE_EASY_API_URL}/V2.0/account`, {
    //   headers: {
    //     "x-dnsme-apiKey": apiKey,
    //     "x-dnsme-hmac": generateHMAC(apiSecret, ...),
    //     "x-dnsme-requestDate": requestDate,
    //     Accept: "application/json"
    //   }
    // });
    // TODO: Validate response
    // if (resp.data === null || !resp.data.id) {
    //   throw new BadRequestError({
    //     message: "Unable to validate connection: Invalid API credentials provided."
    //   });
    // }
  } catch (error: unknown) {
    if (error instanceof AxiosError) {
      throw new BadRequestError({
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        message: `Failed to validate credentials: ${error.response?.data?.error?.[0] || error.message || "Unknown error"}`
      });
    }
    throw new BadRequestError({
      message: "Unable to validate connection: verify credentials"
    });
  }

  return config.credentials;
};
