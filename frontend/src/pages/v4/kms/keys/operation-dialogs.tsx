import { type FormEvent, type ReactNode, useState } from "react";
import { useDiscardChangesGuard } from "@infisical/cipher/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "@infisical/cipher/ui/alert-dialog";
import { Button } from "@infisical/cipher/ui/button";
import { Detail, DetailGroup, DetailLabel, DetailValue } from "@infisical/cipher/ui/detail";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@infisical/cipher/ui/dialog";
import { Field } from "@infisical/cipher/ui/field";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import { Select } from "@infisical/cipher/ui/select";
import { CopyButton } from "@infisical/cipher/ui/sensitive-editor";
import { Snippet } from "@infisical/cipher/ui/snippet";
import { Switch } from "@infisical/cipher/ui/switch";
import { StatusText } from "@infisical/cipher/ui/text";
import { Textarea } from "@infisical/cipher/ui/textarea";

import { getAllowedSigningAlgorithms, getDefaultSigningAlgorithm } from "@app/helpers/kms";
import type { SigningAlgorithm, TCmek } from "@app/hooks/api/cmeks/types";

import { failed, saved, toast } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { decodeBase64Text, isBase64 } from "./shared";

type DialogProps = { cmek: TCmek; onClose: () => void };

const ENCODED_HINT = "Turn on if the data is already Base64, so it isn't encoded twice.";
const SIGNATURE_INVALID =
  "The signature wasn't created with this key and signing algorithm, or the data or signature changed.";
const MAC_INVALID = "The MAC wasn't generated with this key, or the data changed.";

const useRun = () => {
  const [pending, setPending] = useState(false);
  const run = async (task: () => Promise<void>, failure: string) => {
    setPending(true);
    try {
      await task();
    } catch (error) {
      failed(failure, error);
    } finally {
      setPending(false);
    }
  };
  return { pending, run };
};

const OperationDialog = ({
  title,
  description,
  pending,
  dirty,
  done,
  submitLabel,
  onSubmit,
  onClose,
  children
}: {
  title: string;
  description: ReactNode;
  pending: boolean;
  dirty: boolean;
  done: boolean;
  submitLabel: string;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
}) => {
  const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
    isDirty: dirty && !done,
    onDiscard: onClose
  });
  return (
    <>
      <Dialog open onOpenChange={(open) => !open && requestDiscard()}>
        <DialogContent pending={pending}>
          <form
            autoComplete="off"
            onSubmit={(event: FormEvent) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <DialogHeader>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription>{description}</DialogDescription>
            </DialogHeader>
            <Stack gap={16}>{children}</Stack>
            <DialogFooter>
              <Inline gap={8} justify="end">
                {done ? (
                  <Button variant="primary" type="button" onClick={onClose}>
                    Close
                  </Button>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      type="button"
                      disabled={pending}
                      onClick={requestDiscard}
                    >
                      Cancel
                    </Button>
                    <Button variant="primary" type="submit" loading={pending}>
                      {submitLabel}
                    </Button>
                  </>
                )}
              </Inline>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <DiscardChangesAlertDialog {...discardDialogProps} />
    </>
  );
};

const EncodedSwitch = ({
  checked,
  onChange
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
}) => (
  <Switch
    label="Data is Base64 encoded"
    description={ENCODED_HINT}
    checked={checked}
    onChange={onChange}
  />
);

const Result = ({ label, value }: { label: string; value: string }) => (
  <Field label={label} wide>
    <Snippet
      label={label}
      value={value}
      maxLines={8}
      copyLabel={`Copy ${label.toLowerCase()}`}
      onCopy={() => saved(`${label} copied`)}
    />
  </Field>
);

