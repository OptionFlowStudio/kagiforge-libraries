export type Algorithm = {
  value: string;
  label: string;
  kind: 'hex' | 'base64url' | 'pin' | 'recovery' | 'passphrase' | 'rsa-pair' | 'password';
  length?: number;
  rsaAlg?: 'RSA-OAEP' | 'RSA-PSS';
};

export const algorithms: Algorithm[] = [
  { value: 'aes-256', label: 'AES-256', kind: 'hex', length: 32 },
  { value: 'kek', label: 'KEK', kind: 'hex', length: 32 },
  { value: 'master', label: 'Master/Root Key', kind: 'hex', length: 32 },
  { value: 'hmac-sha256', label: 'HMAC-SHA256 Key', kind: 'hex', length: 32 },
  { value: 'hmac-sha512', label: 'HMAC-SHA512 Key', kind: 'hex', length: 64 },
  { value: 'poly1305', label: 'Poly1305 Key', kind: 'hex', length: 32 },
  { value: 'rsa-oaep', label: 'RSA-OAEP Key Pair', kind: 'rsa-pair', rsaAlg: 'RSA-OAEP' },
  { value: 'rsa-pss', label: 'RSA-PSS Key Pair', kind: 'rsa-pair', rsaAlg: 'RSA-PSS' },
  { value: 'jwt-secret', label: 'JWT Signing Secret', kind: 'base64url', length: 32 },
  { value: 'api-key', label: 'API Key', kind: 'base64url', length: 24 },
  { value: 'pin', label: 'PIN', kind: 'pin', length: 6 },
  { value: 'recovery', label: 'Recovery Codes', kind: 'recovery' },
  { value: 'passphrase', label: 'Memorable Passphrase', kind: 'passphrase' },
  { value: 'password', label: 'Password', kind: 'password' },
];

export const BIT_OPTIONS = [128, 160, 192, 256, 320, 381];
export const PIN_OPTIONS = [4, 6, 8, 12, 16, 24];
export const PASSPHRASE_OPTIONS = [4, 8, 12, 24];
export const RECOVERY_OPTIONS = [8, 16];
export const PASSWORD_LENGTHS = [12, 24, 48, 64, 86, 102, 124];

export type PasswordOptions = {
  symbols: boolean;
  numeric: boolean;
  camelcase: boolean;
};

export type KeyPair = { publicKey: string; privateKey: string };

export type KeyGenerationResult =
  | { kind: 'single'; value: string }
  | { kind: 'pair'; pair: KeyPair };

const WORDS = [
  'astro','binary','cinder','cobalt','delta','ember','fable','forge','glyph','harbor',
  'ivory','jolt','kernel','lumen','matrix','nimbus','onyx','pulse','quartz','raven',
  'sable','tango','ultra','vivid','whisper','xenon','yonder','zephyr','axiom','bravo',
  'cipher','drift','echo','flare','grit','halo','ionic','jigsaw','karma','legend',
  'mosaic','nova','orbit','prism','quiver','ripple','signal','tempo','umbra','vector',
  'warden','zircon','arc','bolt','crest','dusk','ember','flux','glint','haze',
  'iris','jolt','kite','latch','mirth','nylon','opal','pivot','quest','relic',
  'spectrum','trace','uplink','vault','wisp','yarrow','zenith','anchor','brisk','crux',
  'dynamo','ember','frost','groove','hollow','ion','jolt','keystone','lyric','manta',
  'noon','oracle','plasma','quill','rover','stark','thrum','unity','vortex','weld',
  'yearn','zen','amber','basil','copper','dahlia','ember','fennel','garnet','harrow',
  'indigo','juniper','kestrel','laurel','merit','nectar','olive','piper','quartz','rumor',
];

const toHex = (bytes: Uint8Array) =>
  Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');

const toBase64Url = (bytes: Uint8Array) => {
  const bin = String.fromCharCode(...bytes);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const randomBytes = (len: number) => {
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  return arr;
};

const randomBits = (bits: number) => {
  const bytesLen = Math.ceil(bits / 8);
  const bytes = randomBytes(bytesLen);
  const extra = bytesLen * 8 - bits;
  if (extra > 0) {
    const mask = 0xff >>> extra;
    bytes[0] = bytes[0] & mask;
  }
  return bytes;
};

const randomPin = (len: number) => {
  let out = '';
  for (let i = 0; i < len; i++) out += Math.floor(Math.random() * 10);
  return out;
};

const randomPassphrase = (words = 4) => {
  const out: string[] = [];
  for (let i = 0; i < words; i++) {
    const idx = Math.floor(Math.random() * WORDS.length);
    out.push(WORDS[idx]);
  }
  return out.join('-');
};

const randomRecoveryCodes = (count = 8) => {
  const codes: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = randomPin(4);
    const b = randomPin(4);
    codes.push(`${a}-${b}`);
  }
  return codes.join('\n');
};

