import type { RecordType } from '@/types/dns';

/**
 * Erklärungen zu Record-Typen und Mail-Begriffen — „DNS made friendly“ (#80).
 *
 * Alle Texte stehen hier und nur hier: die Komponenten zeigen sie über den
 * `InfoButton` an, formulieren aber nichts selbst. Wer einen Text ändert oder
 * einen Begriff ergänzt, muss nur diese Datei anfassen.
 *
 * Maßstab für die Texte: ein kurzer Titel und ein bis zwei Sätze, die jemand
 * ohne DNS-Kenntnisse versteht — fachlich aber so genau, dass niemand, der es
 * besser weiß, widersprechen muss.
 */
export interface Explanation {
  /** Kurzer Titel in Alltagsdeutsch, z. B. „Mailserver“. */
  title: string;
  /** Ein bis zwei Sätze. */
  text: string;
}

/**
 * Die Typen, die die Records-Liste zeigt: alles aus `QUERY_TYPES` im
 * dnsLookup plus CNAME. SRV, PTR, DNSKEY und DS kennt der Typ `RecordType`
 * zwar, in der Liste tauchen sie aber nicht auf.
 */
export type ExplainedRecordType = 'A' | 'AAAA' | 'CNAME' | 'MX' | 'NS' | 'TXT' | 'CAA' | 'SOA';

export type MailTerm = 'SPF' | 'DKIM' | 'DMARC' | 'MTA-STS';

export const RECORD_EXPLANATIONS: Record<ExplainedRecordType, Explanation> = {
  A: {
    title: 'IPv4-Adresse',
    // Die TTL steht nur hier, weil A in der Liste zuerst kommt — sie gilt für
    // jede Zeile gleich. Die Zahl ist die Restzeit im Cache des abgefragten
    // Resolvers, nicht die eingestellte TTL; deshalb verspricht der Text
    // nicht, dass Änderungen nach genau dieser Zeit überall angekommen sind.
    text:
      'Die IPv4-Adresse des Servers hinter diesem Namen – dorthin verbinden sich Browser und Apps. ' +
      'Die Sekunden rechts zeigen die TTL: Sie sagt, wie lange DNS-Server die Antwort zwischenspeichern dürfen, deshalb kommen Änderungen nicht sofort überall an.',
  },
  AAAA: {
    title: 'IPv6-Adresse',
    text:
      'Wie der A-Record, nur mit einer IPv6-Adresse, dem neueren Adressformat. ' +
      'Fehlt er, ist die Domain nur über IPv4 erreichbar.',
  },
  CNAME: {
    title: 'Alias für einen anderen Namen',
    text:
      'Macht diesen Namen zum Alias eines anderen: Wer ihn abfragt, bekommt die Einträge des Ziels. ' +
      'Eigene weitere Einträge darf ein Name mit CNAME nicht haben – was sonst in der Liste steht, kommt vom Ziel.',
  },
  MX: {
    title: 'Mailserver',
    text:
      'Nennt die Server, die E-Mails für die Domain annehmen. ' +
      'Die Zahl davor ist die Priorität: Der kleinste Wert wird zuerst versucht, die anderen springen ein, wenn er nicht erreichbar ist.',
  },
  NS: {
    title: 'Zuständige Nameserver',
    text:
      'Die DNS-Server, die für die Domain verbindlich Auskunft geben. ' +
      'Auf ihnen sind alle anderen Einträge gespeichert.',
  },
  TXT: {
    title: 'Freier Text',
    text:
      'Beliebiger Text zu einem Namen. ' +
      'Damit weist du etwa Google oder Microsoft nach, dass dir die Domain gehört, und auch Mail-Regeln wie SPF stehen hier.',
  },
  CAA: {
    title: 'Erlaubte Zertifizierungsstellen',
    text:
      'Legt fest, welche Zertifizierungsstellen (etwa Let’s Encrypt) TLS-Zertifikate für die Domain ausstellen dürfen. ' +
      'Gibt es keinen CAA-Record, darf das jede.',
  },
  SOA: {
    title: 'Stammdaten der Zone',
    text:
      'Nennt den primären Nameserver, eine Kontaktadresse und eine Seriennummer, die bei jeder Änderung steigen sollte. ' +
      'Die Zahlen danach regeln, wie oft sich die Nameserver abgleichen und wie lange „gibt es nicht“-Antworten gemerkt werden.',
  },
};

export const MAIL_EXPLANATIONS: Record<MailTerm, Explanation> = {
  SPF: {
    title: 'Erlaubte Absender',
    text:
      'Eine Liste der Server, die E-Mails im Namen deiner Domain verschicken dürfen. ' +
      'Empfänger prüfen damit, ob eine Mail von einem erlaubten Server kommt.',
  },
  DKIM: {
    title: 'Digitale Unterschrift',
    text:
      'Dein Mailserver unterschreibt ausgehende Mails, der passende öffentliche Schlüssel steht im DNS unter <selector>._domainkey. ' +
      'So kann der Empfänger prüfen, dass die Mail wirklich von deiner Domain stammt und unterwegs nicht verändert wurde.',
  },
  DMARC: {
    title: 'Regel gegen Fälschungen',
    // „für genau diese Domain“: DMARC verlangt, dass SPF oder DKIM für die
    // Domain im sichtbaren Absender besteht (Alignment). Ein SPF-Pass für die
    // Domain eines Versanddienstes allein reicht nicht.
    text:
      'Sagt Empfängern, was mit Mails passieren soll, die deine Domain als Absender zeigen, aber weder per SPF noch per DKIM für genau diese Domain bestätigt sind: nichts tun (none), in den Spamordner (quarantine) oder ablehnen (reject). ' +
      'Mit rua bekommst du Berichte.',
  },
  'MTA-STS': {
    title: 'Verschlüsselung erzwingen',
    text:
      'Verlangt von anderen Mailservern, Mails an deine Domain nur verschlüsselt und an Server mit gültigem Zertifikat zuzustellen. ' +
      'Ohne einen solchen Schutz kann ein Angreifer unterwegs die Verschlüsselung abschalten und mitlesen.',
  },
};

/** Erklärung zu einem Record-Typ — `undefined` für Typen ohne Text. */
export function explainRecordType(type: RecordType): Explanation | undefined {
  return Object.hasOwn(RECORD_EXPLANATIONS, type)
    ? RECORD_EXPLANATIONS[type as ExplainedRecordType]
    : undefined;
}
