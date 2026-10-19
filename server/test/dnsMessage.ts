/**
 * DNS-Nachrichten für Tests bauen — das Gegenstück zu services/dnsWire.ts.
 *
 * Bewusst unabhängig vom Code unter Test geschrieben: Würde der Test seine
 * Antworten mit demselben Encoder bauen, den er prüft, fiele ein Fehler auf
 * beiden Seiten gleich aus und keiner auf.
 */

export interface RawRecord {
  /** Name als Text oder fertige Bytes (etwa ein Kompressionszeiger). */
  name: string | number[];
  type: number;
  ttl?: number;
  cls?: number;
  rdata: number[];
}

export interface ResponseSpec {
  rcode?: number;
  /** Zusätzliche Flag-Bits im zweiten Wort des Kopfs (TC = 0x0200, AD = 0x0020). */
  flags?: number;
  /** Ohne QR-Bit — eine Anfrage statt einer Antwort. */
  query?: boolean;
  question?: { name: string; type: number };
  answers?: RawRecord[];
}

/** Ein Name als Labels, unkomprimiert. */
export function name(text: string): number[] {
  const bytes: number[] = [];
  for (const label of text.replace(/\.$/, '').split('.').filter(Boolean)) {
    bytes.push(label.length, ...Buffer.from(label, 'ascii'));
  }
  bytes.push(0);
  return bytes;
}

/** Zeiger auf einen früheren Namen in der Nachricht. */
export function pointer(offset: number): number[] {
  return [0xc0 | (offset >> 8), offset & 0xff];
}

/** Stelle des Namens in der Frage — Ziel des üblichen Zeigers `c0 0c`. */
export const QUESTION_NAME = 12;

export const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

export function response(spec: ResponseSpec): Uint8Array {
  const answers = spec.answers ?? [];
  const flags = (spec.query ? 0 : 0x8000) | 0x0100 | 0x0080 | (spec.flags ?? 0) | (spec.rcode ?? 0);
  const bytes = [...u16(0), ...u16(flags), ...u16(spec.question ? 1 : 0), ...u16(answers.length), ...u16(0), ...u16(0)];
  if (spec.question) bytes.push(...name(spec.question.name), ...u16(spec.question.type), ...u16(1));
  for (const rr of answers) {
    bytes.push(
      ...(typeof rr.name === 'string' ? name(rr.name) : rr.name),
      ...u16(rr.type),
      ...u16(rr.cls ?? 1),
      ...u32(rr.ttl ?? 300),
      ...u16(rr.rdata.length),
      ...rr.rdata
    );
  }
  return Uint8Array.from(bytes);
}

/** TXT-RDATA aus einzelnen Stücken (je höchstens 255 Bytes). */
export function txt(...chunks: string[]): number[] {
  return chunks.flatMap((chunk) => {
    const bytes = [...Buffer.from(chunk, 'utf8')];
    return [bytes.length, ...bytes];
  });
}

export function ipv4(address: string): number[] {
  return address.split('.').map(Number);
}

export function ipv6(address: string): number[] {
  const [head, tail = ''] = address.includes('::') ? address.split('::') : [address, undefined];
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const groups = address.includes('::')
    ? [...left, ...Array(8 - left.length - right.length).fill('0'), ...right]
    : left;
  return groups.flatMap((g) => u16(parseInt(g, 16)));
}

/** Name und Typ aus einer Anfrage im Wireformat (ohne Kompression). */
export function parseQuery(bytes: Uint8Array): { name: string; type: number; arcount: number } {
  const labels: string[] = [];
  let o = 12;
  while (bytes[o] !== 0) {
    labels.push(Buffer.from(bytes.subarray(o + 1, o + 1 + bytes[o])).toString('ascii'));
    o += 1 + bytes[o];
  }
  o += 1;
  return {
    name: labels.join('.'),
    type: (bytes[o] << 8) | bytes[o + 1],
    arcount: (bytes[10] << 8) | bytes[11],
  };
}

/**
 * RDATA aus der Textform der JSON-API — damit ein Test-Stub denselben
 * Eintrag als JSON und als Wireformat ausliefern kann.
 */
export function rdataFromJson(type: number, data: string): number[] {
  switch (type) {
    case 1:
      return ipv4(data);
    case 28:
      return ipv6(data);
    case 2:
    case 5:
    case 12:
      return name(data);
    case 15: {
      const [preference, host] = data.split(/\s+/);
      return [...u16(Number(preference)), ...name(host)];
    }
    case 16: {
      // `"a" "b"` wie Cloudflare oder zusammengesetzt wie Google
      if (/^\s*"(?:[^"\\]|\\.)*"(?:\s+"(?:[^"\\]|\\.)*")*\s*$/.test(data)) {
        return txt(
          ...[...data.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(["\\])/g, '$1'))
        );
      }
      const pieces: string[] = [];
      for (let i = 0; i < data.length; i += 255) pieces.push(data.slice(i, i + 255));
      return txt(...(pieces.length > 0 ? pieces : ['']));
    }
    default:
      throw new Error(`rdataFromJson: Typ ${type} nicht unterstützt`);
  }
}
