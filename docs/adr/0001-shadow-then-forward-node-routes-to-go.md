# Shadow, then forward, Node routes to Go

Routes move from Node to Go in three stages: shadowed (Node answers, a sample is also sent to Go and compared), forwarded (Go answers, Node stays as the fallback for one release), then the Node route is deleted as a separate decision. We chose this over a direct cutover because a regression is any change in status code or error message, and only comparing real traffic can show there is none.

Forwarding is enabled per route and per org, and the forwarding plugin sends Go only the auth modes it supports (deprecated `API_KEY` stays on Node permanently). A read that fails on Go with a connection error, timeout or 5xx is retried on Node; mutations are never retried. Behaviour bugs are fixed in Node before the port, never during it, so shadow diffs stay meaningful.

## Consequences

- A PR that touches a forwarded route must change both Node and Go and keep the blackbox suite green.
- Two implementations of each forwarded route exist until the Node route is deleted.
