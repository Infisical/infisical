export type TAnnouncement = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  link: string | null;
  linkLabel: string | null;
  published: string;
};

export type TRecentAnnouncementsResponse = {
  announcements: TAnnouncement[];
  lastSeenAnnouncementId: string | null;
};
