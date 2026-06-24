import { Badge, Detail, DetailLabel, DetailValue } from "@app/components/v3";

type Props = {
  label: string;
  values?: string[];
  formatter?: (value: string) => string;
};

export const RuleList = ({ label, values, formatter }: Props) => {
  if (!values || values.length === 0) return null;

  return (
    <Detail>
      <DetailLabel>{label}</DetailLabel>
      <DetailValue className="flex flex-wrap gap-1">
        {values.map((value) => (
          <Badge key={`${label}-${value}`} variant="neutral">
            {formatter ? formatter(value) : value}
          </Badge>
        ))}
      </DetailValue>
    </Detail>
  );
};
