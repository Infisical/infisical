import { randomBytes, randomUUID } from "node:crypto";

export type TPamWebServerBrowserSession = {
  id: string;
  accountId: string;
  userId: string;
  pamSessionId: string;
  upstreamUrl: URL;
  relayPort: number;
  authorization: string;
  expiresAt: Date;
  cookieSecret: string;
  cookieJar: Map<string, string>;
};

type TStoredSession = TPamWebServerBrowserSession & {
  cleanup: () => Promise<void>;
  expiryTimer: ReturnType<typeof setTimeout>;
};

export const createPamWebServerSessionManager = () => {
  const sessions = new Map<string, TStoredSession>();

  const closeSession = async (id: string): Promise<void> => {
    const session = sessions.get(id);
    if (!session) return;

    sessions.delete(id);
    clearTimeout(session.expiryTimer);
    await session.cleanup();
  };

  const createSession = ({
    accountId,
    userId,
    pamSessionId,
    upstreamUrl,
    relayPort,
    authorization,
    expiresAt,
    cleanup
  }: Omit<TPamWebServerBrowserSession, "id" | "cookieSecret" | "cookieJar"> & {
    cleanup: () => Promise<void>;
  }): TPamWebServerBrowserSession => {
    const id = randomUUID();
    const cookieSecret = randomBytes(32).toString("base64url");
    const expiryTimer = setTimeout(
      () => {
        void closeSession(id).catch(() => undefined);
      },
      Math.max(0, expiresAt.getTime() - Date.now())
    );

    const session: TStoredSession = {
      id,
      accountId,
      userId,
      pamSessionId,
      upstreamUrl,
      relayPort,
      authorization,
      expiresAt,
      cookieSecret,
      cookieJar: new Map<string, string>(),
      cleanup,
      expiryTimer
    };

    sessions.set(id, session);
    return session;
  };

  const getSession = (id: string, accountId: string, cookieSecret: string): TPamWebServerBrowserSession | null => {
    const session = sessions.get(id);
    if (!session || session.accountId !== accountId || session.cookieSecret !== cookieSecret) return null;
    if (session.expiresAt.getTime() <= Date.now()) {
      void closeSession(id).catch(() => undefined);
      return null;
    }
    return session;
  };

  return { createSession, getSession, closeSession };
};
