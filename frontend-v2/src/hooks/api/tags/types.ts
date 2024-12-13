export type UserWsTags = WsTag[];

export type WsTag = {
  id: string;
  slug: string;
  color?: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
};

export type WorkspaceTag = { id: string; name: string; slug: string };

export type CreateTagDTO = {
  workspaceID: string;
  tagSlug: string;
  tagColor: string;
};

export type DeleteTagDTO = { tagID: string; projectId: string };

export type SecretTags = {
  id: string;
  slug: string;
  tagColor: string;
};

export type TagColor = {
  id: number;
  hex: string;
  rgba: string;
  name: string;
  selected: boolean;
};
