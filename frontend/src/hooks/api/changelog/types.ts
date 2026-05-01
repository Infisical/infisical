export interface ChangelogEntry {
  id: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  publishedAt: string;
  tags: string[];
  ctaUrl: string | null;
  ctaLabel: string | null;
}

export interface ChangelogFeed {
  version: number;
  items: ChangelogEntry[];
}
