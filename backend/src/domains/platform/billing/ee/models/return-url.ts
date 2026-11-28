import { ExternalSystemError } from "@app/domains/lib/errors";

const failure = () => new ExternalSystemError({ message: "Failed to build a billing return URL" });

// Where Stripe sends the buyer back to. Always on the application's own origin, so a checkout can't be used to
// redirect anywhere else.
export class ReturnUrl {
  private constructor() {}

  // A returnPath that isn't a path falls back to the org's billing page. Without a site URL there is nothing to
  // send them back to, which is a server problem, not the buyer's.
  static build(siteUrl: string | undefined, orgId: string, returnPath?: string): string {
    if (!siteUrl) throw failure();
    const path = returnPath && returnPath.startsWith("/") ? returnPath : `/organizations/${orgId}/billing`;
    try {
      const site = new URL(siteUrl);
      const returnUrl = new URL(path, site);
      if (returnUrl.origin !== site.origin) throw failure();
      return returnUrl.toString();
    } catch {
      throw failure();
    }
  }
}
