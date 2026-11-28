import { BlocklistEntryType, TBlocklistEntry } from "@app/domains/platform/license/ce/module";

export enum BlockScope {
  Organization = "organization",
  User = "user"
}

export type TBlockMatch = {
  scope: BlockScope;
  message: string;
};

export type TBlockSubject = {
  // The org and its root, so blocking a root org also blocks its sub-orgs.
  orgIds: string[];
  userId?: string;
  email?: string | null;
};

export type TBlocklistRecord = {
  entries: TBlocklistEntry[];
};

const DEFAULT_MESSAGES: Record<BlockScope, string> = {
  [BlockScope.User]:
    "Access to Infisical has been restricted for this account. Contact support@infisical.com if you believe this is a mistake.",
  [BlockScope.Organization]:
    "Access to this organization has been restricted. Contact support@infisical.com if you believe this is a mistake."
};

const domainSuffixes = (email: string): string[] => {
  const at = email.lastIndexOf("@");
  if (at === -1) return [];
  const labels = email.slice(at + 1).split(".");
  return labels.map((_, index) => labels.slice(index).join(".")).filter(Boolean);
};

// The cloud blocklist the License Server publishes, indexed for a lookup on every request.
export class Blocklist {
  private constructor(
    private readonly entries: TBlocklistEntry[],
    private readonly index: Map<BlocklistEntryType, Map<string, TBlocklistEntry>>
  ) {}

  static empty(): Blocklist {
    return Blocklist.restore({ entries: [] });
  }

  static restore({ entries }: TBlocklistRecord): Blocklist {
    const index = new Map<BlocklistEntryType, Map<string, TBlocklistEntry>>(
      Object.values(BlocklistEntryType).map((type) => [type, new Map()])
    );
    entries.forEach((entry) => index.get(entry.type)?.set(entry.value.toLowerCase(), entry));
    return new Blocklist(entries, index);
  }

  get size(): number {
    return this.entries.length;
  }

  // A user match wins over an org match: it follows the user to every org, so it's the reason to show.
  findBlock({ orgIds, userId, email }: TBlockSubject, now: Date): TBlockMatch | null {
    if (!this.entries.length) return null;

    const normalizedEmail = email?.trim().toLowerCase();
    const userEntry =
      (userId ? this.activeEntry(BlocklistEntryType.UserId, userId, now) : null) ??
      (normalizedEmail ? this.activeEntry(BlocklistEntryType.Email, normalizedEmail, now) : null) ??
      (normalizedEmail
        ? domainSuffixes(normalizedEmail).reduce<TBlocklistEntry | null>(
            (found, domain) => found ?? this.activeEntry(BlocklistEntryType.EmailDomain, domain, now),
            null
          )
        : null);
    if (userEntry) return Blocklist.toMatch(BlockScope.User, userEntry);

    const orgEntry = orgIds.reduce<TBlocklistEntry | null>(
      (found, orgId) => found ?? (orgId ? this.activeEntry(BlocklistEntryType.OrgId, orgId, now) : null),
      null
    );
    return orgEntry ? Blocklist.toMatch(BlockScope.Organization, orgEntry) : null;
  }

  toJSON(): TBlocklistRecord {
    return { entries: this.entries.map((entry) => ({ ...entry })) };
  }

  // Expiry is checked here, not only on the License Server, so a block lifts on time between refreshes.
  private activeEntry(type: BlocklistEntryType, value: string, now: Date): TBlocklistEntry | null {
    const entry = this.index.get(type)?.get(value.toLowerCase());
    if (!entry) return null;
    if (entry.expiresAt && entry.expiresAt.getTime() <= now.getTime()) return null;
    return entry;
  }

  private static toMatch(scope: BlockScope, entry: TBlocklistEntry): TBlockMatch {
    return { scope, message: entry.message?.trim() || DEFAULT_MESSAGES[scope] };
  }
}
