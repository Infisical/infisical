import { Detail, DetailLabel, DetailValue } from "@app/components/v3";

type Props = {
  label: string;
  message: string;
};

export const SyncErrorDetail = ({ label, message }: Props) => (
  <Detail>
    <DetailLabel className="text-red">{label}</DetailLabel>
    <DetailValue>
      <p className="rounded-sm bg-mineshaft-600 p-2 text-xs break-words">{message}</p>
    </DetailValue>
  </Detail>
);
