import { FormLabelToolTip } from "./FormLabelToolTip";

// To give users example of possible values of TTL
export const TtlFormLabel = ({ label }: { label: string }) => (
  <div>
    <FormLabelToolTip
      label={label}
      content="1m, 2h, 3d. "
      linkToMore="https://github.com/vercel/ms?tab=readme-ov-file#examples"
    />
  </div>
);
