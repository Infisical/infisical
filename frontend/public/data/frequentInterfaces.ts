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
  value: string;
  valueOverride: string | undefined;
  id: string;
  comment: string;
  tags: Tag[];
}