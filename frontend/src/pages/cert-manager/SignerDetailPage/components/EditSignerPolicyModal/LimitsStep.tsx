import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";

import { NO_WINDOW_LIMIT, WINDOW_DURATION_OPTIONS } from "./types";

type Props = {
  maxSignings: number | null;
  setMaxSignings: (v: number | null) => void;
  maxWindow: string | null;
  setMaxWindow: (v: string | null) => void;
  showError?: boolean;
};

export const LimitsStep = ({
  maxSignings,
  setMaxSignings,
  maxWindow,
  setMaxWindow,
  showError = false
}: Props) => (
  <>
    <h2 className="text-xl font-semibold text-mineshaft-100">What an approval allows</h2>
    <p className="mt-1 mb-4 text-sm text-mineshaft-300">
      Once approval is granted, define how it can be used. At least one limit is required.
    </p>

    <FieldGroup>
      <Field>
        <FieldLabel>Signatures per approval</FieldLabel>
        <FieldContent>
          <Input
            type="number"
            min={1}
            value={maxSignings ?? ""}
            onChange={(e) => setMaxSignings(e.target.value ? Number(e.target.value) : null)}
            placeholder="10"
            isError={showError}
          />
          <FieldDescription>
            How many times one approval can be used to sign. Leave empty for unlimited.
          </FieldDescription>
          {showError && (
            <FieldError
              errors={[{ message: "Set a limit here or pick a signing window below." }]}
            />
          )}
        </FieldContent>
      </Field>

      <Field>
        <FieldLabel>Signing window</FieldLabel>
        <FieldContent>
          <Select
            value={maxWindow ?? NO_WINDOW_LIMIT}
            onValueChange={(v) => setMaxWindow(v === NO_WINDOW_LIMIT ? null : v)}
          >
            <SelectTrigger className="w-full" isError={showError}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WINDOW_DURATION_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            After approval is granted, how long signing is allowed before it expires.
          </FieldDescription>
          {showError && (
            <FieldError
              errors={[{ message: "Pick a window here or set signatures per approval." }]}
            />
          )}
        </FieldContent>
      </Field>
    </FieldGroup>
  </>
);
