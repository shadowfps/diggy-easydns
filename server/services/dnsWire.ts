/**
 * DNS-Nachrichten im Wireformat (RFC 1035) für DoH nach RFC 8484.
 *
 * Nicht jeder Anbieter spricht die JSON-API, die doh.ts sonst nutzt: Quad9,
 * OpenDNS, Control D und DNS4EU nehmen nur `application/dns-message`.
 * Hier entsteht die Anfrage, und die Antwort wird in dieselbe Form gebracht,
 * die die JSON-API liefert — Status, Typ, TTL und `data` als Text
 * (`10 mail.example.com.`, `"stück 1" "stück 2"`). doh.ts behandelt danach
 * beide Formate gleich, auch beim Zusammensetzen der TXT-Stücke.
 *
 * Eigener Code statt Bibliothek: Gebraucht werden eine Frage und der
 * Answer-Abschnitt für ein Dutzend Typen. Eine Bibliothek wie dns-packet
 * (MIT) liefert Objekte, die trotzdem in die Textform der JSON-API übersetzt
 * werden müssten — als neue Laufzeit-Abhängigkeit für rund 200 Zeilen.
 *
 * Die Antwort kommt von außen. Jeder Zugriff ist gegen die Länge geprüft,
 * Kompressionszeiger dürfen nur zurück zeigen und nicht in den Kopf; eine
 * kaputte oder abgeschnittene Nachricht wirft `DnsWireError`, statt Werte zu
 * erfinden.
 */

/** Eine kaputte, abgeschnittene oder unpassende DNS-Nachricht. */
export class DnsWireError extends Error {
  constructor(detail: string) {
    super(`Ungültige DNS-Antwort: ${detail}`);
    this.name = 'DnsWireError';
  }
}

/** Ein Eintrag aus dem Answer-Abschnitt, Felder wie in der JSON-API. */
export interface DnsAnswer {
  name: string;
  type: number;
  TTL: number;
  data: string;
}

/**
 * Eine DNS-Antwort in der Form der JSON-API (`application/dns-json`).
 * Status: 0 = NOERROR, 2 = SERVFAIL, 3 = NXDOMAIN, …
 */
export interface DnsResponse {
  Status: number;
  TC?: boolean;
  RD?: boolean;
  RA?: boolean;
  /** Authenticated Data — DNSSEC-validiert vom Resolver */
  AD?: boolean;
  /** Checking Disabled */
  CD?: boolean;
  Question?: { name: string; type: number }[];
  Answer?: DnsAnswer[];
}

const CLASS_IN = 1;
const TYPE_OPT = 41;
/** Länge des Kopfs (ID, Flags, vier Zähler). */
const HEADER = 12;
/** Größer kann eine DNS-Nachricht nicht sein (16-Bit-Länge bei TCP). */
const MAX_MESSAGE = 65_535;
const MAX_NAME = 255;
const MAX_LABEL = 63;
/** Mehr Sprünge hat kein echter Name; schützt vor Zeiger-Ketten. */
const MAX_POINTER_JUMPS = 64;

/**
 * Baut eine Anfrage: ein Name, ein Typ, Klasse IN, Rekursion erwünscht.
 *
 * Die ID ist 0, wie RFC 8484 (Abschnitt 4.1) es für DoH empfiehlt: Gleiche
 * Fragen ergeben dieselbe URL und sind damit für HTTP-Caches gleich.
 * Mit `dnssec` kommt ein OPT-Record mit DO-Bit dazu (RFC 3225).
 */