const Verdict = ({
  valid,
  algorithmLabel,
  algorithm
}: {
  valid: boolean;
  algorithmLabel: string;
  algorithm: string;
}) => (
  <DetailGroup>
    <Detail>
      <DetailLabel>Result</DetailLabel>
      <DetailValue>
        {valid ? (
          <StatusText tone="ok" icon="check-c">
            Valid
          </StatusText>
        ) : (
          <StatusText tone="bad" icon="alert-c">
            Invalid
          </StatusText>
        )}
      </DetailValue>
    </Detail>
    <Detail>
      <DetailLabel>{algorithmLabel}</DetailLabel>
      <DetailValue>{algorithm.replaceAll("_", " ")}</DetailValue>
    </Detail>
  </DetailGroup>
);

export const EncryptDialog = ({ cmek, onClose }: DialogProps) => {
  const encrypt = useV4Adapter("kms").useEncrypt();
  const { pending, run } = useRun();
  const [plaintext, setPlaintext] = useState("");
  const [isBase64Encoded, setIsBase64Encoded] = useState(false);
  const [ciphertext, setCiphertext] = useState<string>();
  return (
    <OperationDialog
      title="Encrypt data"
      description={`Encrypts with ${cmek.name} and returns Base64 ciphertext.`}
      pending={pending}
      dirty={Boolean(plaintext)}
      done={ciphertext !== undefined}
      submitLabel="Encrypt"
      onClose={onClose}
      onSubmit={() =>
        run(async () => {
          const result = await encrypt.mutateAsync({ keyId: cmek.id, plaintext, isBase64Encoded });
          setCiphertext(result.ciphertext);
          saved("Data encrypted");
        }, "Failed to encrypt data")
      }
    >
      {ciphertext !== undefined ? (
        <Result label="Ciphertext" value={ciphertext} />
      ) : (
        <>
          <Field label="Plaintext" wide>
            <Textarea
              autoFocus
              rows={5}
              value={plaintext}
              onChange={(event) => setPlaintext(event.target.value)}
            />
          </Field>
          <EncodedSwitch checked={isBase64Encoded} onChange={setIsBase64Encoded} />
        </>
      )}
    </OperationDialog>
  );
};

export const DecryptDialog = ({ cmek, onClose }: DialogProps) => {
  const decrypt = useV4Adapter("kms").useDecrypt();
  const { pending, run } = useRun();
  const [ciphertext, setCiphertext] = useState("");
  const [shouldDecode, setShouldDecode] = useState(false);
  const [plaintext, setPlaintext] = useState<string>();
  const shown = plaintext !== undefined && shouldDecode ? decodeBase64Text(plaintext) : plaintext;
  return (
    <OperationDialog
      title="Decrypt data"
      description={`Decrypts ciphertext with ${cmek.name} and returns Base64 plaintext.`}
      pending={pending}
      dirty={Boolean(ciphertext)}
      done={plaintext !== undefined}
      submitLabel="Decrypt"
      onClose={onClose}
      onSubmit={() =>
        run(async () => {
          const result = await decrypt.mutateAsync({ keyId: cmek.id, ciphertext });
          setPlaintext(result.plaintext);
          saved("Data decrypted");
        }, "Failed to decrypt data")
      }
    >
      {shown === undefined && (
        <Field label="Ciphertext" wide>
          <Textarea
            autoFocus
            mono
            rows={5}
            value={ciphertext}
            onChange={(event) => setCiphertext(event.target.value)}
          />
        </Field>
      )}
      {shown !== undefined && shouldDecode && (
        <Field label="Plaintext" wide>
          <Stack gap={8}>
            <Textarea readOnly rows={5} value={shown} />
            <Inline justify="end">
              <CopyButton
                value={shown}
                label="Copy plaintext"
                onCopy={() => saved("Plaintext copied")}
              />
            </Inline>
          </Stack>
        </Field>
      )}
      {shown !== undefined && !shouldDecode && <Result label="Plaintext" value={shown} />}
      <Switch
        label="Decode Base64"
        description="Turn on if the original data was plain text."
        checked={shouldDecode}
        onChange={setShouldDecode}
      />
    </OperationDialog>
  );
};

