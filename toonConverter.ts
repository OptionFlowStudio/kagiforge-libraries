type Primitive = null | boolean | number | string;
type Json = Primitive | Json[] | { [k: string]: Json };

type EncodeOpts = {
  sanitizeJs?: boolean;
  indentSize?: number;
};

type Ctx = {
  indent: number;
};

type ArrayKind = "inline" | "tabular" | "list";

type EncodedArray = {
  kind: ArrayKind;
  header: string;
  body: string;
  delimiter: "," | "\t";
  tabularFields?: string[];
};

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object") return false;
  const proto = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

function normalize(input: unknown, sanitizeJs: boolean): Json {
  if (!sanitizeJs) {
    if (input === null) return null;
    if (typeof input === "boolean") return input;
    if (typeof input === "string") return input;
    if (typeof input === "number") {
      if (!Number.isFinite(input))
        throw new Error("Non-finite number in strict mode");
      return Object.is(input, -0) ? 0 : input;
    }
    if (Array.isArray(input)) return input.map((x) => normalize(x, false));
    if (isPlainObject(input)) {
      const out: Record<string, Json> = {};
      for (const k of Object.keys(input)) {
        out[k] = normalize((input as Record<string, unknown>)[k], false);
      }
      return out;
    }
    throw new Error(`Non-JSON type in strict mode: ${typeof input}`);
  }

  if (input === null) return null;

  const t = typeof input;

  if (t === "boolean" || t === "string") return input as Json;

  if (t === "number") {
    const n = input as number;
    if (!Number.isFinite(n)) return null;
    return Object.is(n, -0) ? 0 : n;
  }

  if (t === "bigint") return String(input);

  if (t === "undefined" || t === "function" || t === "symbol") return null;

  if (input instanceof Date) return input.toISOString();

  if (Array.isArray(input)) {
    return input.map((x) =>
      typeof x === "undefined" ? null : normalize(x, true)
    );
  }

  if (isPlainObject(input)) {
    const out: Record<string, Json> = {};
    for (const k of Object.keys(input)) {
      const v = (input as Record<string, unknown>)[k];
      if (typeof v === "undefined") continue;
      out[k] = normalize(v, true);
    }
    return out;
  }

  return String(input);
}

function isPrimitive(v: Json): v is Primitive {
  return (
    v === null ||
    typeof v === "boolean" ||
    typeof v === "number" ||
    typeof v === "string"
  );
}

function looksLikeNumber(s: string): boolean {
  return /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/.test(s);
}

function needsQuotes(s: string, delimiter: string): boolean {
  if (s.length === 0) return true;
  if (s !== s.trim()) return true;
  if (s === "true" || s === "false" || s === "null") return true;
  if (looksLikeNumber(s)) return true;
  if (s === "-" || s.startsWith("-")) return true;
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) < 0x20) return true;
  }
  if (s.includes('"') || s.includes("\\")) return true;
  if (s.includes(":")) return true;
  if (s.includes(delimiter)) return true;
  if (s.includes(",") || s.includes("\t")) return true;
  return false;
}

function escapeQuoted(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t");
}

function encodeString(s: string, delimiter: string): string {
  return needsQuotes(s, delimiter) ? `"${escapeQuoted(s)}"` : s;
}

function encodeKey(k: string, delimiter: string): string {
  return encodeString(k, delimiter);
}

function encodeNumberCanonical(n: number): string {
  if (!Number.isFinite(n)) return "null";
  if (Object.is(n, -0)) return "0";

  let s = String(n);

  if (!/[eE]/.test(s)) {
    if (s.includes(".")) s = s.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
    return s;
  }

  const m = s.match(/^([+-]?)(\d+)(?:\.(\d+))?[eE]([+-]?\d+)$/);
  if (!m) return String(n);

  const sign = m[1] === "-" ? "-" : "";
  const intPart = m[2];
  const fracPart = m[3] ?? "";
  const exp = parseInt(m[4], 10);

  const digits = intPart + fracPart;
  const pos = intPart.length;
  const newPos = pos + exp;

  let out: string;

  if (newPos <= 0) {
    const stripped = digits.replace(/^0+/, "");
    if (stripped.length === 0) return "0";
    out = "0." + "0".repeat(-newPos) + stripped;
  } else if (newPos >= digits.length) {
    out = digits + "0".repeat(newPos - digits.length);
  } else {
    out = digits.slice(0, newPos) + "." + digits.slice(newPos);
  }

  out = out.replace(/^0+(?=\d)/, "");
  if (out.includes("."))
    out = out.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");

  return sign + out;
}

