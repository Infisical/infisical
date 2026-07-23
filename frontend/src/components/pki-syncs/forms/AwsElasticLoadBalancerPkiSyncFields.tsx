import { useEffect, useRef } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { Info, Loader2Icon } from "lucide-react";

import {
  Checkbox,
  Field,
  FieldError,
  FieldLabel,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";
import { AWS_REGIONS } from "@app/helpers/appConnections";
import {
  PkiSync,
  TAwsListener,
  useListAwsListeners,
  useListAwsLoadBalancers
} from "@app/hooks/api/pkiSyncs";

import { TPkiSyncForm } from "./schemas/pki-sync-schema";
import { PkiSyncConnectionField } from "./PkiSyncConnectionField";

type TAwsElasticLoadBalancerForm = TPkiSyncForm & { destination: PkiSync.AwsElasticLoadBalancer };

const ListenersLoadingState = () => (
  <div className="flex items-center justify-center py-4">
    <Loader2Icon className="size-4 animate-spin text-muted" />
    <span className="ml-2 text-sm text-muted">Loading listeners...</span>
  </div>
);

const NoListenersState = () => (
  <div className="rounded-md border border-border bg-background p-4 text-center text-sm text-muted">
    No HTTPS/TLS listeners found for this load balancer.
  </div>
);

type ListenerItemProps = {
  listener: TAwsListener;
  isSelected: boolean;
  onToggle: (listener: TAwsListener, checked: boolean) => void;
};

const ListenerItem = ({ listener, isSelected, onToggle }: ListenerItemProps) => (
  <div className="flex items-center justify-between rounded-md border border-border bg-container p-3">
    <div className="flex items-center gap-3">
      <Checkbox
        id={`listener-${listener.listenerArn}`}
        variant="project"
        isChecked={isSelected}
        onCheckedChange={(checked) => onToggle(listener, checked === true)}
      />
      <div>
        <FieldLabel
          htmlFor={`listener-${listener.listenerArn}`}
          className="mb-0 cursor-pointer text-sm font-medium text-foreground"
        >
          Port {listener.port} ({listener.protocol})
        </FieldLabel>
        {listener.sslPolicy && (
          <p className="text-xs text-muted">SSL Policy: {listener.sslPolicy}</p>
        )}
      </div>
    </div>
  </div>
);

export const AwsElasticLoadBalancerPkiSyncFields = () => {
  const { control, watch, setValue } = useFormContext<TAwsElasticLoadBalancerForm>();

  const connectionId = watch("connection.id");
  const region = watch("destinationConfig.region");
  const loadBalancerArn = watch("destinationConfig.loadBalancerArn");

  const isInitialMount = useRef(true);
  const previousRegion = useRef(region);
  const previousLoadBalancerArn = useRef(loadBalancerArn);

  const { fields, replace } = useFieldArray({
    control,
    name: "destinationConfig.listeners"
  });

  const { data: loadBalancers, isLoading: isLoadingLoadBalancers } = useListAwsLoadBalancers(
    { connectionId, region },
    { enabled: !!connectionId && !!region }
  );

  const { data: listeners, isLoading: isLoadingListeners } = useListAwsListeners(
    { connectionId, region, loadBalancerArn },
    { enabled: !!connectionId && !!region && !!loadBalancerArn }
  );

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      previousRegion.current = region;
      previousLoadBalancerArn.current = loadBalancerArn;
      return;
    }

    if (region && previousRegion.current && region !== previousRegion.current) {
      setValue("destinationConfig.loadBalancerArn", "");
      replace([]);
    }
    previousRegion.current = region;
  }, [region, setValue, replace]);

  useEffect(() => {
    if (!loadBalancerArn || !listeners || listeners.length === 0) {
      return;
    }

    if (previousLoadBalancerArn.current && loadBalancerArn !== previousLoadBalancerArn.current) {
      const defaultListeners = listeners.map((listener) => ({
        listenerArn: listener.listenerArn,
        port: listener.port,
        protocol: listener.protocol
      }));
      replace(defaultListeners);
      previousLoadBalancerArn.current = loadBalancerArn;
      return;
    }

    previousLoadBalancerArn.current = loadBalancerArn;

    const currentListeners = fields;
    const hasValidListeners =
      currentListeners.length > 0 &&
      currentListeners.some((l) =>
        listeners.some((apiListener) => apiListener.listenerArn === l.listenerArn)
      );

    if (!hasValidListeners) {
      const defaultListeners = listeners.map((listener) => ({
        listenerArn: listener.listenerArn,
        port: listener.port,
        protocol: listener.protocol
      }));
      replace(defaultListeners);
    }
  }, [listeners, loadBalancerArn, fields, replace]);

  const handleListenerToggle = (listener: TAwsListener, checked: boolean) => {
    const currentListeners = fields;

    if (checked) {
      const newListeners = [
        ...currentListeners,
        {
          listenerArn: listener.listenerArn,
          port: listener.port,
          protocol: listener.protocol
        }
      ];
      replace(newListeners);
    } else {
      const newListeners = currentListeners.filter((l) => l.listenerArn !== listener.listenerArn);
      replace(newListeners);
    }
  };

  const selectedListenerArns = new Set(fields.map((l) => l.listenerArn));

  const renderListenersContent = () => {
    if (isLoadingListeners) {
      return <ListenersLoadingState />;
    }

    if (!listeners || listeners.length === 0) {
      return <NoListenersState />;
    }

    return (
      <div className="space-y-3 rounded-md border border-border bg-background p-4">
        {listeners.map((listener) => {
          const isSelected = selectedListenerArns.has(listener.listenerArn);

          return (
            <ListenerItem
              key={listener.listenerArn}
              listener={listener}
              isSelected={isSelected}
              onToggle={handleListenerToggle}
            />
          );
        })}
      </div>
    );
  };

  return (
    <>
      <PkiSyncConnectionField
        onChange={() => {
          setValue("destinationConfig.region", "");
          setValue("destinationConfig.loadBalancerArn", "");
          replace([]);
        }}
      />

      <Controller
        name="destinationConfig.region"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              AWS Region
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  Select the AWS region where your Elastic Load Balancers are located.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            <Select
              value={field.value ?? ""}
              onValueChange={(value) => {
                field.onChange(value);
              }}
              disabled={!connectionId}
            >
              <SelectTrigger className="w-full capitalize" isError={Boolean(error)}>
                <SelectValue placeholder="Select an AWS region" />
              </SelectTrigger>
              <SelectContent position="popper">
                {AWS_REGIONS.map(({ name, slug }) => (
                  <SelectItem value={slug} key={slug}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldError errors={[error]} />
          </Field>
        )}
      />

      <Controller
        name="destinationConfig.loadBalancerArn"
        control={control}
        render={({ field, fieldState: { error } }) => (
          <Field className="mb-4">
            <FieldLabel>
              Load Balancer
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info />
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  Select the Application or Network Load Balancer to deploy certificates to.
                </TooltipContent>
              </Tooltip>
            </FieldLabel>
            {isLoadingLoadBalancers ? (
              <div className="flex items-center justify-center py-4">
                <Loader2Icon className="size-4 animate-spin text-muted" />
                <span className="ml-2 text-sm text-muted">Loading load balancers...</span>
              </div>
            ) : (
              <Select
                value={field.value ?? ""}
                onValueChange={(value) => {
                  field.onChange(value);
                  replace([]);
                }}
                disabled={!connectionId || !region}
              >
                <SelectTrigger className="w-full" isError={Boolean(error)}>
                  <SelectValue placeholder="Select a load balancer" />
                </SelectTrigger>
                <SelectContent position="popper">
                  {loadBalancers?.map((lb) => (
                    <SelectItem value={lb.loadBalancerArn} key={lb.loadBalancerArn}>
                      {lb.loadBalancerName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <FieldError errors={[error]} />
          </Field>
        )}
      />

      {loadBalancerArn && (
        <Controller
          name="destinationConfig.listeners"
          control={control}
          render={({ fieldState: { error } }) => (
            <Field className="mb-4">
              <FieldLabel>
                HTTPS/TLS Listeners
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">
                    Select which listeners should receive the certificate. You can set a default
                    certificate from the certificates table after creating the sync.
                  </TooltipContent>
                </Tooltip>
              </FieldLabel>
              {renderListenersContent()}
              <FieldError errors={[error]} />
            </Field>
          )}
        />
      )}
    </>
  );
};
