# Shaderfrog 2.0 "Hybrid Graph" UI Editor

![Hybrid Graph editor screenshot](/public/hybrid-graph-screenshot.png)

Experimental library. Not ready for prime time!

## Run locally

Install:
```bash
npm install
```

Then clone [@shaderfrog/core](https://github.com/ShaderFrog/core) in to a folder at the same level as this one, named `core-shaderfrog`, so that you have;

```
core-shaderfrog/
editor-shaderfrog/ (this repository)
```

This is to make the path alias in `tsconfig.json` `@core/` work.

Then

```bash
npm run dev
```