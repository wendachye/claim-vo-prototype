# UI components

The prototype uses shadcn/ui primitives with the existing Mighty One style and frontend workflow. The component sources were added with the official shadcn CLI (4.22.1, new-york, JavaScript) and are owned by this repository.

- `src/components/ui/`: Button, Badge, Input, Textarea, Native Select, Label, Checkbox, Dialog, Sheet and Popover from the official registry.
- `src/components/ui.jsx`: the application facade preserves existing button defaults, field IDs, refs, error/hint associations, checkbox callbacks and explicit save actions.
- `src/shadcn.css`: Tailwind theme/utilities without Preflight, so the existing application reset and printed claim layouts are preserved.
- `src/components/shadcn-compat.css`: the established blue/slate palette, control spacing and overlay dimensions.
- `src/lib/utils.js`: standard `clsx` / `tailwind-merge` class utility.

The registry components have two small integration extensions: Dialog/Sheet/Popover content accepts a portal container, and Native Select accepts a wrapper class. These keep portals inside the application/photo wrapper and keep labels/ref targets on the actual select.

Semantic source tables, drawing pins, hash navigation and native file selection remain part of the application. This migration does not replace business state, project storage, claim snapshots or validation rules.

Run `npm run test:ui`, the relevant existing state tests and `npm run build`, then verify on localhost.

References: [shadcn manual installation](https://ui.shadcn.com/docs/installation/manual), [Native Select](https://ui.shadcn.com/docs/components/radix/native-select), [Tailwind without Preflight](https://tailwindcss.com/docs/preflight).
