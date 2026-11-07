import { useState } from "react";

import { Alert } from "@app/components/v4/ui/alert";
import { Button } from "@app/components/v4/ui/button";
import { Checkbox } from "@app/components/v4/ui/checkbox";
import { Field } from "@app/components/v4/ui/field";
import { Input } from "@app/components/v4/ui/input";
import { Inline, Stack } from "@app/components/v4/ui/layout";
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

import { useV4Adapter } from "../../data/adapters";
import { failed, saved } from "../toast";
import { Gate } from "../ui";

import styles from "./tokens-roles.module.css";

const apiTokenExpiry = [
  { label: "1 day", value: "86400" },
  { label: "7 days", value: "604800" },
  { label: "1 month", value: "2592000" },
  { label: "6 months", value: "15552000" },
  { label: "12 months", value: "31104000" },
  { label: "Never", value: "never" }
];

type Scope = { key: number; environment: string; secretPath: string };

const trimPath = (path: string) =>
  path.at(-1) === "/" && path.length > 1 ? path.slice(0, -1) : path;

const randomHex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (byte) =>
    byte.toString(16).padStart(2, "0")
  ).join("");

export const ServiceTokenCreateSheet = ({
  projectId,
  open,
  onOpenChange
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) => {
  const access = useV4Adapter("access");
  const project = access.useProject(projectId);
  const createToken = access.useCreateServiceToken();
  const environments = (project.data?.environments ?? []).map((environment) => ({
    value: environment.slug,
    label: environment.name
  }));
  const defaultEnvironment = environments[0]?.value ?? "";
  const newScope = (key: number): Scope => ({
    key,
    environment: defaultEnvironment,
    secretPath: "/"
  });
  const [name, setName] = useState("");
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
  const environmentError = (scope: Scope) =>
    submitted && !(scope.environment || defaultEnvironment) ? "Select an environment" : undefined;
  const setScope = (key: number, patch: Partial<Scope>) =>
    setScopes((current) => current.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  const isOnlyScope = scopes.length === 1;

  const submit = async () => {
    setSubmitted(true);
    const resolved = scopes.map((scope) => ({
      environment: scope.environment || defaultEnvironment,
      secretPath: trimPath(scope.secretPath)
    }));
    if (nameError || resolved.some((scope) => !scope.secretPath || !scope.environment)) return;
    setPending(true);
    try {
      const { serviceToken } = await createToken.mutateAsync({
        encryptedKey: "",
        iv: "",
        tag: "",
        scopes: resolved,
        expiresIn: expiresIn === "never" ? 0 : Number(expiresIn),
        name,
        workspaceId: projectId,
        randomBytes: randomHex(16),
        permissions: write ? ["read", "write"] : ["read"]
      });
      setToken(serviceToken);
      saved("Successfully created a service token");
    } catch (error) {
      failed("Failed to create service token", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <SheetContent pending={pending}>
        <SheetHeader>
          <SheetTitle>
            {project.data ? `Add a service token for ${project.data.name}` : "Add a service token"}
          </SheetTitle>
          <SheetDescription>The token is shown once. Save it somewhere safe.</SheetDescription>
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
                Once you close this popup, you will never see your service token again.
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
                      <Field
                        label={index === 0 ? "Environment" : undefined}
                        error={environmentError(scope)}
                      >
                        <Select
                          label="Environment"
                          placeholder="Select environment"
                          value={scope.environment || defaultEnvironment}
                          options={environments}
                          disabled={project.isPending}
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
