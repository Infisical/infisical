/* eslint-disable @typescript-eslint/ban-types */
/* eslint-disable func-names */
/* eslint-disable @typescript-eslint/no-shadow */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable prefer-destructuring */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unsafe-return */

// Credit: https://github.com/octokit/request.js

import { endpoint } from "@octokit/endpoint";
import { RequestError } from "@octokit/request-error";
import type {
  EndpointInterface,
  EndpointOptions,
  OctokitResponse,
  RequestInterface,
  RequestParameters,
  Route
} from "@octokit/types";
import { safeParse } from "fast-content-type-parse";
import { getUserAgent } from "universal-user-agent";

type ContentType = ReturnType<typeof safeParse>;

function isJSONResponse(mimetype: ContentType): boolean {
  return mimetype.type === "application/json" || mimetype.type === "application/scim+json";
}

async function getResponseData(response: Response): Promise<any> {
  const contentType = response.headers.get("content-type");

  if (!contentType) {
    return response.text().catch(() => "");
  }

  const mimetype = safeParse(contentType);

  if (isJSONResponse(mimetype)) {
    let text = "";
    try {
      text = await response.text();
      return JSON.parse(text);
    } catch (err) {
      return text;
    }
  } else if (mimetype.type.startsWith("text/") || mimetype.parameters.charset?.toLowerCase() === "utf-8") {
    return response.text().catch(() => "");
  } else {
    return response.arrayBuffer().catch(() => new ArrayBuffer(0));
  }
}

function toErrorMessage(data: string | ArrayBuffer | Record<string, unknown>) {
  if (typeof data === "string") {
    return data;
  }

  if (data instanceof ArrayBuffer) {
    return "Unknown error";
  }

  if ("message" in data) {
    const suffix = "documentation_url" in data ? ` - ${data.documentation_url}` : "";

    return Array.isArray(data.errors)
      ? `${data.message}: ${data.errors.map((v) => JSON.stringify(v)).join(", ")}${suffix}`
      : `${data.message}${suffix}`;
  }

  return `Unknown error: ${JSON.stringify(data)}`;
}

function isPlainObject(value: unknown): value is Object {
  if (typeof value !== "object" || value === null) return false;

  if (Object.prototype.toString.call(value) !== "[object Object]") return false;

  const proto = Object.getPrototypeOf(value);
  if (proto === null) return true;

  const Ctor = Object.prototype.hasOwnProperty.call(proto, "constructor") && proto.constructor;
  return (
    typeof Ctor === "function" &&
    Ctor instanceof Ctor &&
    Function.prototype.call(Ctor) === Function.prototype.call(value)
  );
}

