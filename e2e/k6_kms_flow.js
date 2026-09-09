import http from 'k6/http';
import { check, fail } from 'k6';
import { Trend } from 'k6/metrics';

const signLatency = new Trend('kms_sign_latency', true);
const verifyLatency = new Trend('kms_verify_latency', true);
const updateLatency = new Trend('kms_update_latency', true);
const createLatency = new Trend('kms_create_latency', true);
const inventory = JSON.parse(open(__ENV.INVENTORY_FILE || '/scripts/kms_inventory.json'));
const rate = Number(__ENV.RATE || 10000);
const totalRequests = Number(__ENV.TOTAL_REQUESTS || 1000000);

export const options = {
  scenarios: {
    sign_verify: {
      executor: 'constant-arrival-rate', rate, timeUnit: '1s', duration: `${Math.ceil(totalRequests / rate)}s`,
      preAllocatedVUs: Number(__ENV.PREALLOCATED_VUS || 1000), maxVUs: Number(__ENV.MAX_VUS || 5000)
    }
  },
  thresholds: { http_req_failed: ['rate<0.01'], dropped_iterations: ['count==0'] },
  summaryTrendStats: ['avg', 'min', 'med', 'max', 'p(90)', 'p(95)', 'p(99)']
};

const baseUrl = __ENV.BASE_URL;
const apiPrefix = __ENV.API_PREFIX || 'api';
const hotKeyCount = Math.min(Number(__ENV.HOT_KEY_COUNT || 10), inventory.entries.length);
const hotRatio = Number(__ENV.HOT_RATIO || 0.9);
const signRatio = Number(__ENV.SIGN_RATIO || 0.5);
const hostHeader = __ENV.HOST_HEADER;
const traceSampleRate = Number(__ENV.TRACE_SAMPLE_RATE || 0);
const raftTraceSampleRate = Number(__ENV.RAFT_TRACE_SAMPLE_RATE || 0);
const operation = __ENV.OPERATION || 'all_other';

function headers(token) {
  const value = { 'Content-Type': 'application/json', 'User-Agent': 'infisical-k6-benchmark/1.0' };
  if (token) value.Authorization = `Bearer ${token}`;
  if (hostHeader) value.Host = hostHeader;
  return value;
}

function requestOptions(token, operation, requestId) {
  const value = headers(token);
  if (requestId) value['X-Request-Id'] = requestId;
  else if (apiPrefix === 'api-go' && Math.random() < traceSampleRate) value['X-Request-Id'] = `bench-trace-${__VU}-${__ITER}`;
  return { headers: value, tags: { name: `kms-${operation}` } };
}

export function setup() {
  if (!baseUrl || !inventory.entries || !inventory.entries.length) fail('BASE_URL and a non-empty inventory are required');
  const response = http.post(`${__ENV.AUTH_URL || baseUrl}/api/v3/auth/login`, JSON.stringify({ email: __ENV.ADMIN_EMAIL, password: __ENV.ADMIN_PASSWORD }), { headers: headers() });
  if (!check(response, { 'admin login succeeded': (r) => r.status === 200 && !!r.json('accessToken') })) fail(`admin login failed: HTTP ${response.status}`);
  const selection = http.post(`${__ENV.AUTH_URL || baseUrl}/api/v3/auth/select-organization`, JSON.stringify({ organizationId: __ENV.ORG_ID, userAgent: 'cli' }), requestOptions(response.json('accessToken'), 'select-organization'));
  if (!check(selection, { 'organization selected': (r) => r.status === 200 && !!r.json('token') })) fail(`organization selection failed: HTTP ${selection.status}`);
  return selection.json('token');
}

export default function (token) {
  const limit = Math.random() < hotRatio ? hotKeyCount : inventory.entries.length;
  const entry = inventory.entries[Math.floor(Math.random() * limit)];
  const keyUrl = `${baseUrl}/${apiPrefix}/v1/kms/keys/${entry.keyId}`;
  if (operation === 'create') {
    const response = http.post(`${baseUrl}/${apiPrefix}/v1/kms/keys`, JSON.stringify({
      projectId: entry.projectId,
      name: `k6-create-${__VU}-${__ITER}-${Date.now()}`,
      keyUsage: 'sign-verify', algorithm: 'ECC_NIST_P256', isExportable: false
    }), requestOptions(token, 'create'));
    createLatency.add(response.timings.duration);
    check(response, { 'create succeeded': (r) => r.status === 200 && !!r.json('key.id') });
    return;
  }
  // Only the sampled Go updates exercise the Raft cache hook. Selecting from
  // the hot set keeps every KMS replica's local metadata cache populated.
  if (apiPrefix === 'api-go' && Math.random() < raftTraceSampleRate) {
    const hotEntry = inventory.entries[Math.floor(Math.random() * hotKeyCount)];
    const requestId = `bench-raft-${__VU}-${__ITER}`;
    const response = http.patch(`${baseUrl}/${apiPrefix}/v1/kms/keys/${hotEntry.keyId}`,
      JSON.stringify({ description: `raft-sample-${__VU}-${__ITER}` }), requestOptions(token, 'update', requestId));
    updateLatency.add(response.timings.duration);
    check(response, { 'update succeeded': (r) => r.status === 200 && !!r.json('key.id') });
    return;
  }
  if (Math.random() < signRatio) {
    const response = http.post(`${keyUrl}/sign`, JSON.stringify({ data: entry.data, signingAlgorithm: 'ECDSA_SHA_256', isDigest: false }), requestOptions(token, 'sign'));
    signLatency.add(response.timings.duration);
    check(response, { 'sign succeeded': (r) => r.status === 200 && !!r.json('signature') });
  } else {
    const response = http.post(`${keyUrl}/verify`, JSON.stringify({ data: entry.data, signature: entry.signature, signingAlgorithm: 'ECDSA_SHA_256', isDigest: false }), requestOptions(token, 'verify'));
    verifyLatency.add(response.timings.duration);
    check(response, { 'verify succeeded': (r) => r.status === 200 && r.json('signatureValid') === true });
  }
}

// Failed thresholds make the Job fail and prevent kubectl cp from entering the
// terminated container. Keep a machine-readable copy in the Job log as well.
export function handleSummary(data) {
  // setup_data contains the short-lived authenticated token; it is not a
  // benchmark metric and must not be persisted in job logs or artifacts.
  delete data.setup_data;
  return { stdout: `K6_SUMMARY=${JSON.stringify(data)}\n` };
}
