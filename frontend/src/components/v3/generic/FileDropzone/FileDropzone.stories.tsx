import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { FileDropzone } from "./FileDropzone";

/**
 * FileDropzone is the standard file-upload surface: a dashed drop target that
 * doubles as a click-to-browse button, with an accented "Choose file" affordance
 * and an optional accepted-types line. While a file is dragged over it, the
 * frame highlights with the info tint and the title swaps to a drop prompt.
 *
 * Selection is delivered through `onFilesSelect` with the files chosen in that
 * interaction — an empty array signals an invalid drop (e.g. a file dragged out
 * of VS Code), so callers can raise their own error. Single-file by default;
 * pass `multiple` to allow several files per interaction.
 *
 * The component does not own the selected-file state. Pass `files` to render
 * the selected files as rows (icon, truncating name with the extension always
 * visible, size), and `onFileRemove` to expose a remove action on each row.
 * Omit `files` when selection immediately advances to another step, as in the
 * secrets import dialog.
 *
 * Colors default to the `info` tint. When the surface belongs to a specific
 * scope (e.g. a project-level dialog), override `accentClassName`,
 * `activeFrameClassName`, and `activeEmptyClassName` with that scope's color
 * (`text-project`, `bg-project/10`, etc.) per the design system's scope-color
 * convention. `emptyClassName` and `frameClassName` are open escape hatches
 * for anything else.
 */
const meta = {
  title: "Generic/FileDropzone",
  component: FileDropzone,
  parameters: {
    layout: "centered"
  },
  tags: ["autodocs"],
  args: {
    className: "w-[480px]",
    onFilesSelect: () => {}
  },
  argTypes: {
    className: {
      table: {
        disable: true
      }
    }
  }
} satisfies Meta<typeof FileDropzone>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  name: "Example: Default",
  parameters: {
    docs: {
      description: {
        story:
          "Single-file dropzone with an accepted-types description. Selecting or dropping a file replaces the previous selection."
      }
    }
  },
  render: (args) => {
    const [files, setFiles] = useState<File[]>([]);
    return (
      <FileDropzone
        {...args}
        accept=".env,.json,.yml"
        description=".env, .json, or .yml"
        files={files}
        onFilesSelect={(selected) => setFiles(selected.slice(0, 1))}
        onFileRemove={(_, index) => setFiles((prev) => prev.filter((__, i) => i !== index))}
      />
    );
  }
};

export const Multiple: Story = {
  name: "Variant: Multiple",
  parameters: {
    docs: {
      description: {
        story:
          "Pass `multiple` to accept several files per interaction. The caller owns the list, so append incoming files to keep prior selections."
      }
    }
  },
  render: (args) => {
    const [files, setFiles] = useState<File[]>([]);
    return (
      <FileDropzone
        {...args}
        multiple
        description="Any file type"
        files={files}
        onFilesSelect={(selected) => setFiles((prev) => [...prev, ...selected])}
        onFileRemove={(_, index) => setFiles((prev) => prev.filter((__, i) => i !== index))}
      />
    );
  }
};

export const WithFile: Story = {
  name: "Example: With Selected File",
  parameters: {
    docs: {
      description: {
        story:
          "A selected file renders as a row with icon, truncating name (extension always visible), size, and a remove action when `onFileRemove` is provided."
      }
    }
  },
  render: (args) => {
    const [files, setFiles] = useState<File[]>([
      new File(["x".repeat(4096)], "kms-backup-acme-example-project-secretManager.infisical.txt", {
        type: "text/plain"
      })
    ]);
    return (
      <FileDropzone
        {...args}
        accept=".txt"
        description=".infisical.txt backup file"
        files={files}
        onFilesSelect={(selected) => setFiles(selected.slice(0, 1))}
        onFileRemove={(_, index) => setFiles((prev) => prev.filter((__, i) => i !== index))}
      />
    );
  }
};

export const ScopedAccent: Story = {
  name: "Variant: Scoped Accent",
  parameters: {
    docs: {
      description: {
        story:
          "Override `accentClassName` / `activeFrameClassName` / `activeEmptyClassName` to match the surface's scope color instead of the `info` default — e.g. `text-project` for a project-settings dialog like the KMS backup upload."
      }
    }
  },
  render: (args) => (
    <FileDropzone
      {...args}
      accept=".txt"
      description=".infisical.txt backup file"
      accentClassName="text-project"
      activeFrameClassName="text-project"
      activeEmptyClassName="bg-project/10"
    />
  )
};

export const Disabled: Story = {
  name: "Variant: Disabled",
  parameters: {
    docs: {
      description: {
        story: "Disabled surfaces dim and ignore both clicks and drops — use for permission gates."
      }
    }
  },
  render: (args) => <FileDropzone {...args} isDisabled description="Any file type" />
};
