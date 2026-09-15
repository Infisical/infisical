import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DownloadIcon, KeyRoundIcon } from "lucide-react";
import { z } from "zod";

import {
  Button,
  CopyButton,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
  TextArea
} from "@app/components/v3";
import { TCmek, useCmekDeriveSharedSecret } from "@app/hooks/api/cmeks";

import { downloadJSON } from "./jsonExport";
import { getPublicKeyFormat, parsePublicKey } from "./utils";

const formSchema = z.object({
  publicKey: z
    .string()
    .trim()
    .min(1, "A public key is required")
    .refine(
      (value) => Boolean(parsePublicKey(value)),
      "Enter a byte array, hexadecimal value, or Base64-encoded DER/SPKI public key"
    )
});

type FormData = z.infer<typeof formSchema>;

type Props = {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  cmek?: TCmek;
};

export const CmekDeriveSharedSecretModal = ({ isOpen, onOpenChange, cmek }: Props) => {
  const deriveSharedSecret = useCmekDeriveSharedSecret();
  const {
    handleSubmit,
    register,
    reset,
    watch,
    formState: { errors }
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: { publicKey: "" }
  });

  const handleDeriveSharedSecret = async ({ publicKey }: FormData) => {
    const parsedPublicKey = parsePublicKey(publicKey);
    if (!parsedPublicKey) return;

    if (!cmek) return;

    await deriveSharedSecret.mutateAsync({ kmsId: cmek.id, publicKey: parsedPublicKey });
  };

  const result = deriveSharedSecret.data;
  const publicKeyFormat = getPublicKeyFormat(watch("publicKey"));

  const handleOpenChange = (isModalOpen: boolean) => {
    if (!isModalOpen) {
      reset();
      deriveSharedSecret.reset();
    }

    onOpenChange(isModalOpen);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Derive Shared Secret</DialogTitle>
          <DialogDescription>
            Derive a shared secret using{" "}
            <span className="font-medium text-foreground">{cmek?.name}</span>.
          </DialogDescription>
        </DialogHeader>
        {result ? (
          <Field>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="derived-shared-secret">Derived Shared Secret</FieldLabel>
              <CopyButton
                value={result.secret}
                ariaLabel="Copy derived shared secret"
                variant="outline"
              />
            </div>
            <TextArea
              id="derived-shared-secret"
              className="min-h-32 font-mono"
              value={result.secret}
              readOnly
            />
            <FieldDescription>The derived secret is Base64-encoded.</FieldDescription>
          </Field>
        ) : (
          <form id="derive-shared-secret-form" onSubmit={handleSubmit(handleDeriveSharedSecret)}>
            <Field data-invalid={Boolean(errors.publicKey)}>
              <FieldLabel htmlFor="public-key">
                Public Key
                {publicKeyFormat && (
                  <span className="text-2xs font-normal text-muted">
                    (
                    {publicKeyFormat === "byte-array"
                      ? "Byte array"
                      : publicKeyFormat.toUpperCase()}
                    )
                  </span>
                )}
              </FieldLabel>
              <TextArea
                id="public-key"
                className="min-h-32 font-mono"
                placeholder="MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE..."
                isError={Boolean(errors.publicKey)}
                {...register("publicKey")}
              />
              <FieldDescription>
                Accepts a PEM-encoded public key, Base64-encoded DER/SPKI, hexadecimal (optionally
                prefixed with 0x), or an array of byte values. The format is detected automatically
                and sent as Base64.
              </FieldDescription>
              <FieldError>{errors.publicKey?.message}</FieldError>
            </Field>
          </form>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">{result ? "Close" : "Cancel"}</Button>
          </DialogClose>
          {result ? (
            <Button
              variant="project"
              onClick={() =>
                downloadJSON(
                  { keyId: result.keyId, secret: result.secret },
                  `kms-shared-secret-${result.keyId}.json`
                )
              }
            >
              <DownloadIcon />
              Download JSON
            </Button>
          ) : (
            <Button
              variant="project"
              type="submit"
              form="derive-shared-secret-form"
              isPending={deriveSharedSecret.isPending}
            >
              <KeyRoundIcon />
              Derive Secret
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