export function encodeQuery(
  name: string,
  type: number,
  options: { dnssec?: boolean } = {}
): Uint8Array {
  const qname = encodeName(name);
  const opt = options.dnssec ? 11 : 0;
  const msg = new Uint8Array(HEADER + qname.length + 4 + opt);
  const view = new DataView(msg.buffer);

  view.setUint16(0, 0); // ID
  view.setUint16(2, 0x0100); // RD
  view.setUint16(4, 1); // QDCOUNT
  view.setUint16(10, options.dnssec ? 1 : 0); // ARCOUNT

  msg.set(qname, HEADER);
  let o = HEADER + qname.length;
  view.setUint16(o, type);
  view.setUint16(o + 2, CLASS_IN);
  o += 4;

  if (options.dnssec) {
    // Name (Root), Typ OPT, UDP-Größe, erweiterter RCODE + Version, DO-Bit, RDLEN 0
    msg[o] = 0;
    view.setUint16(o + 1, TYPE_OPT);
    view.setUint16(o + 3, 4096);
    view.setUint32(o + 5, 0x0000_8000);
    view.setUint16(o + 9, 0);
  }
  return msg;
}

/**
 * Ein Name als Folge von Labels. Erwartet ASCII — die Domain ist an dieser
 * Stelle schon geprüft und als Punycode kodiert.
 */
function encodeName(name: string): Uint8Array {
  const trimmed = name.endsWith('.') ? name.slice(0, -1) : name;
  const labels = trimmed === '' ? [] : trimmed.split('.');
  const bytes: number[] = [];
  for (const label of labels) {
    if (label.length === 0) throw new DnsWireError(`leeres Label in „${name}“`);
    if (label.length > MAX_LABEL) throw new DnsWireError(`Label länger als ${MAX_LABEL} Zeichen`);
    bytes.push(label.length);
    for (let i = 0; i < label.length; i++) {
      const code = label.charCodeAt(i);
      if (code > 0x7e || code < 0x21) throw new DnsWireError(`Zeichen außerhalb von ASCII in „${name}“`);
      bytes.push(code);
    }
  }
  bytes.push(0);
  if (bytes.length > MAX_NAME) throw new DnsWireError(`Name länger als ${MAX_NAME} Bytes`);
  return Uint8Array.from(bytes);
}

/**
 * Liest eine Antwort. Ausgewertet werden Kopf, Frage und Answer-Abschnitt;
 * Authority und Additional braucht diggy nicht.
 *
 * `question` prüft, dass die Antwort zur gestellten Frage gehört — ein
 * Resolver oder Proxy, der eine fremde Antwort liefert, darf nicht als
 * „abweichender Wert“ in den Vergleich gehen.
 */
export function decodeResponse(
  bytes: Uint8Array,
  question?: { name: string; type: number }
): DnsResponse {
  if (bytes.length > MAX_MESSAGE) throw new DnsWireError('länger als 65535 Bytes');
  if (bytes.length < HEADER) throw new DnsWireError('kürzer als der Kopf');
  const reader = new Reader(bytes);

  const flags = reader.u16(2);
  if (!(flags & 0x8000)) throw new DnsWireError('keine Antwort (QR-Bit fehlt)');
  const qdcount = reader.u16(4);
  const ancount = reader.u16(6);

  let o = HEADER;
  const questions: { name: string; type: number }[] = [];
  for (let i = 0; i < qdcount; i++) {
    const { name, next } = reader.name(o);
    reader.need(next, 4);
    questions.push({ name, type: reader.u16(next) });
    o = next + 4;
  }

  if (question) {
    const asked = questions[0];
    const expected = fqdn(question.name).toLowerCase();
    if (!asked || asked.type !== question.type || asked.name.toLowerCase() !== expected) {
      throw new DnsWireError('gehört nicht zur Frage');
    }
  }

  const answers: DnsAnswer[] = [];
  for (let i = 0; i < ancount; i++) {
    const { name, next } = reader.name(o);
    reader.need(next, 10);
    const type = reader.u16(next);
    const cls = reader.u16(next + 2);
    const ttl = reader.u32(next + 4);
    const rdlength = reader.u16(next + 8);
    const start = next + 10;
    reader.need(start, rdlength);
    o = start + rdlength;
    if (cls !== CLASS_IN) continue;
    answers.push({ name, type, TTL: ttl, data: formatRdata(reader, type, start, rdlength) });
  }

  return {
    Status: flags & 0x000f,
    TC: Boolean(flags & 0x0200),
    RD: Boolean(flags & 0x0100),
    RA: Boolean(flags & 0x0080),
    AD: Boolean(flags & 0x0020),
    CD: Boolean(flags & 0x0010),
    Question: questions,
    Answer: answers,
  };
}

