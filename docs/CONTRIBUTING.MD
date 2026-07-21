# Contributing to the documentation

## Style Guide

**Read [STYLE_GUIDE.md](./STYLE_GUIDE.md) before writing documentation.** It covers:

- Writing for users (not implementers)
- Cross-referencing related concepts
- Using Mintlify components (`<Steps>`, `<Tabs>`, `<Card>`, etc.)
- Page structure and formatting

## Getting familiar with Mintlify

New to Mintlify? [Start Here](https://mintlify.com/docs/quickstart)

## 👩‍💻 Development

Install the [Mint CLI](https://www.npmjs.com/package/mint) to preview the documentation changes locally. To install, use the following command

```
npm i -g mint
```

Run the following command at the root of your documentation (where docs.json is)

```
mint dev
```

## Troubleshooting

- `mint dev` isn't running - Run `mint update` to update the Mint CLI.
- Page loads as a 404 - Make sure you are running in a folder with `docs.json`. Check the `/docs` folder
