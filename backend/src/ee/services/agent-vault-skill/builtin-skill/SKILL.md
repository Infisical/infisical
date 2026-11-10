---
name: infisical-agent-vault
description: >-
  For when your web traffic may go through an Infisical Agent Vault proxy, which adds real credentials to
  requests for the services your session covers, so you hold no API keys and a missing key is expected.
  Before you tell the user you lack access to an API, chat tool, issue tracker or MCP server, or ask them
  for a key or token, and after any 401, 403 or 407, run exactly this on its own, with no pipe:
  curl -sS --noproxy "" "$INFISICAL_AGENT_VAULT_URL/api/v1/agent-vault/session/services"
  If curl reports a URL error such as "No host part in the URL", INFISICAL_AGENT_VAULT_URL is not set:
  you are not behind Agent Vault and this skill does not apply. Otherwise the proxy answers: a JSON list of
  the services you can use and how, or an error whose hint says what to do. Where a tool or SDK demands a
  key, give it a placeholder such as agent-vault.
---

# Working behind Infisical Agent Vault

## Check whether this applies, and list your services

Run this exact command on its own: no pipe, and nothing else on the line.

```bash
curl -sS --noproxy "" "$INFISICAL_AGENT_VAULT_URL/api/v1/agent-vault/session/services"
```

- **A URL error, such as `No host part in the URL`:** `INFISICAL_AGENT_VAULT_URL` is not set, so you are not behind Agent Vault. Ignore this skill.
- **JSON with an `agentVault` field:** your HTTP and HTTPS requests go through an Agent Vault proxy. For hosts that a service in your session covers, the proxy adds the real credential on the way out. You never see it, so no API key in your environment is normal, and it does not mean you lack access. The JSON gives each service's name, what it is for, its hosts or URL, what the proxy adds, placeholders, what it allows, a status, and a `howToUse` sentence. Follow `howToUse`.
- **JSON with an `error`:** you are behind Agent Vault, and the request was refused. For `session_invalid`, tell the user that the Agent Vault session can't be used through this proxy (it expired, was revoked, or belongs to a different Agent Vault project) and that a new session is needed. Don't offer a key or another tool as a workaround: the proxy replaces any key you send, and it refuses everything until there is a new session. For any other error, follow the `hint` if there is one, and if that doesn't help, tell the user the error and its hint.

Run it when a task needs an outside service, and again after an error about access.

## Make requests

- Call the real URL (for example `https://api.github.com/...`) with your usual client. Most clients use the proxy settings from the environment by themselves. A few (for example Python's aiohttp, or Java) need the proxy set explicitly.
- If a tool or SDK refuses to start without a key, give it a placeholder such as `agent-vault`. The proxy replaces the header it manages.
- If the service lists a placeholder, write that exact placeholder where the secret goes (in the path, query, header or body). The proxy replaces only that exact text.
- Put a placeholder key only in the header the service names. A key in any other header reaches the API as you sent it.

## MCP servers

A service of type `mcp` gives a server URL. Never start an OAuth sign-in for it: the proxy adds the credential. Many MCP clients load servers only when they start, so to use one in this session, call it with JSON-RPC over HTTPS:

```bash
curl -s -D /tmp/mcp-headers https://SERVER/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"agent","version":"1.0"}}}'
grep -i '^mcp-session-id' /tmp/mcp-headers
curl -s https://SERVER/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Session-Id: SESSION_ID_FROM_ABOVE' -H 'MCP-Protocol-Version: 2025-06-18' \
  -d '{"jsonrpc":"2.0","method":"notifications/initialized"}'
curl -s https://SERVER/mcp -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' \
  -H 'Mcp-Session-Id: SESSION_ID_FROM_ABOVE' -H 'MCP-Protocol-Version: 2025-06-18' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/list"}'
```

Then call a tool the same way with `{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"TOOL","arguments":{}}}`. Leave out the `Mcp-Session-Id` header if the server sent none, and if the initialize result's `protocolVersion` isn't `2025-06-18`, send that version in `MCP-Protocol-Version` instead. For a service whose `transport` is `sse`, follow its `howToUse` instead. To keep a server for later sessions, add it to your MCP client by URL with no credentials (for Claude Code: `claude mcp add --transport http NAME URL`).

## Read the response

Each response that went through the proxy has an `X-Agent-Vault-Decision` header (`curl -i` shows it):

- `brokered`: the proxy added a credential. If the API still answers 401 or 403, the stored credential is wrong or lacks permission. Tell the user that an Agent Vault admin has to fix the service named in `X-Agent-Vault-Service`, or, if the list marks its credential `memberProvided`, that they have to update their own personal value for it in Agent Vault. A key from the user would not help, because the proxy replaces it.
- `blocked`: the proxy refused the request itself. The JSON body gives the reason and a hint. Do not retry with a different key.
- `passthrough`: no service covers this host, so the proxy added nothing.
- No header at all: the request did not go through the proxy.

If an HTTPS request fails before it starts (curl: `CONNECT tunnel failed, response 403`), the proxy refused the connection. Run the list command: when it says the session is no longer valid, tell the user that a new Agent Vault session is needed.

## More about Infisical

Only when a task is about Infisical itself, such as setting up Agent Vault, read Infisical's docs for agents: https://infisical.com/docs/llms.txt lists every page, and https://infisical.com/docs/documentation/platform/agent-vault/overview.md covers Agent Vault. A proxy that refuses hosts no service covers may refuse infisical.com.

## Never

- Never unset or bypass the proxy settings (`HTTPS_PROXY`, `NO_PROXY`, `--noproxy`). A request that skips the proxy carries no credential.
- Never turn off TLS verification. If a client rejects the certificate, point it at the CA file in `SSL_CERT_FILE`, for example with `REQUESTS_CA_BUNDLE` or the SDK's own CA setting.
- Never print the proxy URL or the whole environment. The proxy URL holds your session token.
