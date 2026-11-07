// Load test for GET /api/v2/folders. Dependency-free; needs Node 18+.
// Seeds a deep folder tree, then measures latency and (optionally) container CPU per target.
import { execFileSync } from "node:child_process";

const env = process.env;
const TOKEN = env.TOKEN;
const PROJECT_IDS = (env.PROJECT_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
const ENVIRONMENT = env.ENVIRONMENT || "dev";
const DEPTH = Number(env.DEPTH || 8);
const BREADTH = Number(env.BREADTH || 3);
const DURATION_S = Number(env.DURATION_S || 30);
const CONCURRENCY = Number(env.CONCURRENCY || 16);
const SEED = env.SEED !== "false";
const RECURSIVE = env.RECURSIVE !== "false";
// TARGETS="node=http://localhost:8080,go=http://localhost:8081"; CONTAINERS="node=infisical-backend,go=infisical-backend-go"
const parsePairs = (v) => Object.fromEntries((v || "").split(",").filter(Boolean).map((p) => p.split(/=(.+)/).slice(0, 2)));
const TARGETS = parsePairs(env.TARGETS || "node=http://localhost:8080");
const CONTAINERS = parsePairs(env.CONTAINERS);

if (!TOKEN || PROJECT_IDS.length === 0) {
  console.error("TOKEN and PROJECT_IDS are required. See README.md.");
  process.exit(1);
}

const call = (base, method, path, body) =>
  fetch(`${base}${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined
  });

const seed = async (base, projectId) => {
  let created = 0;
  const walk = async (path, level) => {
    if (level >= DEPTH) return;
    for (let i = 0; i < BREADTH; i += 1) {
      const name = `lt-${level}-${i}`;
      const res = await call(base, "POST", "/api/v2/folders", { projectId, environment: ENVIRONMENT, name, path });
      // 400 means the folder already exists from a previous run
      if (!res.ok && res.status !== 400) throw new Error(`seed ${path}/${name}: ${res.status} ${await res.text()}`);
      created += 1;
      if (i === 0) await walk(`${path === "/" ? "" : path}/${name}`, level + 1);
    }
  };
  await walk("/", 0);
  return created;
};

const percentile = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

const cpuPercent = (container) => {
  try {
    return execFileSync("docker", ["stats", "--no-stream", "--format", "{{.CPUPerc}}", container], { encoding: "utf8" }).trim();
  } catch {
    return "n/a";
  }
};

const run = async (name, base) => {
  const latencies = [];
  let errors = 0;
  const deadline = Date.now() + DURATION_S * 1000;
  const worker = async (id) => {
    let n = id;
    while (Date.now() < deadline) {
      const projectId = PROJECT_IDS[n % PROJECT_IDS.length];
      n += 1;
      const qs = new URLSearchParams({ projectId, environment: ENVIRONMENT, path: "/", recursive: String(RECURSIVE) });
      const start = performance.now();
      try {
        const res = await call(base, "GET", `/api/v2/folders?${qs}`);
        await res.arrayBuffer();
        if (!res.ok) errors += 1;
      } catch {
        errors += 1;
      }
      latencies.push(performance.now() - start);
    }
  };
  const workers = Array.from({ length: CONCURRENCY }, (_, i) => worker(i));
  let cpu = "n/a";
  if (CONTAINERS[name]) {
    await new Promise((r) => setTimeout(r, (DURATION_S * 1000) / 2));
    cpu = cpuPercent(CONTAINERS[name]);
  }
  await Promise.all(workers);
  latencies.sort((a, b) => a - b);
  return {
    target: name,
    requests: latencies.length,
    rps: +(latencies.length / DURATION_S).toFixed(1),
    errors,
    p50_ms: +percentile(latencies, 50).toFixed(1),
    p95_ms: +percentile(latencies, 95).toFixed(1),
    p99_ms: +percentile(latencies, 99).toFixed(1),
    cpu_mid_run: cpu
  };
};

if (SEED) {
  const [seedBase] = Object.values(TARGETS);
  for (const id of PROJECT_IDS) console.error(`seeded ${await seed(seedBase, id)} folders in ${id}`);
}

const results = [];
for (const [name, base] of Object.entries(TARGETS)) results.push(await run(name, base));
console.table(results);
