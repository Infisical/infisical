import crypto from "node:crypto";

import { AxiosError, AxiosInstance, AxiosRequestConfig } from "axios";

export const createDigestAuthRequestInterceptor = (
  axiosInstance: AxiosInstance,
  username: string,
  password: string
) => {
  let nc = 0;

  return async (opts: AxiosRequestConfig) => {
    try {
      return await axiosInstance.request(opts);
    } catch (err) {
      const error = err as AxiosError;
      const authHeader = (error?.response?.headers?.["www-authenticate"] as string) || "";

      if (error?.response?.status !== 401 || !authHeader?.includes("nonce")) {
        return Promise.reject(error.message);
      }

      if (!error.config) {
        return Promise.reject(error);
      }

      const authDetails = authHeader.split(",").map((el) => el.split("="));
      nc += 1;
      const nonceCount = nc.toString(16).padStart(8, "0");
      const cnonce = crypto.randomBytes(24).toString("hex");
      const realm = authDetails.find((el) => el[0].toLowerCase().indexOf("realm") > -1)?.[1].replace(/"/g, "");
      const nonce = authDetails.find((el) => el[0].toLowerCase().indexOf("nonce") > -1)?.[1].replace(/"/g, "");
      const ha1 = crypto.createHash("md5").update(`${username}:${realm}:${password}`).digest("hex");
      const path = opts.url;

      const ha2 = crypto
        .createHash("md5")
        .update(`${opts.method ?? "GET"}:${path}`)
        .digest("hex");

      const response = crypto
        .createHash("md5")
        .update(`${ha1}:${nonce}:${nonceCount}:${cnonce}:auth:${ha2}`)
        .digest("hex");
      const authorization = `Digest username="${username}",realm="${realm}",nonce="${nonce}",uri="${path}",qop="auth",algorithm="MD5",response="${response}",nc="${nonceCount}",cnonce="${cnonce}"`;

      if (opts.headers) {
        // eslint-disable-next-line
        opts.headers.authorization = authorization;
      } else {
        // eslint-disable-next-line
        opts.headers = { authorization };
      }
      return axiosInstance.request(opts);
    }
  };
};
