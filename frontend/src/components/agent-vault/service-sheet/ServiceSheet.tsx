import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import slugify from "@sindresorhus/slugify";
import axios from "axios";

import { createNotification } from "@app/components/notifications";
import {
  Button,
  DiscardChangesAlertDialog,
  DocumentationLinkBadge,
  Field,
  FieldContent,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  Stepper,
  StepperList,
  StepperStep
} from "@app/components/v3";
import { ProviderIcon } from "@app/components/v3/platform/ProviderIcon";
import { hostError } from "@app/helpers/agentVaultHostPattern";
import {
  AgentVaultHttpTemplate,
  AgentVaultMcpTemplate,
  AgentVaultTemplate,
  findMcpTemplateForHostPattern,
  findTemplateForHostPattern,
  guessServiceTypeForRequest,
  lastPathSegment
} from "@app/helpers/agentVaultTemplates";
import { findVariableReferences, VARIABLE_KEY_RE } from "@app/helpers/agentVaultVariables";
import { useDebounce, useDiscardChangesGuard, useWizardSteps } from "@app/hooks";
import {
  AgentVaultCredentialType,
  AgentVaultMcpTransport,
  AgentVaultServiceType,
  AgentVaultVariableReferenceField,
  SERVICE_SAVE_HANDLED_ERROR_CODES,
  TAgentVaultMemberProvidedField,
  useAgentVaultVariableKeyStatus,
  useCreateAgentVaultService,
  useUpdateAgentVaultService
} from "@app/hooks/api/agentVault";
import {
  TAgentVaultService,
  TAgentVaultVariable,
  TAgentVaultVariableReference
} from "@app/hooks/api/agentVault/types";
import { onRequestError } from "@app/hooks/api/reactQuery";
import { ApiErrorTypes, TApiErrors } from "@app/hooks/api/types";

import { ServiceTemplateSelect } from "../ServiceTemplateSelect";
import { VariableFormDialog } from "../VariableFormDialog";
import { CredentialFields } from "./CredentialFields";
import { DetailsFields } from "./DetailsFields";
import { McpCredentialFields } from "./McpCredentialFields";
import { McpDetailsFields } from "./McpDetailsFields";
import { ReviewFields } from "./ReviewFields";
import { buildCreateServiceRequest, buildUpdateServiceRequest } from "./serviceRequest";
import {
  buildServiceSchema,
  displayHostPattern,
  HTTP_METHODS,
  isOAuthAuthorizationMissing,
  MCP_SERVICE_STEP_FIELDS,
  SERVICE_STEP_FIELDS,
  SERVICE_TYPE_LABELS,
  ServiceStep,
  storedMemberFields,
  TServiceForm,
  UNCHANGED_SECRET
} from "./serviceSchema";
import {
  NO_MISSING_KEYS,
  NO_STORED_KEYS,
  ServiceVariablesContext
} from "./ServiceVariablesContext";
import { MCP_SERVICE_STEPS, SERVICE_DOCS_URL, SERVICE_STEPS } from "./stepMeta";
import { ADVANCED_ITEM, TransformationsFields } from "./TransformationsFields";

const BLANK_SERVICE_FORM: TServiceForm = {
  serviceType: AgentVaultServiceType.Http,
  name: "",
  serverUrl: "",
  transport: AgentVaultMcpTransport.StreamableHttp,
  hosts: [],
  hostDraft: "",
  pathDraft: "",
  credentialType: AgentVaultCredentialType.Passthrough,
  headerName: "Authorization",
  headerPrefix: "Bearer",
  username: "",
  secret: "",
  oauthAuthorizationId: "",
  oauthAuthorizedUrl: "",
  oauthScopes: [],
  oauthAuthorizationRejection: "",
  oauthClientId: "",
  oauthClientSecret: "",
  oauthAutomaticSetup: false,
  memberProvidedFields: [],
  methods: [...HTTP_METHODS],
  pathPrefixes: [],
  customHeaders: [],
  substitutions: []
};

const BLANK_MCP_SERVICE_FORM: TServiceForm = {
  ...BLANK_SERVICE_FORM,
  serviceType: AgentVaultServiceType.Mcp,
  credentialType: AgentVaultCredentialType.OAuth
};