function encodePrimitive(v: Primitive, delimiter: string): string {
  if (v === null) return "null";
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return encodeNumberCanonical(v);
  return encodeString(v, delimiter);
}

function indentStr(level: number, indentSize: number): string {
  return " ".repeat(level * indentSize);
}

function chooseDelimiterForValues(values: Json[]): "," | "\t" {
  for (const v of values) {
    if (typeof v === "string" && v.includes(",")) return "\t";
  }
  return ",";
}

function sameKeySet(objs: Record<string, Json>[]): {
  ok: boolean;
  keys: string[];
} {
  if (objs.length === 0) return { ok: true, keys: [] };
  const keys0 = Object.keys(objs[0]);
  const set0 = new Set(keys0);

  for (let i = 1; i < objs.length; i++) {
    const ki = Object.keys(objs[i]);
    if (ki.length !== keys0.length) return { ok: false, keys: [] };
    for (const k of ki) if (!set0.has(k)) return { ok: false, keys: [] };
  }

  return { ok: true, keys: keys0 };
}

function encodeArray(arr: Json[], ctx: Ctx, indentSize: number): EncodedArray {
  const N = arr.length;

  const allPrimitives = arr.every(isPrimitive);
  if (allPrimitives) {
    const delimiter = chooseDelimiterForValues(arr);
    const body = (arr as Primitive[])
      .map((x) => encodePrimitive(x, delimiter))
      .join(delimiter);
    return { kind: "inline", header: `[${N}]`, body, delimiter };
  }

  const allObjects = arr.length > 0 && arr.every((x) => isPlainObject(x));
  if (allObjects) {
    const objRows: Record<string, Json>[] = arr as unknown as Record<
      string,
      Json
    >[];
    const sk = sameKeySet(objRows);
    if (sk.ok) {
      const keys = sk.keys;
      const primitiveValuesOnly = objRows.every((o) =>
        keys.every((k) => isPrimitive(o[k]))
      );
      if (primitiveValuesOnly) {
        const cellValues: Json[] = [];
        for (const o of objRows) for (const k of keys) cellValues.push(o[k]);
        const delimiter = chooseDelimiterForValues(cellValues);

        const fields = keys.map((k) => encodeKey(k, ",")).join(",");
        const header = `[${N}]{${fields}}`;

        const rowIndent = indentStr(ctx.indent + 1, indentSize);
        const lines: string[] = [];
        for (const o of objRows) {
          const row = keys
            .map((k) => encodePrimitive(o[k] as Primitive, delimiter))
            .join(delimiter);
          lines.push(rowIndent + row);
        }

        return {
          kind: "tabular",
          header,
          body: lines.join("\n"),
          delimiter,
          tabularFields: keys,
        };
      }
    }
  }

  const header = `[${N}]`;
  const lines: string[] = [];
  for (const item of arr) {
    lines.push(encodeListItem(item, { indent: ctx.indent + 1 }, indentSize));
  }
  return { kind: "list", header, body: lines.join("\n"), delimiter: "," };
}

function encodeObjectField(
  key: string,
  value: Json,
  ctx: Ctx,
  indentSize: number
): string {
  const ind = indentStr(ctx.indent, indentSize);
  const k = encodeKey(key, ",");

  if (isPrimitive(value)) {
    return `${ind}${k}: ${encodePrimitive(value, ",")}`;
  }

  if (Array.isArray(value)) {
    const enc = encodeArray(value, ctx, indentSize);
    if (enc.kind === "inline") return `${ind}${k}${enc.header}: ${enc.body}`;
    return enc.body
      ? `${ind}${k}${enc.header}:\n${enc.body}`
      : `${ind}${k}${enc.header}:`;
  }

  const obj = value as Record<string, Json>;
  const keys = Object.keys(obj);
  if (keys.length === 0) return `${ind}${k}:`;

  const body = encodeObject(obj, { indent: ctx.indent + 1 }, indentSize);
  return body ? `${ind}${k}:\n${body}` : `${ind}${k}:`;
}

