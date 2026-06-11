import { useEffect, useState } from "react";
import { PlusIcon, TrashIcon } from "lucide-react";

import {
  Badge,
  Button,
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  IconButton,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Switch
} from "@app/components/v3";
import {
  useDeleteSecretHttpProxyConfig,
  useGetSecretHttpProxyConfig,
  useUpsertSecretHttpProxyConfig
} from "@app/hooks/api/secretHttpProxyConfig";
import { ProxyAuthType } from "@app/hooks/api/secretHttpProxyConfig/types";
import type { TProxyRule } from "@app/hooks/api/secretHttpProxyConfig/types";

type Props = {
  projectId: string;
  secretId: string;
};

const AUTH_TYPE_OPTIONS: { value: ProxyAuthType; label: string; description: string }[] = [
  { value: ProxyAuthType.Bearer, label: "Bearer", description: "Authorization: Bearer <value>" },
  { value: ProxyAuthType.ApiKey, label: "API Key", description: "Inject value in a named header" },
  { value: ProxyAuthType.Basic, label: "Basic", description: "Authorization: Basic base64(user:pass)" },
  { value: ProxyAuthType.Custom, label: "Custom", description: "Define a custom header template" }
];

const getInjectionPreview = (rule: TProxyRule): string | null => {
  switch (rule.authType) {
    case ProxyAuthType.Bearer:
      return "Authorization: Bearer <secret value>";
    case ProxyAuthType.ApiKey:
      return rule.headerName
        ? `${rule.headerName}: <secret value>`
        : null;
    case ProxyAuthType.Basic:
      return rule.username
        ? `Authorization: Basic base64(${rule.username}:<secret value>)`
        : "Authorization: Basic base64(<username>:<secret value>)";
    case ProxyAuthType.Custom:
      return rule.headerTemplate
        ? rule.headerTemplate.replace(/\{\{\s*VALUE\s*\}\}/g, "<secret value>")
        : null;
    default:
      return null;
  }
};

