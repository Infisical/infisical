import { useState } from "react";

import { Alert } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Stack, Inline } from "@app/components/v4/ui/layout";
import { Select } from "@app/components/v4/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@app/components/v4/ui/sheet";
import { Snippet } from "@app/components/v4/ui/snippet";

import { useCrumbs } from "../../shared";
import { useAccess } from "../context";
import { DEMO_NOW, environments, type ServiceToken } from "../model";
import { Gate } from "../ui";

import styles from "./tokens-roles.module.css";

const DEMO_TOKEN = "st.demo-only.not-a-real-token.0000000000000000.0000000000000000";

const apiTokenExpiry = [
  { label: "1 day", value: "86400" },
  { label: "7 days", value: "604800" },
  { label: "1 month", value: "2592000" },
  { label: "6 months", value: "15552000" },
  { label: "12 months", value: "31104000" },
  { label: "Never", value: "never" }
];

type Scope = { key: number; environment: string; secretPath: string };

const newScope = (key: number): Scope => ({
  key,
  environment: environments[0].value,
  secretPath: "/"
});

const trimPath = (path: string) =>
  path.at(-1) === "/" && path.length > 1 ? path.slice(0, -1) : path;

export const ServiceTokenCreateSheet = ({
  open,
  onOpenChange,
  initialName = ""
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName?: string;
}) => {
  const { update, saved } = useAccess();
  const { project } = useCrumbs();
  const [name, setName] = useState(initialName);
  const [scopes, setScopes] = useState<Scope[]>(() => [newScope(0)]);
  const [expiresIn, setExpiresIn] = useState(apiTokenExpiry[0].value);
  const [write, setWrite] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [token, setToken] = useState("");

  const reset = () => {
    setName("");
    setScopes([newScope(0)]);
    setExpiresIn(apiTokenExpiry[0].value);
    setWrite(false);
    setSubmitted(false);
    setToken("");
  };
  const close = () => {
    reset();
    onOpenChange(false);
  };

  const nameError = name.length > 100 ? "Name must be 100 characters or fewer" : undefined;
  const pathError = (scope: Scope) =>
    submitted && !scope.secretPath ? "Secret path cannot be empty" : undefined;
  const setScope = (key: number, patch: Partial<Scope>) =>
    setScopes((current) => current.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const isOnlyScope = scopes.length === 1;

  const submit = () => {
    setSubmitted(true);
    if (nameError || scopes.some((scope) => !scope.secretPath)) return;
    setPending(true);
    window.setTimeout(() => {
      const created: ServiceToken = {
        id: `st-${crypto.randomUUID()}`,
        name,
        scopes: scopes.map(({ environment, secretPath }) => ({
          environment,
          secretPath: trimPath(secretPath)
        })),
        permissions: write ? ["read", "write"] : ["read"],
        expiresAt:
          expiresIn === "never"
            ? undefined
            : new Date(DEMO_NOW + Number(expiresIn) * 1000).toISOString(),
        createdAt: "Oct 30, 2026"
      };
      update((current) => ({ ...current, serviceTokens: [...current.serviceTokens, created] }));
      setPending(false);
      setToken(DEMO_TOKEN);
      saved("Successfully created a service token");
    }, 500);
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{`Add a service token for ${project.label}`}</SheetTitle>
          <SheetDescription>
            When a token is generated, you will only be able to see it once before it disappears.
            Make sure to save it somewhere.
          </SheetDescription>
        </SheetHeader>
        {token ? (
          <SheetBody>
            <Stack gap={16}>
              <Field label="Copy your service token" wide>
                <Snippet
                  value={token}
                  label="Service token"
                  copyLabel="Copy service token"
                  size="md"
                />
              </Field>
              <Alert tone="info" title="Copy this token now">
                Once you close this popup, you will never see your service token again. This is a
                demo value, not a real token.
              </Alert>
            </Stack>
          </SheetBody>
        ) : (
          <SheetBody>
            <form
              id="add-service-token-form"
              autoComplete="off"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <Stack gap={16}>
                <Field label="Service token name" error={nameError} wide>
                  <Input
                    autoFocus
                    placeholder="Type your token name"
                    value={name}
                    invalid={Boolean(nameError)}
                    onChange={(event) => setName(event.target.value)}
                  />
                </Field>
                <Stack gap={12} align="start">
                  {scopes.map((scope, index) => (
                    <div key={scope.key} className={styles.scopeRow}>
                      <Field label={index === 0 ? "Environment" : undefined}>
                        <Select
                          label="Environment"
                          placeholder="Select environment"
                          value={scope.environment}
                          options={environments}
                          onChange={(environment) => setScope(scope.key, { environment })}
                        />
                      </Field>
                      <Field
                        label={index === 0 ? "Secrets path" : undefined}
                        error={pathError(scope)}
                      >
                        <Input
                          aria-label="Secrets path"
                          placeholder="can be /, /nested/**, /**/deep"
                          value={scope.secretPath}
                          invalid={Boolean(pathError(scope))}
                          onChange={(event) =>
                            setScope(scope.key, { secretPath: event.target.value })
                          }
                        />
                      </Field>
                      <div className={index === 0 ? styles.firstRowAction : styles.rowAction}>
                        <Gate allowed={!isOnlyScope} reason="At least one scope is required">
                          <Button
                            variant="ghost"
                            size="icon"
                            icon="trash"
                            iconOnly
                            disabled={isOnlyScope}
                            onClick={() =>
                              setScopes((current) => current.filter((s) => s.key !== scope.key))
                            }
                          >
                            Remove scope
                          </Button>
                        </Gate>
                      </div>
                    </div>
                  ))}
                  <Button
                    variant="ghost"
                    size="xs"
                    icon="plus"
                    onClick={() =>
                      setScopes((current) => [
                        ...current,
                        newScope(Math.max(...current.map((s) => s.key)) + 1)
                      ])
                    }
                  >
                    Add scope
                  </Button>
                </Stack>
                <Field label="Expiration" wide>
                  <Select
                    label="Expiration"
                    placeholder="Select expiration"
                    value={expiresIn}
                    options={apiTokenExpiry}
                    onChange={setExpiresIn}
                  />
                </Field>
                <Field label="Permissions" group>
                  <Stack gap={8}>
                    <Checkbox label="Read (default)" checked disabled />
                    <Checkbox label="Write (optional)" checked={write} onChange={setWrite} />
                  </Stack>
                </Field>
              </Stack>
            </form>
          </SheetBody>
        )}
        <SheetFooter>
          <Inline gap={8} justify="end">
            {token ? (
              <Button variant="primary" onClick={close}>
                Done
              </Button>
            ) : (
              <>
                <Button variant="outline" disabled={pending} onClick={close}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  type="submit"
                  form="add-service-token-form"
                  loading={pending}
                >
                  Create
                </Button>
              </>
            )}
          </Inline>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};
