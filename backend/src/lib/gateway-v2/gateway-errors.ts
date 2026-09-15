/**
 * A gateway id that resolves to no gateway is never safe to treat as "no gateway configured": the
 * resource is pinned to it, so dialling the target directly would bypass the network boundary the
 * gateway exists to enforce. Every caller turns this into a 404 instead.
 *
 * The most likely reason a caller lands here is a resource still pointing at a legacy gateway.
 * Those rows are retained but no longer read, and there is no in-place upgrade for one, so the
 * message names that outcome and asks for a new gateway rather than implying the old id can be
 * recovered.
 */
export const getMissingGatewayMessage = (gatewayId: string) =>
  `Gateway with ID '${gatewayId}' was not found. It was either deleted, or created on the legacy gateway system, which is no longer supported. Deploy a new gateway under Organization Settings > Networking and select it on this resource, or remove the gateway to connect directly.`;

/**
 * Used where the resource is known to point at a legacy gateway, so the message can state the
 * cause outright instead of offering it as one possibility.
 */
export const getRetiredGatewayMessage = (resourceDescription: string) =>
  `${resourceDescription} is attached to a gateway created on the legacy gateway system, which is no longer supported. Deploy a new gateway under Organization Settings > Networking and select it, or remove the gateway to connect directly.`;