function fqdn(name: string): string {
  return name.endsWith('.') ? name : `${name}.`;
}

/** Lesezugriffe mit Längenprüfung. */
class Reader {
  private readonly view: DataView;

  constructor(readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  need(offset: number, length: number): void {
    if (offset + length > this.bytes.length) throw new DnsWireError('Nachricht endet vorzeitig');
  }

  u8(offset: number): number {
    this.need(offset, 1);
    return this.bytes[offset];
  }

  u16(offset: number): number {
    this.need(offset, 2);
    return this.view.getUint16(offset);
  }

  u32(offset: number): number {
    this.need(offset, 4);
    return this.view.getUint32(offset);
  }

  slice(offset: number, length: number): Uint8Array {
    this.need(offset, length);
    return this.bytes.subarray(offset, offset + length);
  }

  /**
   * Ein Name ab `offset`, mit Kompression (RFC 1035, 4.1.4). `next` ist die
   * Stelle hinter dem Namen im Datensatz — bei einem Zeiger hinter dem
   * Zeiger, nicht hinter dem Ziel.
   */
  name(offset: number): { name: string; next: number } {
    const labels: string[] = [];
    let pos = offset;
    let next = -1;
    let length = 1;
    let jumps = 0;

    for (;;) {
      const len = this.u8(pos);
      if ((len & 0xc0) === 0xc0) {
        const target = this.u16(pos) & 0x3fff;
        if (target >= pos) throw new DnsWireError('Kompressionszeiger zeigt nicht zurück');
        // Namen stehen erst hinter dem Kopf; dort hinein zeigt kein gültiger Zeiger.
        if (target < HEADER) throw new DnsWireError('Kompressionszeiger zeigt in den Kopf');
        if (++jumps > MAX_POINTER_JUMPS) throw new DnsWireError('zu viele Kompressionszeiger');
        if (next < 0) next = pos + 2;
        pos = target;
        continue;
      }
      if (len & 0xc0) throw new DnsWireError('unbekannter Label-Typ');
      if (len === 0) {
        if (next < 0) next = pos + 1;
        break;
      }
      length += len + 1;
      if (length > MAX_NAME) throw new DnsWireError(`Name länger als ${MAX_NAME} Bytes`);
      labels.push(escapeLabel(this.slice(pos + 1, len)));
      pos += 1 + len;
    }

    return { name: labels.length === 0 ? '.' : `${labels.join('.')}.`, next };
  }
}

/**
 * Ein Label in Textform: Buchstaben, Ziffern und Bindestrich wie sie sind,
 * Punkt und Backslash maskiert, alles andere als `\DDD` (RFC 1035, 5.1).
 */
function escapeLabel(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    if (b === 0x2e || b === 0x5c) out += `\\${String.fromCharCode(b)}`;
    else if (b > 0x20 && b < 0x7f) out += String.fromCharCode(b);
    else out += `\\${String(b).padStart(3, '0')}`;
  }
  return out;
}

const utf8 = new TextDecoder('utf-8');

