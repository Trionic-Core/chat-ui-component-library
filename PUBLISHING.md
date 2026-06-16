# Publishing & consuming `@cypherx/chat-ui` (private registry)

`@cypherx/chat-ui` ships as a **private, scoped** npm package. The scope stays
`@cypherx` (on-brand for clients). This guide covers publishing it and consuming
it (in `fde-console`'s Docker build and in client apps).

The package is registry-agnostic — it works with **npm's private registry** or a
**self-hosted Verdaccio**. Pick one and set its URL in the `@cypherx:registry`
line everywhere below.

---

## A. One-time registry setup (choose one)

### Option 1 — npm private registry (npmjs.com, paid private org)
1. Create the `@cypherx` org on npmjs.com (private packages require a paid plan).
2. Registry URL: `https://registry.npmjs.org/`.
3. Create an **automation token** (Account → Access Tokens → Granular/Automation)
   with publish rights to `@cypherx`.

### Option 2 — self-hosted Verdaccio
1. Run Verdaccio (e.g. `https://npm.internal.cypherx.ai`).
2. Configure auth + a publish user; create a token.
3. Registry URL = your Verdaccio URL.

In both cases you end up with: a **registry URL** and a **token**.

---

## B. Publish a version

Versioning is **SemVer on the public API** — the `ViewSpec`/`ChatEvent` types and
the component props are the contract. Breaking either = major bump. The
`check:contract` guard + `prepublishOnly` run automatically (`check:contract &&
lint && build`), so a drifted wire contract can never be published.

```bash
# 1. bump version
npm version minor            # or patch / major

# 2. publish (prepublishOnly runs check:contract + lint + build first)
npm publish                  # uses the registry from .npmrc / publishConfig
```

For a custom registry: `npm publish --registry https://npm.internal.cypherx.ai`.

### CI publish (recommended) — `.github/workflows/publish.yml`
A tag-triggered workflow is included. Set repo secrets:
- `NPM_TOKEN` — the publish token from step A.
- `NPM_REGISTRY_URL` *(optional)* — defaults to `https://registry.npmjs.org`.

Then publish by pushing a tag:
```bash
git tag chat-ui-v0.4.0 && git push origin chat-ui-v0.4.0
```

---

## C. Consume the package (fde-console + clients)

Consumers need a `.npmrc` that points the `@cypherx` scope at the registry and
supplies a **read** token. See `.npmrc.example`:

```ini
@cypherx:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=${NPM_TOKEN}
```

(For Verdaccio, swap both URLs for your Verdaccio host.)

Then:
```bash
npm install @cypherx/chat-ui
```

### In fde-console's Docker build
`fde-console`'s frontend is built inside the enterprise image, so the build needs
the registry token at build time. Provide it as a build secret (not baked into a
layer), e.g.:

```dockerfile
# syntax=docker/dockerfile:1.7
RUN --mount=type=secret,id=npm_token \
    NPM_TOKEN="$(cat /run/secrets/npm_token)" npm ci
```

and pass `--secret id=npm_token,env=NPM_TOKEN` (or from your CI secret store) to
`docker build`. The `.npmrc` reads `${NPM_TOKEN}` from the env. **Never** commit
the token or bake it into an image layer.

### In client apps
Clients you grant read access get the same two `.npmrc` lines + a scoped read
token, then `npm install @cypherx/chat-ui`. Hand them
[INTEGRATION.md](./INTEGRATION.md) + [THEMING.md](./THEMING.md).

---

## D. Version policy (the public API)
- **patch** — fixes, internal changes, no API/contract change.
- **minor** — additive: new components/props, **new block types or chart types**
  (forward-compatible — older clients skip unknown blocks gracefully).
- **major** — a breaking change to `ViewSpec`/`ChatEvent` or a component's props.
  Coordinate with the backend `models.py` + its `test_aui_contract_parity.py`,
  and this package's `scripts/check-aui-contract.mjs`.
