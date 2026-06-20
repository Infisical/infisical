import { PAM_PRODUCT_ROLE_OPTIONS } from "./roleOptions";

type Props = {
  value: string;
  onChange: (value: string) => void;
  isDisabled?: boolean;
};

export const ProductRoleOptionList = ({ value, onChange, isDisabled }: Props) => (
  <div className="flex flex-col gap-2">
    {PAM_PRODUCT_ROLE_OPTIONS.map((option) => {
      const isSelected = value === option.value;
      return (
        <button
          key={option.value}
          type="button"
          disabled={isDisabled}
          onClick={() => onChange(option.value)}
          className={`flex items-start gap-3 rounded-md border p-3 text-left transition-colors ${
            isSelected
              ? "border-product-pam/40 bg-product-pam/5"
              : "border-border bg-container hover:bg-container-hover"
          } ${isDisabled ? "cursor-not-allowed opacity-50" : ""}`}
        >
          <div
            className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
              isSelected ? "border-product-pam bg-product-pam" : "border-muted"
            }`}
          >
            {isSelected && <div className="size-1.5 rounded-full bg-white" />}
          </div>
          <div>
            <p className="text-sm font-medium">{option.label}</p>
            <p className="text-xs text-muted">{option.description}</p>
          </div>
        </button>
      );
    })}
  </div>
);
