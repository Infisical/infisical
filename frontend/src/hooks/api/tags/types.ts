export type UserWsTags = WsTag[];

export type WsTag = {
  _id: string;
  name: string;
  slug: string;
  tagColor?: string;
  workspace: string;
  createdAt: string;
  updatedAt: string;
  __v: number;
}

export type WorkspaceTag = { _id: string; name: string; slug: string };

export type CreateTagDTO = {
  workspaceID: string;
  tagSlug: string;
  tagName: string;
  tagColor: string;
};

export type CreateTagRes = {
  name: string;
  slug: string;
  workspace: string;
  createdAt: string;
  tagColor?: string;
  user: string;
  _id: string;
};

export type DeleteTagDTO = { tagID: string; };

export type DeleteWsTagRes = {
  name: string;
  slug: string;
  workspace: string;
  createdAt: string;
  user: string;
  _id: string;
};

export type SecretTags = { 
  id: string;  
  _id: string;
  slug: string; 
  tagColor: string;
}

export type TagColor  =  {
  id: number;
  hex: string
  rgba: string
  name: string
  selected: boolean
}