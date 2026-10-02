import http from "node:http";
import https from "node:https";

// Pool of agents keyed by connection signature for connection reuse across
// repeated calls. The cache key includes the validated IP set so DNS record
// changes naturally produce a fresh entry. Insertion order doubles as LRU
// recency, so eviction at the cap drops the least recently used entry.
export const AGENT_CACHE_MAX = 200;
export const agentCache = new Map<string, http.Agent | https.Agent>();

export const getAgentPoolStats = () => ({ size: agentCache.size, max: AGENT_CACHE_MAX });
