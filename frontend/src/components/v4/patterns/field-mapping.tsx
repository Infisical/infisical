import * as React from "react";
import { ArrowRightIcon } from "lucide-react";

import { Badge } from "../ui/badge";
import { FieldError } from "../ui/field";
import { Icon, type IconName } from "../ui/icon";
import { Input, type InputProps } from "../ui/input";

import styles from "./field-mapping.module.css";

type FieldMappingSize = "sm" | "md" | "lg";

const FieldMappingContext = React.createContext<{ size: FieldMappingSize; targetHeader: string }>({
  size: "sm",
  targetHeader: "Value"
});

export type FieldMappingProps = {
  legend: string;
  sourceHeader: string;
  targetHeader: string;
  targetHint?: React.ReactNode;
  size?: FieldMappingSize;
  children: React.ReactNode;
};

export const FieldMapping = ({
  legend,
  sourceHeader,
  targetHeader,
  targetHint,
  size = "sm",
  children
}: FieldMappingProps) => {
  const context = React.useMemo(() => ({ size, targetHeader }), [size, targetHeader]);
  return (
    <fieldset className={styles.fieldMapping}>
      <legend className={styles.legend}>{legend}</legend>
      <div className={styles.grid} data-size={size}>
        <span className={styles.head}>{sourceHeader}</span>
        <span />
        <span className={styles.head}>
          {targetHeader}
          {targetHint}
        </span>
        <FieldMappingContext.Provider value={context}>{children}</FieldMappingContext.Provider>
      </div>
    </fieldset>
  );
};

export type FieldMappingRowProps = Omit<InputProps, "size" | "invalid"> & {
  source: string;
  icon?: IconName;
  error?: React.ReactNode;
} & { ref?: React.Ref<HTMLInputElement> };

export const FieldMappingRow = ({ source, icon, error, ...props }: FieldMappingRowProps) => {
  const { size, targetHeader } = React.useContext(FieldMappingContext);
  return (
    <div className={styles.row}>
      <span className={styles.source}>
        <Badge tone="soft" size={`control-${size}`}>
          {icon && <Icon name={icon} />}
          {source}
        </Badge>
      </span>
      <span className={styles.arrow} aria-hidden="true">
        <Icon icon={ArrowRightIcon} />
      </span>
      <div className={styles.target}>
        <Input
          aria-label={`${targetHeader} for ${source}`}
          {...props}
          size={size}
          invalid={Boolean(error)}
        />
        {error && <FieldError>{error}</FieldError>}
      </div>
    </div>
  );
};
