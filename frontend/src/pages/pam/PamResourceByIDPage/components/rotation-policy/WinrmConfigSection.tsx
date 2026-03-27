import { InfoIcon } from "lucide-react";

import {
  Field,
  FieldContent,
  FieldLabel,
  Label,
  Switch,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  UnstableInput
} from "@app/components/v3";

type Props = {
  winrmPort: number;
  useWinrmHttps: boolean;
  winrmRejectUnauthorized: boolean;
  winrmCaCert: string;
  winrmTlsServerName: string;
  onWinrmPortChange: (port: number) => void;
  onUseWinrmHttpsChange: (value: boolean) => void;
  onWinrmRejectUnauthorizedChange: (value: boolean) => void;
  onWinrmCaCertChange: (value: string) => void;
  onWinrmTlsServerNameChange: (value: string) => void;
};

export const WinrmConfigSection = ({
  winrmPort,
  useWinrmHttps,
  winrmRejectUnauthorized,
  winrmCaCert,
  winrmTlsServerName,
  onWinrmPortChange,
  onUseWinrmHttpsChange,
  onWinrmRejectUnauthorizedChange,
  onWinrmCaCertChange,
  onWinrmTlsServerNameChange
}: Props) => {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label>WinRM Configuration</Label>
        <p className="text-xs text-muted">
          WinRM is used to execute password rotation commands on the Windows machine
        </p>
      </div>

      <Field>
        <FieldLabel>
          Port
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
            </TooltipTrigger>
            <TooltipContent>
              The WinRM port on this machine. Default is 5985 for HTTP or 5986 for HTTPS
            </TooltipContent>
          </Tooltip>
        </FieldLabel>
        <FieldContent>
          <UnstableInput
            type="number"
            value={winrmPort}
            onChange={(e) => onWinrmPortChange(Number(e.target.value))}
            placeholder="5985"
          />
        </FieldContent>
      </Field>

      <Field orientation="horizontal">
        <FieldLabel>Enable HTTPS</FieldLabel>
        <Switch variant="project" checked={useWinrmHttps} onCheckedChange={onUseWinrmHttpsChange} />
      </Field>

      <Field>
        <FieldLabel>CA Certificate</FieldLabel>
        <FieldContent>
          <TextArea
            value={winrmCaCert}
            onChange={(e) => onWinrmCaCertChange(e.target.value)}
            className="max-h-32"
            disabled={!useWinrmHttps}
            placeholder="-----BEGIN CERTIFICATE-----..."
          />
        </FieldContent>
      </Field>

      <Field orientation="horizontal">
        <FieldLabel>
          Reject Unauthorized
          <Tooltip>
            <TooltipTrigger asChild>
              <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
            </TooltipTrigger>
            <TooltipContent>
              If enabled, Infisical will only connect if the machine has a valid, trusted TLS
              certificate
            </TooltipContent>
          </Tooltip>
        </FieldLabel>
        <Switch
          variant="project"
          disabled={!useWinrmHttps}
          checked={useWinrmHttps ? winrmRejectUnauthorized : false}
          onCheckedChange={onWinrmRejectUnauthorizedChange}
        />
      </Field>

      <Field>
        <FieldLabel>
          TLS Server Name
          <Tooltip>
            <TooltipTrigger>
              <InfoIcon className="mb-0.5 inline-block size-3 text-accent" />
            </TooltipTrigger>
            <TooltipContent>
              The expected hostname in the server&apos;s TLS certificate. Required when connecting
              via IP address and Reject Unauthorized is enabled.
            </TooltipContent>
          </Tooltip>
        </FieldLabel>
        <FieldContent>
          <UnstableInput
            value={winrmTlsServerName}
            onChange={(e) => onWinrmTlsServerNameChange(e.target.value)}
            placeholder="server.corp.example.com"
            disabled={!useWinrmHttps || !winrmRejectUnauthorized}
          />
        </FieldContent>
      </Field>
    </div>
  );
};
