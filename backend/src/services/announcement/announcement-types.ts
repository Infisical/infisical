export type TAnnouncement = {
  id: string;
  title: string;
  body: string;
  imageUrl: string | null;
  link: string | null;
  linkLabel: string | null;
  published: string;
};

type TContentfulAsset = {
  sys: { id: string };
  fields: {
    file?: {
      url?: string;
    };
  };
};

export type TContentfulAnnouncementEntry = {
  sys: { id: string };
  fields: {
    title?: string;
    body?: string;
    image?: { sys: { id: string } };
    link?: string;
    linkLabel?: string;
    published?: string;
  };
};

export type TContentfulEntriesResponse = {
  items: TContentfulAnnouncementEntry[];
  includes?: {
    Asset?: TContentfulAsset[];
  };
};
