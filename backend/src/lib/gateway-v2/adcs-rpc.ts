import http from "node:http";

import { logger } from "@app/lib/logger";

export type AdcsRpcEndpoint = "/v1/test" | "/v1/discover-ca" | "/v1/templates" | "/v1/enroll";

export type AdcsRpcRequestBody = {
  host: string;
  username: string;
  password: string;
  caName?: string;
  params?: Record<string, unknown>;
};

export type AdcsTemplate = { name: string };
export type AdcsTemplatesResult = { templates: AdcsTemplate[] };
export type AdcsEnrollResult = {
  disposition: number;
  requestId: number;
  certificatePem: string;
  chainPem: string;
  dispositionMessage?: string;
  hresult?: number;
};

// CR_DISP_* request-disposition codes (small values) from ICertRequestD::Request.
const ADCS_REQUEST_DISPOSITIONS: Record<number, string> = {
  0: "The request is incomplete.",
  1: "The certificate authority could not process the request.",
  2: "The request was denied by the certificate authority policy or an administrator.",
  5: "The request is pending administrator approval on the certificate authority."
};

// Common CERTSRV_E_*/HRESULT failure codes AD CS returns when a request cannot be issued.
const ADCS_HRESULT_MESSAGES: Record<number, string> = {
  0x80094800: "The requested certificate template is not supported or is not published by this certificate authority.",
  0x80094801: "The request does not specify a certificate template.",
  0x80094012: "The connection account does not have Enroll permission on the requested certificate template.",
  0x80094011: "The certificate template requires an email address in the subject, which was not provided.",
  0x80094009: "The certificate template requires a DNS name in the subject alternative name, which was not provided.",
  0x80094003: "The subject name in the request is invalid or not permitted by the certificate template.",
  0x80070005: "Access was denied by the certificate authority.",
  0x80070057:
    "The certificate authority rejected the request arguments. Verify the certificate authority name and template."
};

/**
 * Turns an AD CS enrollment failure into an actionable message. Prefers the known
 * meaning of the disposition/HRESULT, folds in the CA's own status string when present,
 * and always includes the raw code + request id for support.
 */
export const describeAdcsDisposition = (
  disposition: number,
  opts?: { requestId?: number; dispositionMessage?: string; hresult?: number }
): string => {
  // Normalize a signed int32 (e.g. -2146875392) to its unsigned 32-bit form (0x80094800).
  const raw = opts?.hresult ?? disposition;
  const code = raw < 0 ? raw + 2 ** 32 : raw;
  const hex = `0x${code.toString(16).padStart(8, "0")}`;
  // CR_DISP_* codes are small (0-5); CERTSRV_E_*/HRESULTs have the high bit set (> 0xffff),
  // so magnitude disambiguates which table to consult when no explicit hresult is given.
  const known = ADCS_HRESULT_MESSAGES[code] ?? (code <= 0xffff ? ADCS_REQUEST_DISPOSITIONS[code] : undefined);
  const caMessage = opts?.dispositionMessage?.trim();

  let reason = known;
  if (!reason && caMessage) {
    reason = caMessage;
  } else if (reason && caMessage && !reason.toLowerCase().includes(caMessage.toLowerCase())) {
    reason = `${reason} (CA reported: ${caMessage})`;
  }

  const suffix = [`[disposition=${hex}]`];
  if (opts?.requestId) suffix.push(`[requestId=${opts.requestId}]`);

  return `Active Directory Certificate Service did not issue the certificate.${reason ? ` ${reason}` : ""} ${suffix.join(" ")}`;
};

// CR_DISP_ISSUED: the CA issued the certificate (MS-WCCE ICertRequestD::Request disposition).
export const ADCS_DISPOSITION_ISSUED = 3;

export type AdcsRpcSuccess<T> = { ok: true; status: number; result: T };
export type AdcsRpcFailure = { ok: false; status: number; errorMessage: string };
export type AdcsRpcResponse<T> = AdcsRpcSuccess<T> | AdcsRpcFailure;

// Enrollment can take longer than a simple property read (CA policy modules,
// pending approval checks), so allow a generous ceiling.
export const ADCS_RPC_TIMEOUT_MS = 90_000;

export const callAdcsEndpoint = async <T>(args: {
  port: number;
  endpoint: AdcsRpcEndpoint;
  body: AdcsRpcRequestBody;
}): Promise<AdcsRpcResponse<T>> => {
  const payload = JSON.stringify(args.body);
  return new Promise<AdcsRpcResponse<T>>((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port: args.port,
        path: args.endpoint,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload).toString(),
          Connection: "close"
        },
        timeout: ADCS_RPC_TIMEOUT_MS
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          const status = res.statusCode ?? 0;
          if (!text) {
            resolve({ ok: false, status, errorMessage: `Empty response body from Gateway (status ${status})` });
            return;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(text);
          } catch {
            resolve({ ok: false, status, errorMessage: `Malformed response body from Gateway: ${text.slice(0, 256)}` });
            return;
          }
          if (status >= 200 && status < 300) {
            const { result } = parsed as { result?: T };
            if (result === undefined) {
              resolve({ ok: false, status, errorMessage: "Gateway response missing `result` field" });
              return;
            }
            resolve({ ok: true, status, result });
            return;
          }
          const errEnv = (parsed as { error?: { message?: string } }).error;
          resolve({ ok: false, status, errorMessage: errEnv?.message ?? `Gateway returned HTTP ${status}` });
        });
        res.on("error", (err) => {
          logger.warn({ err }, `ADCS RPC response stream error [port=${args.port}]`);
          reject(err);
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error(`ADCS RPC timed out after ${ADCS_RPC_TIMEOUT_MS}ms`));
    });
    req.on("error", (err) => {
      logger.warn({ err }, `ADCS RPC request error [port=${args.port}]`);
      reject(err);
    });
    req.write(payload);
    req.end();
  });
};
