import axios from "axios";
import fp from "fastify-plugin";

import { logger } from "@app/lib/logger";

const SHADOWED_ROUTES: { method: string; url: string }[] = [
  { method: "GET", url: "/api/v3/secrets/raw/:secretName" },
  { method: "GET", url: "/api/v3/secrets/raw" },
  { method: "GET", url: "/api/v4/secrets/:secretName" },
  { method: "GET", url: "/api/v4/secrets" }
];

const SENSITIVE_FIELDS = new Set([
  "secretValue",
  "secretValueCiphertext",
  "secretValueIV",
  "secretValueTag",
  "secretValueHidden",
  "value",
  "valueOverride",
  "secretComment",
  "secretCommentCiphertext",
  "secretCommentIV",
  "secretCommentTag"
]);

type ComparisonDiff = {
  path: string;
  type: "missing_in_go" | "missing_in_node" | "type_mismatch" | "value_mismatch";
  nodeValue?: unknown;
  goValue?: unknown;
};

const isSensitiveField = (fieldName: string): boolean => {
  return SENSITIVE_FIELDS.has(fieldName);
};

// Skip workspace field inside imports[].secrets[] - intentional difference
// Node returns "" for legacy Python SDK compat, Go returns actual projectId
const isIgnoredImportField = (path: string, fieldName: string): boolean => {
  if (fieldName === "workspace" && /^imports\[\d+\]\.secrets\[\d+\]$/.test(path)) {
    return true;
  }
  return false;
};

const isEmpty = (value: unknown): boolean => {
  if (value === null || value === undefined || value === "") {
    return true;
  }
  if (Array.isArray(value) && value.length === 0) {
    return true;
  }
  return false;
};

const compareResponses = (
  nodeResponse: unknown,
  goResponse: unknown,
  path: string = "",
  diffs: ComparisonDiff[] = []
): ComparisonDiff[] => {
  const nodeEmpty = isEmpty(nodeResponse);
  const goEmpty = isEmpty(goResponse);

  if (nodeEmpty && goEmpty) {
    return diffs;
  }

  if (nodeEmpty !== goEmpty) {
    let nodeValue: unknown;
    let goValue: unknown;

    if (!nodeEmpty) {
      nodeValue = typeof nodeResponse === "object" ? "[object]" : nodeResponse;
    }
    if (!goEmpty) {
      goValue = typeof goResponse === "object" ? "[object]" : goResponse;
    }

    diffs.push({
      path: path || "root",
      type: nodeEmpty ? "missing_in_node" : "missing_in_go",
      nodeValue,
      goValue
    });
    return diffs;
  }

  const nodeType = Array.isArray(nodeResponse) ? "array" : typeof nodeResponse;
  const goType = Array.isArray(goResponse) ? "array" : typeof goResponse;

  if (nodeType !== goType) {
    diffs.push({
      path: path || "root",
      type: "type_mismatch",
      nodeValue: `type: ${nodeType}`,
      goValue: `type: ${goType}`
    });
    return diffs;
  }

  if (nodeType === "array") {
    const nodeArr = nodeResponse as unknown[];
    const goArr = goResponse as unknown[];

    if (nodeArr.length !== goArr.length) {
      diffs.push({
        path: `${path}.length`,
        type: "value_mismatch",
        nodeValue: nodeArr.length,
        goValue: goArr.length
      });
    }

    const minLength = Math.min(nodeArr.length, goArr.length);
    for (let i = 0; i < minLength; i += 1) {
      compareResponses(nodeArr[i], goArr[i], `${path}[${i}]`, diffs);
    }
  } else if (nodeType === "object" && nodeResponse !== null && goResponse !== null) {
    const nodeObj = nodeResponse as Record<string, unknown>;
    const goObj = goResponse as Record<string, unknown>;

    const allKeys = new Set([...Object.keys(nodeObj), ...Object.keys(goObj)]);

    for (const key of allKeys) {
      const fieldPath = path ? `${path}.${key}` : key;

      if (!isSensitiveField(key) && !isIgnoredImportField(path, key)) {
        const inNode = key in nodeObj;
        const inGo = key in goObj;

        if (inNode && !inGo) {
          if (!isEmpty(nodeObj[key])) {
            diffs.push({
              path: fieldPath,
              type: "missing_in_go",
              nodeValue: typeof nodeObj[key] === "object" ? "[object]" : nodeObj[key]
            });
          }
        } else if (!inNode && inGo) {
          if (!isEmpty(goObj[key])) {
            diffs.push({
              path: fieldPath,
              type: "missing_in_node",
              goValue: typeof goObj[key] === "object" ? "[object]" : goObj[key]
            });
          }
        } else {
          compareResponses(nodeObj[key], goObj[key], fieldPath, diffs);
        }
      }
    }
  } else if (nodeResponse !== goResponse) {
    diffs.push({
      path: path || "root",
      type: "value_mismatch",
      nodeValue: nodeResponse,
      goValue: goResponse
    });
  }

  return diffs;
};

