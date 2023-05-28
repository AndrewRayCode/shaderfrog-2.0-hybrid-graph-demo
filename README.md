# Shaderfrog 2.0 "Hybrid Graph" UI Editor

![Hybrid Graph editor screenshot](/public/hybrid-graph-screenshot.png)

This is the standalone repository for the Shaderfrog Hybrid Graph Editor UI. For
convenience of local development, this repository is also configured as a
Next.js app, so you can run the Next.js server locally to develop on the editor
component.

In production, the Shaderfrog editor reads from a database and lets you create
and save shaders. This standalone editor does not let you persist shaders.

The code struture:
```bash
src/ # All source code
  editor/                # The editor component code
  editor-engine-plugins/ # The engine specific UI components (like Babylon, Three)
  editor-util/           # Shared utility functions
  shaders/               # Example shaders
  pages/                 # The Next.js app page
```

## Run locally

Install:
```bash
npm install
```

I've been developing this library in sync with the
[@shaderfrog/core](https://github.com/ShaderFrog/core) package. To make that
local development easier, this repository is designed to import directy from
the core repository, by having both repositories cloned in the same folder.

Clone [@shaderfrog/core](https://github.com/ShaderFrog/core) in to a folder
at the same level as this one, named `core-shaderfrog`, so that you have;

```bash
core-shaderfrog/
editor-shaderfrog/ # This repository
```

This enabled `import x from @core/...` via the setup in in `tsconfig.json`.

Then start the Next.js app:

```bash
npm run dev
```

Navigate to [http://localhost:3000](http://localhost:3000).