async function fetchWrapper(requestOptions: ReturnType<EndpointInterface>): Promise<OctokitResponse<any>> {
  const fetch: typeof globalThis.fetch = requestOptions.request?.fetch || globalThis.fetch;

  if (!fetch) {
    throw new Error(
      "fetch is not set. Please pass a fetch implementation as new Octokit({ request: { fetch }}). Learn more at https://github.com/octokit/octokit.js/#fetch-missing"
    );
  }

  const log = requestOptions.request?.log || console;
  const parseSuccessResponseBody = requestOptions.request?.parseSuccessResponseBody !== false;

  const body =
    isPlainObject(requestOptions.body) || Array.isArray(requestOptions.body)
      ? JSON.stringify(requestOptions.body)
      : requestOptions.body;

  // Header values must be `string`
  const requestHeaders = Object.fromEntries(
    Object.entries(requestOptions.headers).map(([name, value]) => [name, String(value)])
  );

  let fetchResponse: Response;

  try {
    fetchResponse = await fetch(requestOptions.url, {
      method: requestOptions.method,
      body,
      redirect: requestOptions.request?.redirect,
      headers: requestHeaders,
      signal: requestOptions.request?.signal,
      // duplex must be set if request.body is ReadableStream or Async Iterables.
      // See https://fetch.spec.whatwg.org/#dom-requestinit-duplex.
      ...(requestOptions.body && { duplex: "half" })
    });
    // wrap fetch errors as RequestError if it is not a AbortError
  } catch (error) {
    let message = "Unknown Error";
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        (error as RequestError).status = 500;
        throw error;
      }

      message = error.message;

      // undici throws a TypeError for network errors
      // and puts the error message in `error.cause`
      // https://github.com/nodejs/undici/blob/e5c9d703e63cd5ad691b8ce26e3f9a81c598f2e3/lib/fetch/index.js#L227
      if (error.name === "TypeError" && "cause" in error) {
        if (error.cause instanceof Error) {
          message = error.cause.message;
        } else if (typeof error.cause === "string") {
          message = error.cause;
        }
      }
    }

    const requestError = new RequestError(message, 500, {
      request: requestOptions
    });
    requestError.cause = error;

    throw requestError;
  }

  const status = fetchResponse.status;
  const url = fetchResponse.url;
  const responseHeaders: { [header: string]: string } = {};

  fetchResponse.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  const octokitResponse: OctokitResponse<any> = {
    url,
    status,
    headers: responseHeaders,
    data: ""
  };

  if ("deprecation" in responseHeaders) {
    const matches = responseHeaders.link && responseHeaders.link.match(/<([^<>]+)>; rel="deprecation"/);
    const deprecationLink = matches && matches.pop();
    log.warn(
      `[@octokit/request] "${requestOptions.method} ${
        requestOptions.url
      }" is deprecated. It is scheduled to be removed on ${responseHeaders.sunset}${
        deprecationLink ? `. See ${deprecationLink}` : ""
      }`
    );
  }

  if (status === 204 || status === 205) {
    return octokitResponse;
  }

  // GitHub API returns 200 for HEAD requests
  if (requestOptions.method === "HEAD") {
    if (status < 400) {
      return octokitResponse;
    }

    throw new RequestError(fetchResponse.statusText, status, {
      response: octokitResponse,
      request: requestOptions
    });
  }

  if (status === 304) {
    octokitResponse.data = await getResponseData(fetchResponse);

    throw new RequestError("Not modified", status, {
      response: octokitResponse,
      request: requestOptions
    });
  }

  if (status >= 400) {
    octokitResponse.data = await getResponseData(fetchResponse);

    throw new RequestError(toErrorMessage(octokitResponse.data), status, {
      response: octokitResponse,
      request: requestOptions
    });
  }

  octokitResponse.data = parseSuccessResponseBody ? await getResponseData(fetchResponse) : fetchResponse.body;

  return octokitResponse;
}

function withDefaults(oldEndpoint: EndpointInterface, newDefaults: RequestParameters): RequestInterface {
  const endpoint = oldEndpoint.defaults(newDefaults);
  const newApi = function (
    route: Route | EndpointOptions,
    parameters?: RequestParameters
  ): Promise<OctokitResponse<any>> {
    const endpointOptions = endpoint.merge(<Route>route, parameters);

    if (!endpointOptions.request || !endpointOptions.request.hook) {
      return fetchWrapper(endpoint.parse(endpointOptions));
    }

    const request = (route: Route | EndpointOptions, parameters?: RequestParameters) => {
      return fetchWrapper(endpoint.parse(endpoint.merge(<Route>route, parameters)));
    };

    Object.assign(request, {
      endpoint,
      defaults: withDefaults.bind(null, endpoint)
    });

    return endpointOptions.request.hook(request, endpointOptions);
  };

  return Object.assign(newApi, {
    endpoint,
    defaults: withDefaults.bind(null, endpoint)
  }) as RequestInterface<typeof endpoint.DEFAULTS & typeof newDefaults>;
}

export const request = withDefaults(endpoint, {
  headers: {
    "user-agent": `octokit-request.js/0.0.0-development ${getUserAgent()}`
  }
});