const useSigningAlgorithm = (cmek: TCmek) => {
  const [signingAlgorithm, setSigningAlgorithm] = useState(getDefaultSigningAlgorithm(cmek));
  const options = getAllowedSigningAlgorithms(cmek).map((value) => ({
    value,
    label: value.replaceAll("_", " ")
  }));
  const field = (
    <Field label="Signing algorithm" wide>
      <Select
        label="Signing algorithm"
        value={signingAlgorithm}
        options={options}
        onChange={(value) => setSigningAlgorithm(value as SigningAlgorithm)}
      />
    </Field>
  );
  return { signingAlgorithm, field };
};

export const SignDialog = ({ cmek, onClose }: DialogProps) => {
  const sign = useV4Adapter("kms").useSign();
  const { pending, run } = useRun();
  const { signingAlgorithm, field } = useSigningAlgorithm(cmek);
  const [data, setData] = useState("");
  const [isBase64Encoded, setIsBase64Encoded] = useState(false);
  const [signature, setSignature] = useState<string>();
  return (
    <OperationDialog
      title="Sign data"
      description={`Signs with ${cmek.name} and returns a Base64 signature.`}
      pending={pending}
      dirty={Boolean(data)}
      done={signature !== undefined}
      submitLabel="Sign"
      onClose={onClose}
      onSubmit={() =>
        run(async () => {
          const result = await sign.mutateAsync({
            keyId: cmek.id,
            data,
            signingAlgorithm,
            isBase64Encoded
          });
          setSignature(result.signature);
          saved("Data signed");
        }, "Failed to sign data")
      }
    >
      {signature !== undefined ? (
        <Result label="Signature" value={signature} />
      ) : (
        <>
          <Field label="Data to sign" wide>
            <Textarea
              autoFocus
              rows={7}
              value={data}
              onChange={(event) => setData(event.target.value)}
            />
          </Field>
          {field}
          <EncodedSwitch checked={isBase64Encoded} onChange={setIsBase64Encoded} />
        </>
      )}
    </OperationDialog>
  );
};

const encodedError = (value: string, name: string) => {
  if (!value) return `${name} cannot be empty`;
  return isBase64(value.trim()) ? undefined : `${name} must be Base64 encoded`;
};

export const VerifyDialog = ({ cmek, onClose }: DialogProps) => {
  const verify = useV4Adapter("kms").useVerify();
  const { pending, run } = useRun();
  const { signingAlgorithm, field } = useSigningAlgorithm(cmek);
  const [data, setData] = useState("");
  const [signature, setSignature] = useState("");
  const [isBase64Encoded, setIsBase64Encoded] = useState(false);
  const [errors, setErrors] = useState<{ data?: string; signature?: string }>({});
  const [result, setResult] = useState<{ valid: boolean; algorithm: string }>();
  const submit = () => {
    const next = {
      data: data ? undefined : "Data cannot be empty",
      signature: encodedError(signature, "Signature")
    };
    setErrors(next);
    if (next.data || next.signature) return;
    run(async () => {
      const response = await verify.mutateAsync({
        keyId: cmek.id,
        data,
        signature: signature.trim(),
        signingAlgorithm,
        isBase64Encoded
      });
      setResult({ valid: response.signatureValid, algorithm: response.signingAlgorithm });
      if (response.signatureValid) saved("Signature is valid");
      else toast({ tone: "bad", title: "Signature is invalid", description: SIGNATURE_INVALID });
    }, "Failed to verify signature");
  };
  return (
    <OperationDialog
      title="Verify signature"
      description={`Checks a signature against ${cmek.name}.`}
      pending={pending}
      dirty={Boolean(data || signature)}
      done={result !== undefined}
      submitLabel="Verify"
      onClose={onClose}
      onSubmit={submit}
    >
      {result ? (
        <Verdict
          valid={result.valid}
          algorithmLabel="Signing algorithm"
          algorithm={result.algorithm}
        />
      ) : (
        <>
          <Field label="Data to verify" error={errors.data} wide>
            <Textarea
              autoFocus
              rows={5}
              value={data}
              onChange={(event) => setData(event.target.value)}
            />
          </Field>
          <Field
            label="Signature"
            help="Base64, like the signature returned when the data was signed."
            error={errors.signature}
            wide
          >
            <Textarea
              mono
              rows={4}
              value={signature}
              onChange={(event) => setSignature(event.target.value)}
            />
          </Field>
          {field}
          <EncodedSwitch checked={isBase64Encoded} onChange={setIsBase64Encoded} />
        </>
      )}
    </OperationDialog>
  );
};

