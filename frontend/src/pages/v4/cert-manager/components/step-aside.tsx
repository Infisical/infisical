import { Stack } from "@infisical/cipher/ui/layout";
import type { MultiStepStep } from "@infisical/cipher/ui/multi-step";
import { SmallText, Text } from "@infisical/cipher/ui/text";

export const stepAside = (...paragraphs: string[]): NonNullable<MultiStepStep["aside"]> => ({
  description: (
    <Stack gap={8}>
      <Text>What this step does</Text>
      {paragraphs.map((paragraph) => (
        <SmallText key={paragraph} muted>
          {paragraph}
        </SmallText>
      ))}
    </Stack>
  )
});
