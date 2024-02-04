# Documentation

We use **[Mintlify](https://mintlify.com/)** to generate our [documentation](https://infisical.com/docs).

If you're new and want to get familiar with Mintlify
- https://mintlify.com/docs/quickstart
- https://www.youtube.com/watch?v=hFlZJzY2HNM

## 👩‍💻 Development

Install the [Mintlify CLI](https://www.npmjs.com/package/mintlify) to preview the documentation changes locally. To install, use the following command

```sh
# with npm
npm i -g mintlify

# with npx
npx mintlify dev
```

Run the following command at the root of your documentation (where `[mint.json](https://github.com/Infisical/infisical/blob/main/docs/mint.json)` is located)

```sh
mintlify dev
```

## Troubleshooting

1. Mintlify dev isn't running → Run `mintlify install` it'll re-install dependencies.
2. Page loads as a 404 → Make sure you are running in a folder with `mint.json`. Check the `/docs` folder