export const shadowToGoSidecar = fp(async (server, opt: { sidecarUrl: string; sampleRate: number }) => {
  const routeSet = new Set(SHADOWED_ROUTES.map((r) => `${r.method}:${r.url}`));
  const sampleRate = Math.max(0, Math.min(100, opt.sampleRate));

  server.addHook("onSend", async (request, reply, payload) => {
    const key = `${request.method}:${request.routeOptions.url}`;

    if (!routeSet.has(key)) {
      return payload;
    }

    if (Math.random() * 100 >= sampleRate) {
      return payload;
    }

    if (reply.statusCode >= 400) {
      return payload;
    }

    const requestId = request.id;
    const routeUrl = request.routeOptions.url;

    const shadowRequest = async () => {
      try {
        const headers: Record<string, string> = {};
        for (const [headerKey, headerValue] of Object.entries(request.headers)) {
          if (typeof headerValue === "string") {
            headers[headerKey] = headerValue;
          } else if (Array.isArray(headerValue)) {
            headers[headerKey] = headerValue.join(", ");
          }
        }

        headers["X-Request-Id"] = requestId;
        headers["X-Real-Ip"] = request.realIp;
        delete headers.host;
        delete headers["content-length"];

        const goResponse = await axios({
          method: request.method,
          url: new URL(request.url, opt.sidecarUrl).href,
          headers,
          timeout: 30000,
          validateStatus: () => true
        });

        if (goResponse.status !== reply.statusCode) {
          logger.error(
            {
              requestId,
              route: routeUrl,
              nodeStatus: reply.statusCode,
              goStatus: goResponse.status
            },
            `[Shadow:error] Status code mismatch [requestId=${requestId}] [route=${routeUrl}] [nodeStatus=${reply.statusCode}] [goStatus=${goResponse.status}]`
          );
          return;
        }

        let nodeData: unknown;
        try {
          nodeData = typeof payload === "string" ? JSON.parse(payload) : payload;
        } catch {
          logger.error(
            { requestId, route: routeUrl },
            `[Shadow:error] Could not parse Node.js response as JSON [requestId=${requestId}]`
          );
          return;
        }

        const goData = goResponse.data as unknown;
        const diffs = compareResponses(nodeData, goData);

        if (diffs.length > 0) {
          const missingInGo = diffs.filter((d) => d.type === "missing_in_go");
          const missingInNode = diffs.filter((d) => d.type === "missing_in_node");
          const valueMismatches = diffs.filter((d) => d.type === "value_mismatch" || d.type === "type_mismatch");

          logger.error(
            {
              requestId,
              route: routeUrl,
              totalDiffs: diffs.length,
              missingInGo: missingInGo.map((d) => d.path),
              missingInNode: missingInNode.map((d) => d.path),
              valueMismatches: valueMismatches.map((d) => ({
                path: d.path,
                type: d.type,
                nodeValue: d.nodeValue,
                goValue: d.goValue
              }))
            },
            `[Shadow:error] Response differences found [requestId=${requestId}] [route=${routeUrl}] [diffCount=${diffs.length}]`
          );
        } else {
          logger.info(
            { requestId, route: routeUrl },
            `[Shadow:success] Responses match [requestId=${requestId}] [route=${routeUrl}]`
          );
        }
      } catch (error) {
        logger.error(
          {
            requestId,
            route: routeUrl,
            error: error instanceof Error ? { name: error.name, message: error.message } : String(error)
          },
          `[Shadow:error] Failed to shadow request to Go sidecar [requestId=${requestId}] [route=${routeUrl}]`
        );
      }
    };

    setImmediate(() => {
      void shadowRequest();
    });

    return payload;
  });
});
