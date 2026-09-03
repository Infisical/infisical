/**
 * Thin typed client over the Infisical API, covering only what fixtures need.
 *
 * Every route and body shape here was read off the router source rather than inferred, and
 * each is noted with its definition site so a route move is traceable. The e2e suite has the
 * same discipline for the same reason: a silently moved prefix turns into a confusing
 * fixture failure rather than an obvious one.
 */

export type ApiErrorBody = { message?: string; error?: string; statusCode?: number };

export class ApiError extends Error {
  readonly status: number;

  readonly method: string;

  readonly path: string;

  readonly body: unknown;

  constructor(method: string, path: string, status: number, body: unknown) {
    const detail =
      body && typeof body === "object" && typeof (body as ApiErrorBody).message === "string"
        ? (body as ApiErrorBody).message
        : JSON.stringify(body);
    super(`${method} ${path} failed with ${status}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.method = method;
    this.path = path;
    this.body = body;
  }
}

export type RequestOptions = {
  token?: string;
  /** Returned so callers can harvest the `jid` refresh cookie. */
  wantSetCookie?: boolean;
};

export type ApiResponse<T> = {
  data: T;
  setCookie: string[];
};

export class InfisicalApi {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options: RequestOptions = {}
  ): Promise<ApiResponse<T>> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (options.token) headers.authorization = `Bearer ${options.token}`;

    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      // Cookies are harvested explicitly rather than tracked by the client, because the
      // browser context is where they actually need to land.
      redirect: "manual"
    });

    const text = await response.text();
    let parsed: unknown = null;
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!response.ok) throw new ApiError(method, path, response.status, parsed);

    return {
      data: parsed as T,
      setCookie: response.headers.getSetCookie?.() ?? []
    };
  }

  get<T>(path: string, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>("GET", path, undefined, options);
  }

  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>("POST", path, body, options);
  }

  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<ApiResponse<T>> {
    return this.request<T>("PATCH", path, body, options);
  }

  // -------------------------------------------------------------------------
  // Instance lifecycle
  // -------------------------------------------------------------------------

  /** `GET /api/status`. What docker-compose's healthcheck uses. */
  async status(): Promise<boolean> {
    try {
      await this.get("/api/status");
      return true;
    } catch {
      return false;
    }
  }

  /** `GET /api/v1/admin/config` (admin-router.ts:75). Unauthenticated readiness probe. */
  async adminConfig(): Promise<{ initialized: boolean; allowSignUp: boolean }> {
    const { data } = await this.get<{ initialized: boolean; allowSignUp: boolean }>(
      "/api/v1/admin/config"
    );
    return data;
  }

  /**
   * `POST /api/v1/admin/bootstrap` (admin-router.ts:801). Unauthenticated and one-shot:
   * it throws once `serverCfg.initialized` is true.
   *
   * Returns a machine identity token, NOT a browser session. Do not try to pre-authenticate
   * a browser with it; see createBrowserSession for the path that actually works.
   */
  async bootstrap(params: {
    email: string;
    password: string;
    organization: string;
  }): Promise<BootstrapResult> {
    const { data } = await this.post<BootstrapResult>("/api/v1/admin/bootstrap", params);
    return data;
  }

  /**
   * `PATCH /api/v1/admin/config` (admin-router.ts:145). Requires a super-admin JWT.
   *
   * Needed because bootstrap leaves `super_admin.onboardingCompleted` at its column default
   * of false, and authenticate.tsx:83 redirects any super-admin to /admin/setup while that
   * is false. Without this every navigation lands on a four-step instance onboarding wizard
   * instead of the page under test.
   */
  async completeOnboarding(token: string): Promise<void> {
    await this.patch("/api/v1/admin/config", { onboardingCompleted: true }, { token });
  }

  // -------------------------------------------------------------------------
  // Auth
  // -------------------------------------------------------------------------

  /**
   * `POST /api/v3/auth/login` (v3/login-router.ts:210). The non-SRP route the frontend
   * itself uses; the SRP login1/login2 pair is vestigial and login2 does not even verify
   * the client proof. Returns an org-less access token and sets the `jid` refresh cookie.
   */
  async login(email: string, password: string): Promise<{ accessToken: string; jid: string }> {
    const { data, setCookie } = await this.post<{ accessToken: string }>(
      "/api/v3/auth/login",
      { email, password }
    );
    return { accessToken: data.accessToken, jid: extractCookie(setCookie, "jid") ?? "" };
  }

  /**
   * `POST /api/v3/auth/select-organization` (v3/login-router.ts:47). Required: the token
   * from login carries no organizationId, and the frontend route guard redirects to
   * /login/select-organization until it does.
   */
  async selectOrganization(
    accessToken: string,
    organizationId: string
  ): Promise<{ token: string; jid: string }> {
    const { data, setCookie } = await this.post<{ token: string }>(
      "/api/v3/auth/select-organization",
      { organizationId },
      { token: accessToken }
    );
    return { token: data.token, jid: extractCookie(setCookie, "jid") ?? "" };
  }

  // -------------------------------------------------------------------------
  // Resources
  // -------------------------------------------------------------------------

  /** `POST /api/v1/projects` (v1/project-router.ts:187, prefix at v1/index.ts:183). */
  async createProject(
    token: string,
    params: { projectName: string; type?: string; shouldCreateDefaultEnvs?: boolean }
  ): Promise<ProjectResult> {
    const { data } = await this.post<{ project: ProjectResult }>(
      "/api/v1/projects",
      { shouldCreateDefaultEnvs: true, ...params },
      { token }
    );
    return data.project;
  }

  /** `POST /api/v4/secrets/:secretName` (v4/secret-router.ts:424). */
  async createSecret(
    token: string,
    params: {
      secretName: string;
      projectId: string;
      environment: string;
      secretValue: string;
      secretPath?: string;
    }
  ): Promise<void> {
    const { secretName, ...body } = params;
    await this.post(
      `/api/v4/secrets/${encodeURIComponent(secretName)}`,
      { secretPath: "/", ...body },
      { token }
    );
  }

  /**
   * `POST /api/v2/folders` (v2/secret-folder-router.ts:19, prefix at v2/index.ts:48).
   * Note v1/folders is the deprecated router; the current one is v2.
   */
  async createFolder(
    token: string,
    params: { projectId: string; environment: string; name: string; path?: string }
  ): Promise<void> {
    await this.post("/api/v2/folders", { path: "/", ...params }, { token });
  }

  /**
   * `POST /api/v1/projects/:projectId/identities` (v1/project-identity-router.ts:38).
   *
   * A machine identity is the second principal the access-control guides need. It is
   * deliberately not a second human user: bootstrapInstance sets allowSignUp=false on
   * non-cloud instances and the stack has no SMTP, so an invited user could never complete
   * signup. Both guides explicitly cover "user or machine identity", so this exercises a
   * documented path rather than a workaround.
   */
  async createProjectIdentity(
    token: string,
    params: { projectId: string; name: string; role?: string }
  ): Promise<{ id: string; name: string }> {
    const { projectId, name, role } = params;
    const { data } = await this.post<{ identity: { id: string; name: string } }>(
      `/api/v1/projects/${encodeURIComponent(projectId)}/identities`,
      { name, roles: [{ role: role ?? "member" }] },
      { token }
    );
    return data.identity;
  }

  /** `GET /api/v2/organizations/:organizationId/workspaces` (v2/organization-router.ts:65). */
  async listProjects(token: string, organizationId: string): Promise<ProjectResult[]> {
    const { data } = await this.get<{ workspaces: ProjectResult[] }>(
      `/api/v2/organizations/${encodeURIComponent(organizationId)}/workspaces`,
      { token }
    );
    return data.workspaces;
  }
}

export type BootstrapResult = {
  message: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    superAdmin: boolean;
  };
  organization: { id: string; name: string; slug: string };
  identity: { id: string; name: string; credentials: { token: string } };
};

export type ProjectResult = {
  id: string;
  name: string;
  slug: string;
  environments?: { id: string; name: string; slug: string }[];
};

/** Pulls one cookie's value out of a Set-Cookie header list. */
export const extractCookie = (setCookie: string[], name: string): string | null => {
  for (const header of setCookie) {
    const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
    if (match?.[1]) return match[1];
  }
  return null;
};
