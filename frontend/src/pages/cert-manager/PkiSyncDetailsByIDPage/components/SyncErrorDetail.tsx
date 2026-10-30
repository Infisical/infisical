import { Detail, DetailLabel, DetailValue } from "@app/components/v3";

type Props = {
  label: string;
  message: string;
};

export const SyncErrorDetail = ({ label, message }: Props) => (
  <Detail>
    <DetailLabel className="text-danger">{label}</DetailLabel>
    <DetailValue>
      <p className="rounded-sm bg-surface-active p-2 text-xs break-words">{message}</p>
    </DetailValue>
  </Detail>
);
