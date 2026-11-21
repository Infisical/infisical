import { useState } from "react";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { Field } from "@infisical/cipher/ui/field";
import { Input } from "@infisical/cipher/ui/input";
import { Inline, Stack } from "@infisical/cipher/ui/layout";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@infisical/cipher/ui/select";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@infisical/cipher/ui/sheet";
import { Switch } from "@infisical/cipher/ui/switch";
import { Textarea } from "@infisical/cipher/ui/textarea";

import { kmsKeyUsageOptions, keyUsageDefaultOption } from "@app/helpers/kms";
import {
  AsymmetricKeyAlgorithm,
  HmacAlgorithm,
  KmsKeyUsage,
  SymmetricKeyAlgorithm,
  type TCmek
} from "@app/hooks/api/cmeks/types";
import { slugSchema } from "@app/lib/schemas/slugSchema";

import { failed, saved } from "../../access/toast";
import { useV4Adapter } from "../../data/adapters";
import { algorithmLabel, usageLabel } from "./shared";

type Algorithm = TCmek["algorithm"];

const algorithmsByUsage: Record<KmsKeyUsage, Algorithm[]> = {
  [KmsKeyUsage.ENCRYPT_DECRYPT]: Object.values(SymmetricKeyAlgorithm),
  [KmsKeyUsage.SIGN_VERIFY]: Object.values(AsymmetricKeyAlgorithm),
  [KmsKeyUsage.GENERATE_VERIFY_MAC]: Object.values(HmacAlgorithm)
};
const legacyHmac: string[] = [HmacAlgorithm.HMAC_SHA_1, HmacAlgorithm.HMAC_SHA_224];
const usageOptions = Object.values(KmsKeyUsage).map((value) => ({
  value,
  label: usageLabel[value]
}));
const nameSchema = slugSchema({ min: 1, max: 32, field: "Name" });

export const KeySheet = ({
  orgId,
  projectId,
  cmek,
  onClose
}: {
  orgId: string;
  projectId: string;
  cmek?: TCmek;
  onClose: () => void;
}) => {
  const kms = useV4Adapter("kms");
  const create = kms.useCreateKey();
  const update = kms.useUpdateKey();
  const { data: subscription } = useV4Adapter("billing").useSubscription(orgId);
  const [name, setName] = useState(cmek?.name ?? "");
  const [description, setDescription] = useState(cmek?.description ?? "");
  const [keyUsage, setKeyUsage] = useState(cmek?.keyUsage ?? KmsKeyUsage.ENCRYPT_DECRYPT);
  const [algorithm, setAlgorithm] = useState<Algorithm>(
    cmek?.algorithm ?? SymmetricKeyAlgorithm.AES_GCM_256
  );
  const [isExportable, setIsExportable] = useState(cmek?.isExportable ?? true);
  const [hasDeleteProtection, setHasDeleteProtection] = useState(
    cmek?.hasDeleteProtection ?? false
  );
  const [errors, setErrors] = useState<{ name?: string; description?: string }>({});
  const [pending, setPending] = useState(false);

  const submit = async () => {
    const parsedName = nameSchema.safeParse(name);
    const next = {
      name: parsedName.success ? undefined : parsedName.error.issues[0]?.message,
      description:
        description.length > 500 ? "Description must be at most 500 characters" : undefined
    };
    setErrors(next);
    if (next.name || next.description) return;
    setPending(true);
    try {
      if (cmek) {
        await update.mutateAsync({
          keyId: cmek.id,
          projectId,
          name,
          description,
          hasDeleteProtection
        });
        saved("Key updated");
      } else {
        await create.mutateAsync({
          projectId,
          name,
          description,
          keyUsage,
          algorithm,
          isExportable,
          hasDeleteProtection
        });
        saved("Key created");
      }
      onClose();
    } catch (error) {
      failed(cmek ? "Failed to update key" : "Failed to create key", error);
    } finally {
      setPending(false);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent size="md" pending={pending}>
        <form
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <SheetHeader>
            <SheetTitle>{cmek ? `Edit ${cmek.name}` : "Create key"}</SheetTitle>
          </SheetHeader>
          <SheetBody>
            <Stack gap={16}>
              <Field
                label="Name"
                description="Lowercase letters, numbers and hyphens."
                error={errors.name}
                wide
              >
                <Input
                  autoFocus
                  placeholder="my-secret-key"
                  value={name}
                  invalid={Boolean(errors.name)}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              {!cmek && (
                <>
                  <Field label="Key usage" description={kmsKeyUsageOptions[keyUsage].tooltip} wide>
                    <Select
                      label="Key usage"
                      value={keyUsage}
                      options={usageOptions}
                      onChange={(value) => {
                        const usage = value as KmsKeyUsage;
                        setKeyUsage(usage);
                        setAlgorithm(keyUsageDefaultOption[usage]);
                      }}
                    />
                  </Field>
                  <Field label="Algorithm" wide>
                    <Select
                      value={algorithm}
                      onValueChange={(value) => setAlgorithm(value as Algorithm)}
                    >
                      <SelectTrigger aria-label="Algorithm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {algorithmsByUsage[keyUsage].map((value) => {
                          const locked = value.startsWith("ML_DSA") && !subscription?.kmsPqc;
                          return (
                            <SelectItem key={value} value={value} disabled={locked}>
                              <Inline gap={8} align="center" wrap={false}>
                                {algorithmLabel(value)}
                                {locked && <Badge tone="soft">Enterprise</Badge>}
                                {legacyHmac.includes(value) && <Badge tone="warn">Legacy</Badge>}
                              </Inline>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </Field>
                </>
              )}
              <Field label="Description" optional error={errors.description} wide>
                <Textarea
                  value={description}
                  aria-invalid={Boolean(errors.description) || undefined}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>
              <div>
                {!cmek && (
                  <Switch
                    layout="row"
                    label="Allow export"
                    description="People with the export permission can export this key's material. This can't be changed after the key is created."
                    checked={isExportable}
                    onChange={setIsExportable}
                  />
                )}
                <Switch
                  layout="row"
                  label="Delete protection"
                  description="Blocks deleting this key while it's on."
                  checked={hasDeleteProtection}
                  onChange={setHasDeleteProtection}
                />
              </div>
            </Stack>
          </SheetBody>
          <SheetFooter>
            <Inline gap={8} justify="end">
              <Button variant="outline" type="button" disabled={pending} onClick={onClose}>
                Cancel
              </Button>
              <Button variant="primary" type="submit" loading={pending}>
                {cmek ? "Save changes" : "Create key"}
              </Button>
            </Inline>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
};