export const SecretHttpProxySection = ({ projectId, secretId }: Props) => {
  const { data: proxyConfig } = useGetSecretHttpProxyConfig({
    projectId,
    secretId,
    enabled: !!secretId
  });

  const upsertMutation = useUpsertSecretHttpProxyConfig();
  const deleteMutation = useDeleteSecretHttpProxyConfig();

  const [isEnabled, setIsEnabled] = useState(false);
  const [placeholder, setPlaceholder] = useState("");
  const [rules, setRules] = useState<TProxyRule[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (proxyConfig) {
      setIsEnabled(true);
      setPlaceholder(proxyConfig.placeholder);
      setRules(Array.isArray(proxyConfig.rules) ? proxyConfig.rules : []);
    } else {
      setIsEnabled(false);
      setPlaceholder("");
      setRules([]);
    }
  }, [proxyConfig]);

  const handleSave = () => {
    if (!isEnabled) {
      if (proxyConfig) {
        deleteMutation.mutate({ projectId, secretId });
      }
      return;
    }
    upsertMutation.mutate({
      projectId,
      secretId,
      placeholder: placeholder || undefined,
      rules
    });
    setIsDirty(false);
  };

  const handleToggleEnabled = (checked: boolean) => {
    setIsEnabled(checked);
    if (!checked && proxyConfig) {
      deleteMutation.mutate({ projectId, secretId });
      setIsDirty(false);
    } else {
      setIsDirty(true);
    }
  };

  const handleAddRule = () => {
    setRules((prev) => [...prev, { host: "", authType: ProxyAuthType.Bearer }]);
    setIsDirty(true);
  };

  const handleRemoveRule = (index: number) => {
    setRules((prev) => prev.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const handleUpdateRule = (index: number, updates: Partial<TProxyRule>) => {
    setRules((prev) =>
      prev.map((rule, i) => (i === index ? { ...rule, ...updates } : rule))
    );
    setIsDirty(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">HTTP Proxy</p>
          <p className="text-xs text-label">Inject credentials into outbound HTTP requests</p>
        </div>
        <Switch
          checked={isEnabled}
          onCheckedChange={handleToggleEnabled}
          variant="project"
        />
      </div>

      {isEnabled && (
        <>
          <Separator />

          <Field>
            <FieldLabel>Placeholder Value</FieldLabel>
            <FieldDescription>
              Agents receive this instead of the real credential. The broker swaps it for the real
              value on the wire.
            </FieldDescription>
            <FieldContent>
              <Input
                value={placeholder}
                onChange={(e) => {
                  setPlaceholder(e.target.value);
                  setIsDirty(true);
                }}
                placeholder="Auto-generated if left empty (e.g. __infisical_7kB9x2mQ__)"
              />
            </FieldContent>
          </Field>

          {placeholder && (
            <div className="rounded-md border border-border bg-container p-3 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-label">Agent sees</span>
                <code className="rounded bg-foreground/5 px-1.5 py-0.5 font-mono text-foreground">
                  {placeholder}
                </code>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="text-label">Broker injects</span>
                <span className="text-foreground">the real secret value</span>
              </div>
            </div>
          )}

          <Separator />

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Service Rules</p>
              <p className="text-xs text-label">
                Define which hosts this credential is injected into
              </p>
            </div>
            <Button size="xs" variant="outline" onClick={handleAddRule}>
              <PlusIcon className="mr-1 h-3 w-3" />
              Add Rule
            </Button>
          </div>

          {rules.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-6 text-center">
              <p className="text-sm text-label">No rules configured</p>
              <p className="mt-1 text-xs text-label">
                Add a rule to define how this credential is injected into outbound requests
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {rules.map((rule, index) => {
                const preview = getInjectionPreview(rule);
                return (
                  <div
                    key={`rule-${index}`}
                    className="rounded-md border border-border bg-container p-4"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <Badge variant="neutral">Rule {index + 1}</Badge>
                      <IconButton
                        aria-label="Remove rule"
                        variant="ghost"
                        size="xs"
                        onClick={() => handleRemoveRule(index)}
                      >
                        <TrashIcon className="h-3.5 w-3.5 text-destructive" />
                      </IconButton>
                    </div>

                    <div className="space-y-3">
                      <Field>
                        <FieldLabel>Host Pattern</FieldLabel>
                        <FieldContent>
                          <Input
                            value={rule.host}
                            onChange={(e) => handleUpdateRule(index, { host: e.target.value })}
                            placeholder="e.g. api.stripe.com, *.github.com, internal.corp.com:3000/api/*"
                          />
                        </FieldContent>
                      </Field>

                      <Field>
                        <FieldLabel>Auth Type</FieldLabel>
                        <FieldContent>
                          <Select
                            value={rule.authType}
                            onValueChange={(val) =>
                              handleUpdateRule(index, { authType: val as ProxyAuthType })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {AUTH_TYPE_OPTIONS.map((opt) => (
                                <SelectItem
                                  key={opt.value}
                                  value={opt.value}
                                  description={opt.description}
                                >
                                  {opt.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </FieldContent>
                      </Field>

                      {rule.authType === ProxyAuthType.ApiKey && (
                        <Field>
                          <FieldLabel>Header Name</FieldLabel>
                          <FieldDescription>
                            The HTTP header where the credential is placed
                          </FieldDescription>
                          <FieldContent>
                            <Input
                              value={rule.headerName || ""}
                              onChange={(e) =>
                                handleUpdateRule(index, { headerName: e.target.value })
                              }
                              placeholder="e.g. x-api-key, X-Postmark-Server-Token"
                              isError={!rule.headerName}
                            />
                          </FieldContent>
                        </Field>
                      )}

                      {rule.authType === ProxyAuthType.Basic && (
                        <Field>
                          <FieldLabel>Username</FieldLabel>
                          <FieldDescription>
                            Combined with this secret's value as the password
                          </FieldDescription>
                          <FieldContent>
                            <Input
                              value={rule.username || ""}
                              onChange={(e) =>
                                handleUpdateRule(index, { username: e.target.value })
                              }
                              placeholder="e.g. user@company.com"
                            />
                          </FieldContent>
                        </Field>
                      )}

                      {rule.authType === ProxyAuthType.Custom && (
                        <Field>
                          <FieldLabel>Header Template</FieldLabel>
                          <FieldDescription>
                            {"Format: HeaderName: value. Use {{ VALUE }} where the credential goes."}
                          </FieldDescription>
                          <FieldContent>
                            <Input
                              value={rule.headerTemplate || ""}
                              onChange={(e) =>
                                handleUpdateRule(index, { headerTemplate: e.target.value })
                              }
                              placeholder="e.g. Authorization: Token {{ VALUE }}"
                              isError={
                                !!rule.headerTemplate &&
                                !rule.headerTemplate.includes("{{ VALUE }}") &&
                                !rule.headerTemplate.includes("{{VALUE}}")
                              }
                            />
                          </FieldContent>
                        </Field>
                      )}

                      {preview && rule.host && (
                        <div className="rounded border border-dashed border-border bg-foreground/[0.02] px-3 py-2 text-xs">
                          <span className="text-label">
                            Requests to <code className="font-mono">{rule.host}</code> will get:
                          </span>
                          <code className="mt-0.5 block font-mono text-foreground">{preview}</code>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {isDirty && (
            <div className="sticky bottom-0 border-t border-border bg-container pt-3 pb-1">
              <div className="flex justify-end gap-2">
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    if (proxyConfig) {
                      setPlaceholder(proxyConfig.placeholder);
                      setRules(Array.isArray(proxyConfig.rules) ? proxyConfig.rules : []);
                    }
                    setIsDirty(false);
                  }}
                >
                  Discard
                </Button>
                <Button
                  size="xs"
                  variant="project"
                  onClick={handleSave}
                  isPending={upsertMutation.isPending}
                >
                  Save
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
