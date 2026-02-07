# Local Libraries Documentation

This repository contains three TypeScript utility libraries:

- `keyGenerator.ts`: cryptographic/random key material generator
- `qrGenerator.ts`: QR matrix + SVG generator
- `toonConverter.ts`: JSON-like value encoder into a compact text format ("Toon")

## 1) `keyGenerator.ts`

### What it does
Generates:

- Hex keys (AES, HMAC, etc.)
- Base64URL secrets (JWT, API keys)
- PINs
- Recovery codes
- Passphrases
- Passwords
- RSA key pairs (PEM)

### Main exports

- `algorithms`: preset algorithm catalog
- `BIT_OPTIONS`, `PIN_OPTIONS`, `PASSPHRASE_OPTIONS`, `RECOVERY_OPTIONS`, `PASSWORD_LENGTHS`
- `buildInitialKeyBitsByAlg()`
- `supportsBitSelection(alg)`
- `generateKey(params)`

### Usage

```ts
import { algorithms, generateKey } from './keyGenerator';

const jwtAlg = algorithms.find((a) => a.value === 'jwt-secret')!;
const jwtSecret = await generateKey({ algorithm: jwtAlg });
// => { kind: 'single', value: '...' }

const rsaAlg = algorithms.find((a) => a.value === 'rsa-pss')!;
const rsaPair = await generateKey({ algorithm: rsaAlg });
// => { kind: 'pair', pair: { publicKey: '-----BEGIN PUBLIC KEY-----...', privateKey: '...' } }
```

### Notes

- Uses `crypto.getRandomValues` and `crypto.subtle`.
- RSA keys are generated as 2048-bit keys and exported as PEM.
- API keys are prefixed with `kagi_key_`.
- PIN/passphrase/recovery generation uses `Math.random()` internally.

## 2) `qrGenerator.ts`

### What it does
Builds QR module data from input text and renders it as an SVG string.

### Main exports

- `createQrModules(input, errorCorrectionLevel?)`
- `buildQrSvgString(modules, color)`
- `QrModules` type

### Usage

```ts
import { createQrModules, buildQrSvgString } from './qrGenerator';

const modules = createQrModules('https://example.com', 'H');
const svg = buildQrSvgString(modules, '#0f172a');

// Write svg to file or inject in HTML
```

### Notes

- Depends on `qrcode` (`import QRCode from 'qrcode'`).
- Error correction levels: `L | M | Q | H`.
- SVG uses rounded module corners (`rx`/`ry` = `0.2`) and fixed output size `256x256`.

## 3) `toonConverter.ts`

### What it does
Encodes unknown input into a deterministic text format:

- Primitives become single tokens (`true`, `42`, `"text"` when needed)
- Arrays can be encoded as:
  - inline scalar rows (`[N]: a,b,c`)
  - tabular object rows when objects share the same primitive keys
  - list blocks for mixed/nested content
- Objects become line-based `key: value` blocks

### Main export

- `encodeToon(input, opts?)`

`opts`:

- `sanitizeJs?: boolean` (default `false`)
- `indentSize?: number` (default `2`)

### Usage

```ts
import { encodeToon } from './toonConverter';

const input = {
  team: 'platform',
  flags: [true, false, true],
  users: [
    { id: 1, name: 'Ada' },
    { id: 2, name: 'Lin' }
  ]
};

const out = encodeToon(input, { sanitizeJs: true, indentSize: 2 });
console.log(out);
```

### Notes

- In strict mode (`sanitizeJs: false`), non-JSON values throw.
- In sanitize mode (`sanitizeJs: true`):
  - `undefined` object fields are dropped
  - `undefined` array items become `null`
  - non-finite numbers become `null`
  - `bigint` becomes string
  - `Date` becomes ISO string
- Output always ends with a newline.

## Quick start

```ts
// Example index.ts
import { generateKey, algorithms } from './keyGenerator';
import { createQrModules, buildQrSvgString } from './qrGenerator';
import { encodeToon } from './toonConverter';

async function main() {
  const key = await generateKey({
    algorithm: algorithms.find((a) => a.value === 'api-key')!,
  });

  const qr = buildQrSvgString(
    createQrModules(key.kind === 'single' ? key.value : key.pair.publicKey),
    '#111827'
  );

  const debug = encodeToon({ generated: key, hasQr: Boolean(qr) }, { sanitizeJs: true });
  console.log(debug);
}

main();
```