const mcpFormFromTemplate = (picked: AgentVaultMcpTemplate | null): TServiceForm => {
  if (!picked) return BLANK_MCP_SERVICE_FORM;
  const cred = picked.credential;
  return {
    ...BLANK_MCP_SERVICE_FORM,
    name: picked.key,
    serverUrl: picked.serverUrl,
    transport: picked.transport,
    credentialType: cred.type,
    ...(cred.type === AgentVaultCredentialType.Bearer && {
      headerName: cred.headerName ?? "Authorization",
      headerPrefix: cred.headerPrefix ?? "Bearer"
    })
  };
};

// A template placeholder like <your-tenant>.atlassian.net is not a host, so it goes into the draft.
const formFromTemplate = (picked: AgentVaultHttpTemplate | null, hosts: string[]): TServiceForm => {
  const hostFields = {
    hosts: hosts.filter((host) => !hostError(host, [])),
    hostDraft: hosts.find((host) => Boolean(hostError(host, []))) ?? ""
  };
  if (!picked) {
    return { ...BLANK_SERVICE_FORM, ...hostFields };
  }

  const cred = picked.credential;
  return {
    ...BLANK_SERVICE_FORM,
    name: picked.key,
    ...hostFields,
    credentialType: cred.type,
    ...(cred.type === AgentVaultCredentialType.Bearer && {
      headerName: cred.headerName ?? "Authorization",
      headerPrefix: cred.headerPrefix ?? "Bearer"
    }),
    ...(cred.type === AgentVaultCredentialType.Basic &&
      cred.username && { username: cred.username })
  };
};

const prefillName = (hostPattern: string) =>
  slugify(hostPattern.replace(/:\d+$/, ""), { lowercase: true }).slice(0, 64).replace(/-+$/, "");

// A service added from a session log row starts from the request the proxy saw.
const prefillFor = (
  serviceType: AgentVaultServiceType,
  hostPattern: string,
  path = ""
): { template: AgentVaultTemplate | null; form: TServiceForm } => {
  if (serviceType === AgentVaultServiceType.Mcp) {
    const picked = findMcpTemplateForHostPattern(hostPattern) ?? null;
    if (picked) return { template: picked, form: mcpFormFromTemplate(picked) };
    return {
      template: null,
      form: {
        ...BLANK_MCP_SERVICE_FORM,
        name: prefillName(hostPattern),
        serverUrl: `https://${hostPattern}${path.split("?")[0]}`,
        transport:
          lastPathSegment(path) === "sse"
            ? AgentVaultMcpTransport.Sse
            : AgentVaultMcpTransport.StreamableHttp
      }
    };
  }
  const picked = findTemplateForHostPattern(hostPattern) ?? null;
  const form = formFromTemplate(picked, [hostPattern]);
  return { template: picked, form: picked ? form : { ...form, name: prefillName(hostPattern) } };
};

