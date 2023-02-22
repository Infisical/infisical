export interface Tag {
  _id: string; 
  name: string;
  slug: string;
  user: string;
  workspace: string;
  createdAt: string;
}

export interface SecretDataProps {
  pos: number;
  key: string;
  value: string | undefined;
  valueOverride: string | undefined;
  id: string;
  idOverride?: string;
  comment: string;
  tags: Tag[];
}