function encodeObject(
  obj: Record<string, Json>,
  ctx: Ctx,
  indentSize: number
): string {
  const lines: string[] = [];
  for (const k of Object.keys(obj)) {
    lines.push(encodeObjectField(k, obj[k], ctx, indentSize));
  }
  return lines.join("\n");
}

function reindentBlock(
  block: string,
  addIndentLevels: number,
  indentSize: number
): string {
  if (!block) return "";
  const prefix = indentStr(addIndentLevels, indentSize);
  return block
    .split("\n")
    .map((ln) => (ln.length ? prefix + ln : ln))
    .join("\n");
}

function encodeListItem(v: Json, ctx: Ctx, indentSize: number): string {
  const ind = indentStr(ctx.indent, indentSize);

  if (isPrimitive(v)) {
    return `${ind}- ${encodePrimitive(v, ",")}`;
  }

  if (Array.isArray(v)) {
    const enc = encodeArray(v, { indent: ctx.indent }, indentSize);
    if (enc.kind === "inline") return `${ind}- ${enc.header}: ${enc.body}`;
    return enc.body
      ? `${ind}- ${enc.header}:\n${enc.body}`
      : `${ind}- ${enc.header}:`;
  }

  const obj = v as Record<string, Json>;
  const keys = Object.keys(obj);

  if (keys.length === 0) return `${ind}-`;

  const firstKey = keys[0];
  const firstVal = obj[firstKey];
  const firstKeyToken = encodeKey(firstKey, ",");

  let firstLine: string;
  const tailLines: string[] = [];

  if (isPrimitive(firstVal)) {
    firstLine = `${ind}- ${firstKeyToken}: ${encodePrimitive(firstVal, ",")}`;
  } else if (Array.isArray(firstVal)) {
    const enc = encodeArray(firstVal, { indent: ctx.indent }, indentSize);

    if (enc.kind === "inline") {
      firstLine = `${ind}- ${firstKeyToken}${enc.header}: ${enc.body}`;
    } else {
      firstLine = `${ind}- ${firstKeyToken}${enc.header}:`;
      if (enc.body) {
        if (enc.kind === "tabular") {
          tailLines.push(reindentBlock(enc.body, 1, indentSize));
        } else {
          tailLines.push(enc.body);
        }
      }
    }
  } else {
    firstLine = `${ind}- ${firstKeyToken}:`;
    const nested = encodeObject(
      firstVal as Record<string, Json>,
      { indent: ctx.indent + 1 },
      indentSize
    );
    if (nested) tailLines.push(nested);
  }

  for (let i = 1; i < keys.length; i++) {
    const k = keys[i];
    tailLines.push(
      encodeObjectField(k, obj[k], { indent: ctx.indent + 1 }, indentSize)
    );
  }

  const rest = tailLines.filter((x) => x.length > 0).join("\n");
  return rest ? `${firstLine}\n${rest}` : firstLine;
}

export function encodeToon(input: unknown, opts: EncodeOpts = {}): string {
  const indentSize = opts.indentSize ?? 2;
  const sanitizeJs = opts.sanitizeJs ?? false;

  const v = normalize(input, sanitizeJs);

  let out = "";

  if (isPrimitive(v)) {
    out = encodePrimitive(v, ",");
  } else if (Array.isArray(v)) {
    const enc = encodeArray(v, { indent: 0 }, indentSize);
    out =
      enc.kind === "inline"
        ? `${enc.header}: ${enc.body}`
        : `${enc.header}:\n${enc.body}`;
  } else {
    const keys = Object.keys(v);
    out = keys.length === 0 ? "" : encodeObject(v, { indent: 0 }, indentSize);
  }

  return out.replace(/[ \t]+$/gm, "") + "\n";
}
