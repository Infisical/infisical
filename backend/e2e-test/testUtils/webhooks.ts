type TWebhook = {
  id: string;
  lastStatus: string | null;
  lastRunErrorMessage: string | null;
};

export const createWebhook = async (dto: {
  projectId: string;
  environmentSlug: string;
  secretPath?: string;
  webhookUrl: string;
  authToken: string;
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: "/api/v1/webhooks",
    headers: { authorization: `Bearer ${dto.authToken}` },
    body: {
      projectId: dto.projectId,
      environment: dto.environmentSlug,
      webhookUrl: dto.webhookUrl,
      secretPath: dto.secretPath ?? "/"
    }
  });
  expect(res.statusCode).toBe(200);
  return res.json().webhook as TWebhook;
};

export const getWebhook = async (dto: { webhookId: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "GET",
    url: `/api/v1/webhooks/${dto.webhookId}`,
    headers: { authorization: `Bearer ${dto.authToken}` }
  });
  expect(res.statusCode).toBe(200);
  return res.json().webhook as TWebhook;
};

const POLL_TIMEOUT_MS = 3_000;
const POLL_INTERVAL_MS = 100;

// The webhook trigger job runs with a 1s debounce delay plus whatever the receiver takes to
// respond, so lastStatus flips some time after the secret write that queued it, not immediately.
export const waitForWebhookRun = async (dto: { webhookId: string; authToken: string }) => {
  const deadline = Date.now() + POLL_TIMEOUT_MS;

  for (;;) {
    // eslint-disable-next-line no-await-in-loop
    const webhook = await getWebhook(dto);
    if (webhook.lastStatus !== null) return webhook;

    if (Date.now() >= deadline) {
      throw new Error(`Timed out after ${POLL_TIMEOUT_MS}ms waiting for webhook "${dto.webhookId}" to run`);
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }
};
