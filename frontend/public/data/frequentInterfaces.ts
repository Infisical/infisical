export interface SecretDataProps {
  pos: number;
  key: string;
  value: string;
  valueOverride: string | undefined;
  id: string;
  comment: string;
}