const randomPassword = (length: number, opts: PasswordOptions) => {
  const lower = 'abcdefghijklmnopqrstuvwxyz';
  const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const digits = '0123456789';
  const symbols = '!@#$%^&*()-_=+[]{};:,.<>?/|';

  let charset = '';
  if (opts.camelcase) charset += lower + upper;
  if (opts.numeric) charset += digits;
  if (opts.symbols) charset += symbols;

  if (charset.length === 0) return '';

  let out = '';
  const bytes = randomBytes(length);
  for (let i = 0; i < length; i++) {
    out += charset[bytes[i] % charset.length];
  }
  return out;
};

const abToPem = (ab: ArrayBuffer, label: string) => {
  const bytes = new Uint8Array(ab);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const base64 = btoa(bin);
  const lines = base64.match(/.{1,64}/g)?.join('\n') ?? base64;
  return `-----BEGIN ${label}-----\n${lines}\n-----END ${label}-----`;
};

const generateRsaPemPair = async (rsaAlg: 'RSA-OAEP' | 'RSA-PSS') => {
  const keyPair = await crypto.subtle.generateKey(
    { name: rsaAlg, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    rsaAlg === 'RSA-OAEP' ? ['encrypt', 'decrypt'] : ['sign', 'verify']
  );
  const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey);
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey);
  return {
    publicKey: abToPem(spki, 'PUBLIC KEY'),
    privateKey: abToPem(pkcs8, 'PRIVATE KEY'),
  };
};

export const supportsBitSelection = (alg: Algorithm) =>
  alg.kind === 'hex' || alg.kind === 'base64url';

export const buildInitialKeyBitsByAlg = () => {
  const initial: Record<string, number> = {};
  for (const alg of algorithms) {
    if (alg.value === 'api-key') {
      initial[alg.value] = 192;
    } else if (typeof alg.length === 'number') {
      initial[alg.value] = alg.length * 8;
    }
  }
  return initial;
};

export type GenerateKeyParams = {
  algorithm: Algorithm;
  keyBitsByAlg?: Record<string, number>;
  pinLength?: number;
  passphraseWords?: number;
  recoveryCount?: number;
  passwordLength?: number;
  passwordOptions?: PasswordOptions;
};

export const generateKey = async ({
  algorithm,
  keyBitsByAlg,
  pinLength = 6,
  passphraseWords = 4,
  recoveryCount = 8,
  passwordLength = 24,
  passwordOptions = { symbols: true, numeric: true, camelcase: true },
}: GenerateKeyParams): Promise<KeyGenerationResult> => {
  if (algorithm.kind === 'rsa-pair') {
    const rsaAlg = algorithm.rsaAlg ?? 'RSA-PSS';
    const pair = await generateRsaPemPair(rsaAlg);
    return { kind: 'pair', pair };
  }

  if (algorithm.kind === 'pin') {
    return { kind: 'single', value: randomPin(pinLength) };
  }

  if (algorithm.kind === 'recovery') {
    return { kind: 'single', value: randomRecoveryCodes(recoveryCount) };
  }

  if (algorithm.kind === 'passphrase') {
    return { kind: 'single', value: randomPassphrase(passphraseWords) };
  }

  if (algorithm.kind === 'password') {
    const pwd = randomPassword(passwordLength, passwordOptions);
    if (!pwd) {
      throw new Error('Select at least one password option.');
    }
    return { kind: 'single', value: pwd };
  }

  const length = algorithm.length ?? 32;
  const selectedBits = keyBitsByAlg?.[algorithm.value] ?? length * 8;
  const bytes = supportsBitSelection(algorithm) ? randomBits(selectedBits) : randomBytes(length);
  const raw = algorithm.kind === 'base64url' ? toBase64Url(bytes) : toHex(bytes);
  const value = algorithm.value === 'api-key' ? `kagi_key_${raw}` : raw;
  return { kind: 'single', value };
};