const PrefillTypeField = ({
  value,
  onChange
}: {
  value: AgentVaultServiceType;
  onChange: (serviceType: AgentVaultServiceType) => void;
}) => {
  const labelId = useId();
  return (
    <Field>
      <FieldLabel id={labelId}>Service Type</FieldLabel>
      <FieldContent>
        <Select value={value} onValueChange={(next) => onChange(next as AgentVaultServiceType)}>
          <SelectTrigger aria-labelledby={labelId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper">
            {Object.values(AgentVaultServiceType).map((type) => (
              <SelectItem key={type} value={type}>
                {SERVICE_TYPE_LABELS[type]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldContent>
    </Field>
  );
};

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  accessBundleId: string;
  service?: TAgentVaultService | null;
  prefillHost?: string;
  // The path of the logged request, which helps tell an MCP server from an HTTP API.
  prefillPath?: string;
  onSaved?: () => void;
};

const storedVariableKeys = (service?: TAgentVaultService | null) => {
  const references = service?.variableReferences;
  if (!service || !references?.length) return NO_STORED_KEYS;

  const keysWhere = (match: (reference: TAgentVaultVariableReference) => boolean) =>
    references.filter(match).map((reference) => reference.key);
  const byRow = (
    rows: { id: string }[],
    idOf: (r: TAgentVaultVariableReference) => string | null
  ) =>
    Object.fromEntries(
      rows.map((row) => [row.id, keysWhere((reference) => idOf(reference) === row.id)])
    );

  return {
    secret: keysWhere(
      (reference) => reference.field === AgentVaultVariableReferenceField.CredentialValue
    ),
    username: keysWhere(
      (reference) => reference.field === AgentVaultVariableReferenceField.CredentialUsername
    ),
    customHeaders: byRow(service.customHeaders, (reference) =>
      reference.field === AgentVaultVariableReferenceField.CustomHeader
        ? reference.customHeaderId
        : null
    ),
    substitutions: byRow(service.substitutions, (reference) =>
      reference.field === AgentVaultVariableReferenceField.Substitution
        ? reference.substitutionId
        : null
    )
  };
};

// Long enough for the advanced section to open and settle. There is no event to wait on: the section
// is a Radix accordion, whose content is unmounted while closed, so the control cannot be measured
// until after it mounts and takes its height.
const SECTION_OPEN_MS = 250;

// The server keeps a completed authorization for 10 minutes. Expiring it here a little early covers the poll
// that delivered it, so the sheet never shows one the server has already dropped.
const OAUTH_AUTHORIZATION_LIFETIME_MS = (10 * 60 - 30) * 1000;
const OAUTH_AUTHORIZATION_EXPIRED_MESSAGE =
  "This authorization expired before the service was saved. Authorize again.";

// A successful save consumes the authorization and a failed one restores it, so these refusals mean it expired,
// another save used it, or it can't be used for this service. Only authorizing again gets past any of them.
const rejectedAuthorizationMessage = (error: unknown) => {
  if (!axios.isAxiosError<{ message?: unknown }>(error)) return null;
  const status = error.response?.status;
  const message = error.response?.data?.message;
  if (typeof message !== "string") return null;
  const isRejected =
    (status === 400 && message.startsWith("This authorization ")) ||
    (status === 404 && message.startsWith("Authorization with ID")) ||
    (status === 409 && message.includes("already used by another save"));
  return isRejected ? message : null;
};

export const ServiceSheet = ({
  isOpen,
  onOpenChange,
  accessBundleId,
  service,
  prefillHost,
  prefillPath,
  onSaved
}: Props) => {
  const isUpdate = Boolean(service);
  const createService = useCreateAgentVaultService();
  const updateService = useUpdateAgentVaultService();

  const storedKeys = useMemo(() => storedVariableKeys(service), [service]);
  // One dialog for every field. The request settles once the dialog has closed, not when the variable is
  // saved: until then the dialog's focus trap would pull focus back from the field that asked.
  const [newVariableKey, setNewVariableKey] = useState<string | null>(null);
  const newVariableRequest = useRef<{
    resolve: (variable: TAgentVaultVariable | null) => void;
    created: TAgentVaultVariable | null;
  } | null>(null);
  const requestVariable = useCallback(
    (key: string) =>
      new Promise<TAgentVaultVariable | null>((resolve) => {
        newVariableRequest.current?.resolve(null);
        newVariableRequest.current = { resolve, created: null };
        setNewVariableKey(key);
      }),
    []
  );

  const [template, setTemplate] = useState<AgentVaultTemplate | null>(null);

  // Read when the form validates, so the schema isn't rebuilt each time a lookup answers.
  const missingKeysRef = useRef<ReadonlySet<string>>(NO_MISSING_KEYS);
  const schema = useMemo(
    () => buildServiceSchema(service, () => missingKeysRef.current),
    [service]
  );

  const formMethods = useForm<TServiceForm>({
    defaultValues: BLANK_SERVICE_FORM,
    resolver: zodResolver(schema)
  });
  const {
    control,
    handleSubmit,
    reset,
    getValues,
    setError,
    trigger,
    watch,
    setValue,
    formState: { errors, isDirty, isSubmitting }
  } = formMethods;

  const isMcp = watch("serviceType") === AgentVaultServiceType.Mcp;
  const stepFields = isMcp ? MCP_SERVICE_STEP_FIELDS : SERVICE_STEP_FIELDS;

  // Only the keys the form references are looked up, never the whole list.
  const [secret, username, customHeaders, substitutions] = useWatch({
    control,
    name: ["secret", "username", "customHeaders", "substitutions"]
  });
  const referencedKeys = useMemo(() => {
    const texts = [
      secret,
      username,
      ...(customHeaders ?? []).map((header) => header.value),
      ...(substitutions ?? []).map((substitution) => substitution.value)
    ];
    const keys = texts.flatMap((text) =>
      text && text !== UNCHANGED_SECRET ? findVariableReferences(text) : []
    );
    return [...new Set(keys.filter((key) => VARIABLE_KEY_RE.test(key)))].sort().join(",");
  }, [secret, username, customHeaders, substitutions]);
  const [debouncedReferencedKeys] = useDebounce(referencedKeys, 300);
  const { missing: missingKeys } = useAgentVaultVariableKeyStatus(
    debouncedReferencedKeys ? debouncedReferencedKeys.split(",") : [],
    { enabled: isOpen }
  );
  missingKeysRef.current = missingKeys;

  const serviceVariables = useMemo(
    () => ({ missingKeys, storedKeys, requestVariable }),
    [missingKeys, storedKeys, requestVariable]
  );

  const discardActionRef = useRef<VoidFunction>(() => onOpenChange(false));
  const { confirmDiscard, isDiscardDialogOpen, requestDiscard, setIsDiscardDialogOpen } =
    useDiscardChangesGuard({ isDirty, onDiscard: () => discardActionRef.current() });

  const requestDiscardAction = (action: VoidFunction) => {
    discardActionRef.current = action;
    requestDiscard();
  };

  // A prefilled host has already been matched against the templates, and anything picked on the
  // template step would replace that host.
  const hasTemplateStep = !isUpdate && !prefillHost;
  const steps = useMemo(() => {
    const all = isMcp ? MCP_SERVICE_STEPS : SERVICE_STEPS;
    return hasTemplateStep ? all : all.filter((meta) => meta.step !== ServiceStep.Template);
  }, [hasTemplateStep, isMcp]);
  const stepKeys = useMemo(() => steps.map((meta) => meta.step), [steps]);

  const panelRef = useRef<HTMLDivElement>(null);
  const [openItem, setOpenItem] = useState(ADVANCED_ITEM);
  const [isSigningIn, setIsSigningIn] = useState(false);
  // The stand-in for formState.submitCount, which only counts handleSubmit and so never moves for a
  // wizard that gates its steps with trigger. Without it a second Continue reveals nothing, because
  // the errors it finds are the ones already there.
  const [blockedAttempt, setBlockedAttempt] = useState(0);

  const { step, isLastStep, goBack, goNext, onFormInvalid, setStep } = useWizardSteps<ServiceStep>({
    stepKeys,
    stepFields,
    invalidMessage: "Fix the errors before saving.",
    validateStep: async (fields) => {
      const isValid = await trigger(fields as (keyof TServiceForm)[]);
      if (!isValid) setBlockedAttempt((count) => count + 1);
      return isValid;
    }
  });

  const hasAdvancedError = Boolean(
    errors.customHeaders ||
    errors.substitutions ||
    (isMcp && (errors.headerName || errors.headerPrefix))
  );

  useEffect(() => {
    if (hasAdvancedError) setOpenItem(ADVANCED_ITEM);
  }, [hasAdvancedError, blockedAttempt]);

  useEffect(() => {
    if (!blockedAttempt) return undefined;
    // Once the accordion has finished opening: a control inside it is neither mounted nor at its final
    // offset before then, so anything sooner scrolls to the wrong place or to nothing. The control
    // rather than its message, which arrives a render later and keeps its text once the error clears.
    const id = window.setTimeout(() => {
      const invalid = panelRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]');
      (invalid?.closest('[data-slot="field"]') ?? invalid)?.scrollIntoView({ block: "nearest" });
    }, SECTION_OPEN_MS);
    return () => window.clearTimeout(id);
  }, [blockedAttempt]);

  useEffect(() => {
    if (!isOpen) return;

    setStep(0);
    setTemplate(null);
    setOpenItem(service?.type === AgentVaultServiceType.Mcp ? "" : ADVANCED_ITEM);

    if (service?.type === AgentVaultServiceType.Mcp) {
      const { credential } = service;
      const isBearer = credential.type === AgentVaultCredentialType.Bearer;
      reset({
        ...BLANK_MCP_SERVICE_FORM,
        name: service.name,
        serverUrl: service.serverUrl,
        transport: service.transport,
        credentialType: isBearer ? AgentVaultCredentialType.Bearer : AgentVaultCredentialType.OAuth,
        headerName: isBearer ? credential.headerName : "Authorization",
        headerPrefix: isBearer ? credential.headerPrefix : "Bearer",
        secret: isBearer ? UNCHANGED_SECRET : "",
        customHeaders: service.customHeaders.map((header) => ({
          id: header.id,
          name: header.name,
          prefix: header.prefix,
          value: UNCHANGED_SECRET
        }))
      });
    } else if (service) {
      const { credential } = service;
      const memberProvidedFields = storedMemberFields(service);
      // A member-provided field has no stored value, so it starts empty rather than as "unchanged".
      const storedValue = (field: TAgentVaultMemberProvidedField) =>
        memberProvidedFields.includes(field) ? "" : UNCHANGED_SECRET;
      reset({
        ...BLANK_SERVICE_FORM,
        name: service.name,
        hosts: displayHostPattern(service.hostPattern).split(", "),
        credentialType: credential.type,
        // Seeded even for a credential that has no header, so switching the type to Bearer starts from
        // the same defaults a new service gets. Left undefined, the submit would send an empty
        // prefix and the proxy would attach a bare token.
        headerName:
          credential.type === AgentVaultCredentialType.Bearer
            ? credential.headerName
            : "Authorization",
        headerPrefix:
          credential.type === AgentVaultCredentialType.Bearer ? credential.headerPrefix : "Bearer",
        username:
          credential.type === AgentVaultCredentialType.Basic
            ? storedValue(AgentVaultVariableReferenceField.CredentialUsername)
            : undefined,
        secret: (() => {
          if (credential.type === AgentVaultCredentialType.Passthrough) return "";
          return storedValue(AgentVaultVariableReferenceField.CredentialValue);
        })(),
        memberProvidedFields,
        methods: service.allowedMethods ?? [...HTTP_METHODS],
        pathPrefixes: service.allowedPathPrefixes ?? [],
        // The stored values never come back, so each row carries the sentinel until it is retyped.
        customHeaders: service.customHeaders.map((header) => ({
          id: header.id,
          name: header.name,
          prefix: header.prefix,
          value: UNCHANGED_SECRET
        })),
        substitutions: service.substitutions.map((substitution) => ({
          id: substitution.id,
          placeholder: substitution.placeholder,
          surfaces: substitution.surfaces,
          value: UNCHANGED_SECRET
        }))
      });
    } else if (prefillHost) {
      const { template: picked, form } = prefillFor(
        guessServiceTypeForRequest(prefillHost, prefillPath),
        prefillHost,
        prefillPath
      );
      setTemplate(picked);
      setOpenItem(form.serviceType === AgentVaultServiceType.Mcp ? "" : ADVANCED_ITEM);
      reset(form);
    } else {
      reset(BLANK_SERVICE_FORM);
    }
  }, [isOpen, service, isUpdate, prefillHost, prefillPath, reset, setStep]);

  // The template step is skipped for a prefilled sheet, so this is where a wrong guess of the type is corrected.
  const switchPrefillType = (serviceType: AgentVaultServiceType) => {
    if (!prefillHost) return;
    requestDiscardAction(() => {
      const { template: picked, form } = prefillFor(serviceType, prefillHost, prefillPath);
      setTemplate(picked);
      setOpenItem(serviceType === AgentVaultServiceType.Mcp ? "" : ADVANCED_ITEM);
      reset(form);
    });
  };

  const handleTemplatePicked = (
    picked: AgentVaultTemplate | null,
    serviceType: AgentVaultServiceType
  ) => {
    setTemplate(picked);
    if (serviceType === AgentVaultServiceType.Mcp) {
      setOpenItem("");
      reset(mcpFormFromTemplate(picked?.serviceType === AgentVaultServiceType.Mcp ? picked : null));
    } else {
      setOpenItem(ADVANCED_ITEM);
      reset(
        picked?.serviceType === AgentVaultServiceType.Http
          ? formFromTemplate(
              picked,
              picked.hostPattern.split(",").map((host) => host.trim())
            )
          : BLANK_SERVICE_FORM
      );
    }
    setStep(1);
  };

  const returnToTemplates = () =>
    requestDiscardAction(() => {
      setTemplate(null);
      reset(BLANK_SERVICE_FORM);
      setStep(0);
    });

  const onSubmit = async (data: TServiceForm) => {
    try {
      if (service) {
        await updateService.mutateAsync(
          buildUpdateServiceRequest(accessBundleId, service.id, data)
        );
      } else {
        await createService.mutateAsync(buildCreateServiceRequest(accessBundleId, data));
      }

      createNotification({
        text: `Service "${data.name}" ${isUpdate ? "updated" : "created"}`,
        type: "success"
      });

      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      const serverResponse = axios.isAxiosError(error)
        ? (error.response?.data as TApiErrors | undefined)
        : undefined;

      if (
        serverResponse?.error === ApiErrorTypes.BadRequestError &&
        serverResponse.message.includes("already covers")
      ) {
        setError(isMcp ? "serverUrl" : "hosts", {
          type: "server",
          message: serverResponse.message
        });
        setStep(stepKeys.indexOf(ServiceStep.Details));
        return;
      }

      const rejectedAuthorization =
        data.credentialType === AgentVaultCredentialType.OAuth
          ? rejectedAuthorizationMessage(error)
          : null;
      if (rejectedAuthorization) {
        setValue("oauthAuthorizationId", "");
        setValue("oauthAuthorizationRejection", rejectedAuthorization);
        setError("oauthAuthorizationId", { type: "server", message: rejectedAuthorization });
        setStep(stepKeys.indexOf(ServiceStep.Credential));
        return;
      }

      // Thrown after the stored halves are merged in, so the form cannot have known: it is told which
      // halves exist only as "unchanged", never whether one of them is empty.
      if (
        serverResponse?.error === ApiErrorTypes.BadRequestError &&
        serverResponse.message.includes("needs a username")
      ) {
        setError("username", { type: "server", message: serverResponse.message });
        setStep(stepKeys.indexOf(ServiceStep.Credential));
        return;
      }

      if (serverResponse?.error === ApiErrorTypes.ValidationError) {
        const STEP_OF_FIELD: Record<string, ServiceStep> = {
          name: ServiceStep.Details,
          hostPattern: ServiceStep.Details,
          serverUrl: ServiceStep.Details,
          transport: ServiceStep.Details,
          allowedMethods: ServiceStep.Details,
          allowedPathPrefixes: ServiceStep.Details,
          credential: ServiceStep.Credential,
          customHeaders: ServiceStep.Credential,
          substitutions: ServiceStep.Credential
        };

        const FORM_FIELD_OF: Record<string, keyof TServiceForm> = {
          hostPattern: isMcp ? "serverUrl" : "hosts",
          allowedMethods: "methods",
          allowedPathPrefixes: "pathPrefixes",
          credential:
            data.credentialType === AgentVaultCredentialType.OAuth
              ? "oauthAuthorizationId"
              : "secret"
        };

        let earliestStep: number | null = null;
        let unmapped = false;

        serverResponse.message.forEach((issue) => {
          const root = String(issue.path[0]);
          const issueStep = STEP_OF_FIELD[root];
          if (!issueStep) {
            unmapped = true;
            return;
          }

          const target =
            issue.path.length > 1 && (root === "customHeaders" || root === "substitutions")
              ? (issue.path.join(".") as keyof TServiceForm)
              : (FORM_FIELD_OF[root] ?? (root as keyof TServiceForm));

          setError(target, { type: "server", message: issue.message });
          const index = stepKeys.indexOf(issueStep);
          if (index !== -1 && (earliestStep === null || index < earliestStep)) earliestStep = index;
        });

        if (earliestStep !== null) setStep(earliestStep);
        if (unmapped) onRequestError(error);
        return;
      }

      if (serverResponse && SERVICE_SAVE_HANDLED_ERROR_CODES.includes(serverResponse.error)) {
        onRequestError(error);
      }
    }
  };

  const handleStepChange = async (target: number) => {
    if (target === step || isSigningIn) return;
    if (target < step) {
      if (stepKeys[target] === ServiceStep.Template) returnToTemplates();
      else setStep(target);
      return;
    }
    for (let i = step; i < target; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await trigger(stepFields[stepKeys[i]] as (keyof TServiceForm)[]))) {
        // Show the step that failed, or its error sits on a step nobody can see.
        setStep(i);
        return;
      }
    }
    setStep(target);
  };

  const handleNext = async () => {
    if (isLastStep) {
      handleSubmit(onSubmit, onFormInvalid)();
      return;
    }
    await goNext();
  };

  const customName = isMcp ? "Custom MCP Server" : "Custom HTTP API";

  const stepDescription = (meta: (typeof SERVICE_STEPS)[number]) => {
    if (meta.step === ServiceStep.Template) return template?.name ?? customName;
    if (meta.step === ServiceStep.Review && isUpdate) return "Confirm and save";
    return meta.shortDescription;
  };

  const current = steps[step];
  const [credentialType, serverUrl, oauthAuthorizationId, oauthAuthorizedUrl] = watch([
    "credentialType",
    "serverUrl",
    "oauthAuthorizationId",
    "oauthAuthorizedUrl"
  ]);

  useEffect(() => {
    if (!oauthAuthorizationId) return undefined;
    const timeout = window.setTimeout(() => {
      if (getValues("oauthAuthorizationId") !== oauthAuthorizationId) return;
      setValue("oauthAuthorizationId", "");
      if (getValues("credentialType") === AgentVaultCredentialType.OAuth) {
        setValue("oauthAuthorizationRejection", OAUTH_AUTHORIZATION_EXPIRED_MESSAGE);
        setError("oauthAuthorizationId", {
          type: "server",
          message: OAUTH_AUTHORIZATION_EXPIRED_MESSAGE
        });
      }
    }, OAUTH_AUTHORIZATION_LIFETIME_MS);
    return () => window.clearTimeout(timeout);
  }, [oauthAuthorizationId, getValues, setValue, setError]);

  const isAwaitingAuthorization =
    current.step === ServiceStep.Credential &&
    isOAuthAuthorizationMissing(
      {
        serviceType: isMcp ? AgentVaultServiceType.Mcp : AgentVaultServiceType.Http,
        credentialType,
        serverUrl,
        oauthAuthorizationId,
        oauthAuthorizedUrl
      },
      service
    );
  const isTemplateStep = current.step === ServiceStep.Template;
  const saveLabel = isUpdate ? "Save" : "Add Service";

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (nextOpen) {
          onOpenChange(true);
          return;
        }
        requestDiscardAction(() => onOpenChange(false));
      }}
    >
      <SheetContent className="flex h-full max-h-full w-screen flex-col gap-y-0 sm:max-w-[90vw] xl:max-w-7xl">
        <SheetHeader>
          {isTemplateStep ? (
            <>
              <SheetTitle>Choose a template</SheetTitle>
              <SheetDescription>
                Start from a template, or configure the service yourself.
              </SheetDescription>
            </>
          ) : (
            <>
              <SheetTitle className="flex items-center gap-2.5">
                {template && (
                  <ProviderIcon icon={template.image} alt="" className="size-6 object-contain" />
                )}
                {template?.name ?? (isUpdate ? service?.name : customName)}
                <DocumentationLinkBadge href={SERVICE_DOCS_URL} />
              </SheetTitle>
              <SheetDescription>Set up the service and its credentials.</SheetDescription>
            </>
          )}
        </SheetHeader>

        <FormProvider {...formMethods}>
          {isTemplateStep ? (
            <div className="flex min-h-0 flex-1">
              <ServiceTemplateSelect onSelect={handleTemplatePicked} />
            </div>
          ) : (
            // Nothing submits natively: a type="submit" on the last step is the same reconciled node as Continue,
            // so the click that advances to Review would also save.
            <form onSubmit={(e) => e.preventDefault()} className="flex min-h-0 flex-1 flex-col">
              <div className="flex min-h-0 flex-1 overflow-hidden">
                <aside className="flex w-60 shrink-0 flex-col border-r border-border px-5 py-6">
                  <p className="mb-5 text-[11px] font-medium tracking-wider text-muted uppercase">
                    Setup steps
                  </p>
                  <Stepper
                    activeStep={step}
                    orientation="vertical"
                    nonLinear={isUpdate}
                    onStepChange={handleStepChange}
                  >
                    <StepperList>
                      {steps.map((meta, index) => (
                        <StepperStep
                          key={meta.step}
                          index={index}
                          title={meta.name}
                          description={stepDescription(meta)}
                        />
                      ))}
                    </StepperList>
                  </Stepper>
                </aside>

                <div
                  ref={panelRef}
                  className="flex min-w-0 flex-1 flex-col overflow-y-auto px-8 py-6"
                >
                  <div className="mb-6">
                    <h2 className="text-lg font-normal text-foreground">{current.title}</h2>
                    <p className="mt-1 text-sm text-muted">{current.subtitle}</p>
                  </div>

                  {current.step === ServiceStep.Details && (
                    <div className="flex flex-col gap-5">
                      {prefillHost && !isUpdate && (
                        <PrefillTypeField
                          value={isMcp ? AgentVaultServiceType.Mcp : AgentVaultServiceType.Http}
                          onChange={switchPrefillType}
                        />
                      )}
                      {isMcp ? <McpDetailsFields /> : <DetailsFields />}
                    </div>
                  )}
                  {current.step === ServiceStep.Credential && isMcp && (
                    <ServiceVariablesContext.Provider value={serviceVariables}>
                      <McpCredentialFields
                        accessBundleId={accessBundleId}
                        service={service}
                        openItem={openItem}
                        onOpenChange={setOpenItem}
                        onSignInChange={setIsSigningIn}
                      />
                    </ServiceVariablesContext.Provider>
                  )}
                  {current.step === ServiceStep.Credential && !isMcp && (
                    <ServiceVariablesContext.Provider value={serviceVariables}>
                      <div className="flex flex-col gap-5">
                        <CredentialFields
                          storedType={service?.credential.type}
                          storedMemberFields={storedMemberFields(service)}
                        />
                        <TransformationsFields openItem={openItem} onOpenChange={setOpenItem} />
                      </div>
                    </ServiceVariablesContext.Provider>
                  )}
                  {current.step === ServiceStep.Review && (
                    <ReviewFields
                      isUpdate={isUpdate}
                      service={service}
                      storedType={service?.credential.type}
                      storedMemberFields={storedMemberFields(service)}
                    />
                  )}
                </div>

                <aside className="hidden w-80 shrink-0 flex-col gap-4 overflow-y-auto border-l border-border px-6 py-6 lg:flex">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-medium tracking-wider text-muted uppercase">
                      Step {step + 1} · {current.rightLabel}
                    </p>
                    <DocumentationLinkBadge href={SERVICE_DOCS_URL} />
                  </div>
                  <p className="text-sm font-semibold text-foreground">What this step does</p>
                  <p className="text-sm leading-relaxed text-muted">{current.rightDescription}</p>
                  {current.rightTip && (
                    <p className="text-sm leading-relaxed text-muted">{current.rightTip}</p>
                  )}
                </aside>
              </div>

              <SheetFooter className="items-center justify-between border-t">
                <span className="text-xs text-muted">
                  {isSigningIn && "Finish or cancel signing in first."}
                  {!isSigningIn && isDirty && "Unsaved changes"}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted">
                    Step {step + 1} of {steps.length}
                  </span>
                  {step > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      isDisabled={isSigningIn}
                      onClick={
                        stepKeys[step - 1] === ServiceStep.Template ? returnToTemplates : goBack
                      }
                    >
                      Back
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="av"
                    onClick={handleNext}
                    isDisabled={isAwaitingAuthorization || isSigningIn}
                    isPending={isLastStep && isSubmitting}
                  >
                    {isLastStep ? saveLabel : "Continue"}
                  </Button>
                </div>
              </SheetFooter>
            </form>
          )}
        </FormProvider>

        <VariableFormDialog
          isOpen={newVariableKey !== null}
          onOpenChange={(open) => {
            if (!open) setNewVariableKey(null);
          }}
          initialKey={newVariableKey ?? undefined}
          onCreated={(variable) => {
            if (newVariableRequest.current) newVariableRequest.current.created = variable;
          }}
          // The dialog opens from no trigger, so its default would drop focus on the body.
          onCloseAutoFocus={(event) => {
            const request = newVariableRequest.current;
            if (!request) return;
            event.preventDefault();
            newVariableRequest.current = null;
            request.resolve(request.created);
          }}
        />

        <DiscardChangesAlertDialog
          open={isDiscardDialogOpen}
          onOpenChange={setIsDiscardDialogOpen}
          onDiscard={confirmDiscard}
          title="Discard Changes?"
          description="Your changes will be lost."
        />
      </SheetContent>
    </Sheet>
  );
};