export const GenerateMacDialog = ({ cmek, onClose }: DialogProps) => {
  const generate = useV4Adapter("kms").useGenerateMac();
  const { pending, run } = useRun();
  const [data, setData] = useState("");
  const [isBase64Encoded, setIsBase64Encoded] = useState(false);
  const [error, setError] = useState<string>();
  const [mac, setMac] = useState<string>();
  return (
    <OperationDialog
      title="Generate MAC"
      description={`Generates a message authentication code with ${cmek.name} and returns it in Base64.`}
      pending={pending}
      dirty={Boolean(data)}
      done={mac !== undefined}
      submitLabel="Generate MAC"
      onClose={onClose}
      onSubmit={() => {
        setError(data ? undefined : "Data cannot be empty");
        if (!data) return;
        run(async () => {
          const result = await generate.mutateAsync({ keyId: cmek.id, data, isBase64Encoded });
          setMac(result.mac);
          saved("MAC generated");
        }, "Failed to generate MAC");
      }}
    >
      {mac !== undefined ? (
        <Result label="MAC" value={mac} />
      ) : (
        <>
          <Field label="Data to authenticate" error={error} wide>
            <Textarea
              autoFocus
              rows={5}
              value={data}
              onChange={(event) => setData(event.target.value)}
            />
          </Field>
          <EncodedSwitch checked={isBase64Encoded} onChange={setIsBase64Encoded} />
        </>
      )}
    </OperationDialog>
  );
};

export const VerifyMacDialog = ({ cmek, onClose }: DialogProps) => {
  const verify = useV4Adapter("kms").useVerifyMac();
  const { pending, run } = useRun();
  const [data, setData] = useState("");
  const [mac, setMac] = useState("");
  const [isBase64Encoded, setIsBase64Encoded] = useState(false);
  const [errors, setErrors] = useState<{ data?: string; mac?: string }>({});
  const [result, setResult] = useState<{ valid: boolean; algorithm: string }>();
  const submit = () => {
    const next = {
      data: data ? undefined : "Data cannot be empty",
      mac: encodedError(mac, "MAC")
    };
    setErrors(next);
    if (next.data || next.mac) return;
    run(async () => {
      const response = await verify.mutateAsync({
        keyId: cmek.id,
        data,
        mac: mac.trim(),
        isBase64Encoded
      });
      setResult({ valid: response.macValid, algorithm: response.macAlgorithm });
      if (response.macValid) saved("MAC is valid");
      else toast({ tone: "bad", title: "MAC is invalid", description: MAC_INVALID });
    }, "Failed to verify MAC");
  };
  return (
    <OperationDialog
      title="Verify MAC"
      description={`Checks a message authentication code against ${cmek.name}.`}
      pending={pending}
      dirty={Boolean(data || mac)}
      done={result !== undefined}
      submitLabel="Verify MAC"
      onClose={onClose}
      onSubmit={submit}
    >
      {result ? (
        <Verdict valid={result.valid} algorithmLabel="MAC algorithm" algorithm={result.algorithm} />
      ) : (
        <>
          <Field label="Data to verify" error={errors.data} wide>
            <Textarea
              autoFocus
              rows={5}
              value={data}
              onChange={(event) => setData(event.target.value)}
            />
          </Field>
          <Field
            label="MAC"
            help="Base64, like the MAC returned when it was generated."
            error={errors.mac}
            wide
          >
            <Textarea mono rows={3} value={mac} onChange={(event) => setMac(event.target.value)} />
          </Field>
          <EncodedSwitch checked={isBase64Encoded} onChange={setIsBase64Encoded} />
        </>
      )}
    </OperationDialog>
  );
};