/** Eine Zeichenkette in Anführungszeichen, `"` und `\` maskiert — wie Cloudflare sie liefert. */
function quoted(bytes: Uint8Array): string {
  return `"${utf8.decode(bytes).replace(/["\\]/g, '\\$&')}"`;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * RDATA in der Textform der JSON-API. Namen mit abschließendem Punkt (wie
 * bei Google); doh.ts entfernt ihn dort, wo er stört. Unbekannte Typen in
 * der generischen Form `\# <Länge> <hex>` (RFC 3597).
 */
function formatRdata(r: Reader, type: number, start: number, length: number): string {
  const end = start + length;
  /** Ein Name in den RDATA — darf nicht über den Datensatz hinausragen. */
  const nameAt = (offset: number) => {
    const result = r.name(offset);
    if (result.next > end) throw new DnsWireError('Name ragt über den Datensatz hinaus');
    return result;
  };
  const fixed = (expected: number) => {
    if (length !== expected) throw new DnsWireError(`Typ ${type} mit ${length} statt ${expected} Bytes`);
  };
  const atLeast = (minimum: number) => {
    if (length < minimum) throw new DnsWireError(`Typ ${type} mit nur ${length} Bytes`);
  };

  switch (type) {
    case 1: // A
      fixed(4);
      return Array.from(r.slice(start, 4)).join('.');

    case 28: // AAAA
      fixed(16);
      return formatIpv6(r.slice(start, 16));

    case 2: // NS
    case 5: // CNAME
    case 12: // PTR
      return nameAt(start).name;

    case 15: {
      // MX
      atLeast(3);
      return `${r.u16(start)} ${nameAt(start + 2).name}`;
    }

    case 16: {
      // TXT: eine oder mehrere Zeichenketten mit Längenbyte
      const chunks: string[] = [];
      let o = start;
      while (o < end) {
        const len = r.u8(o);
        if (o + 1 + len > end) throw new DnsWireError('TXT-Stück ragt über den Datensatz hinaus');
        chunks.push(quoted(r.slice(o + 1, len)));
        o += 1 + len;
      }
      return chunks.length > 0 ? chunks.join(' ') : '""';
    }

    case 6: {
      // SOA
      const mname = nameAt(start);
      const rname = nameAt(mname.next);
      const o = rname.next;
      if (o + 20 !== end) throw new DnsWireError('SOA-Record mit falscher Länge');
      const numbers = [0, 4, 8, 12, 16].map((i) => r.u32(o + i));
      return `${mname.name} ${rname.name} ${numbers.join(' ')}`;
    }

    case 33: {
      // SRV
      atLeast(7);
      return `${r.u16(start)} ${r.u16(start + 2)} ${r.u16(start + 4)} ${nameAt(start + 6).name}`;
    }

    case 257: {
      // CAA: Flags, Länge des Tags, Tag, Wert
      atLeast(2);
      const tagLength = r.u8(start + 1);
      if (2 + tagLength > length) throw new DnsWireError('CAA-Tag ragt über den Datensatz hinaus');
      const tag = utf8.decode(r.slice(start + 2, tagLength));
      const value = r.slice(start + 2 + tagLength, length - 2 - tagLength);
      return `${r.u8(start)} ${tag} ${quoted(value)}`;
    }

    case 43: {
      // DS
      atLeast(5);
      return `${r.u16(start)} ${r.u8(start + 2)} ${r.u8(start + 3)} ${hex(r.slice(start + 4, length - 4))}`;
    }

    case 48: {
      // DNSKEY
      atLeast(5);
      const key = Buffer.from(r.slice(start + 4, length - 4)).toString('base64');
      return `${r.u16(start)} ${r.u8(start + 2)} ${r.u8(start + 3)} ${key}`;
    }

    default:
      return `\\# ${length}${length > 0 ? ` ${hex(r.slice(start, length))}` : ''}`;
  }
}

/**
 * IPv6 in der Kurzform nach RFC 5952, wie die JSON-API sie liefert: Gruppen
 * ohne führende Nullen, die längste Folge aus mindestens zwei Null-Gruppen
 * als `::` (bei Gleichstand die erste), Kleinbuchstaben.
 */
export function formatIpv6(bytes: Uint8Array): string {
  const groups: number[] = [];
  for (let i = 0; i < 16; i += 2) groups.push((bytes[i] << 8) | bytes[i + 1]);

  let bestStart = -1;
  let bestLength = 1;
  for (let i = 0; i < 8; ) {
    if (groups[i] !== 0) {
      i++;
      continue;
    }
    let j = i;
    while (j < 8 && groups[j] === 0) j++;
    if (j - i > bestLength) {
      bestStart = i;
      bestLength = j - i;
    }
    i = j;
  }

  const text = (from: number, to: number) =>
    groups.slice(from, to).map((g) => g.toString(16)).join(':');
  if (bestStart < 0) return text(0, 8);
  return `${text(0, bestStart)}::${text(bestStart + bestLength, 8)}`;
}
