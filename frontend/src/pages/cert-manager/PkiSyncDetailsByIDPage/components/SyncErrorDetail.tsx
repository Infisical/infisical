import { Detail, DetailLabel, DetailValue } from "@app/components/v3";

type Props = {
  label: string;
  message: string;
  variant?: "danger" | "warning";
};

export const SyncErrorDetail = ({ label, message, variant = "danger" }: Props) => (
  <Detail>
    <DetailLabel className={variant === "warning" ? "text-warning" : "text-danger"}>
      {label}
    </DetailLabel>
    <DetailValue>
      <p className="rounded-sm bg-surface-active p-2 text-xs break-words">{message}</p>
    </DetailValue>
  </Detail>
);
