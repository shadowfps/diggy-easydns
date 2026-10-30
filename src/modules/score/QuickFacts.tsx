import type { ReactNode } from 'react';
import {
  AlertText,
  Badge,
  Button,
  ColumnLayout,
  Heading,
  Label,
  LabeledValue,
  LayoutCard,
  Section,
  SkeletonText,
  Text,
} from '@mittwald/flow-react-components';
import type {
  DetectedTech,
  DnsRecord,
  DnssecInfo,
  MailSecurity,
  SslInfo,
  TechCategory,
} from '@/types/dns';
import type { LoadStatus, SectionSlice } from '@/hooks/useProgressiveLookup';
import { isNullMx } from '@/lib/nullMx';
import { dmarcPolicyFlawLabelPhrase, effectiveDmarcPolicy } from '@/lib/dmarc';
import { IpAddressLink } from '@/components/ip/IpAddressLink';
import { isInspectableIp } from '@/components/ip/isInspectableIp';
import { phraseText, useI18n } from '@/i18n';
import styles from './QuickFacts.module.css';

/* ─── Tech-Stack ──────────────────────────────────────────────────────────── */

const TECH_CATEGORY_ORDER: TechCategory[] = [
  'server', 'language', 'cms', 'framework', 'css', 'library', 'cdn', 'hosting',
];

/** Returns a sorted + capped list of detected technologies. */
function sortTech(techs: DetectedTech[]): DetectedTech[] {
  return [...techs]
    .sort(
      (a, b) =>
        TECH_CATEGORY_ORDER.indexOf(a.category) -
        TECH_CATEGORY_ORDER.indexOf(b.category),
    )
    .slice(0, 12);
}

/* ─── Component ──────────────────────────────────────────────────────────── */

interface QuickFactItem {
  label: string;
  value?: ReactNode;
  mono?: boolean;
  ok?: boolean;
  bad?: boolean;
  /** Check gescheitert (Sektion oder Abfrage): neutral, mit Fragezeichen (#101). */
  unchecked?: boolean;
  loading?: boolean;
}

interface QuickFactsProps {
  records: DnsRecord[];
  ssl: SectionSlice<SslInfo | null>;
  dnssec: SectionSlice<DnssecInfo>;
  mail: SectionSlice<MailSecurity>;
  techStack: SectionSlice<DetectedTech[]>;
  onUseDomain?: (domain: string) => void;
}

export function QuickFacts({ records, ssl, dnssec, mail, techStack, onUseDomain }: QuickFactsProps) {
  const { t } = useI18n();
  const aRecord = records.find((r) => r.type === 'A');
  const mxRecords = records.filter((r) => r.type === 'MX');
  const mxRecord = mxRecords[0];
  const nsRecord = records.find((r) => r.type === 'NS');

  // Ein Null-MX (`MX 0 .`) hat ein leeres Ziel — als Wert gezeigt, stand hier
  // ein leeres Feld. Er ist eine Aussage, kein fehlender Eintrag. Erkannt an
  // den Records des gefragten Namens, die sofort da sind; der Mail-Check
  // läuft auf der Apex-Domain und kommt später.
  const mxItem: QuickFactItem = isNullMx(mxRecords)
    ? { label: 'MX', value: t('keine Mails (Null-MX)') }
    : { label: 'MX', value: mxRecord?.value ?? '—', mono: true };
  const aValue =
    aRecord && isInspectableIp(aRecord.value) ? <IpAddressLink ip={aRecord.value} /> : (aRecord?.value ?? '—');

  // Ein Klick übernimmt den Nameserver in die Suche — eine Aktion, also ein
  // Button. Der Name sagt, was passiert, und enthält den sichtbaren Wert.
  const nsValue =
    nsRecord && onUseDomain ? (
      <Button
        size="s"
        variant="plain"
        color="secondary"
        onPress={() => onUseDomain(nsRecord.value)}
        aria-label={t('{value} in die Suche übernehmen', { value: nsRecord.value })}
        className={styles.nsButton}
      >
        <Text className="mono">{nsRecord.value}</Text>
      </Button>
    ) : (
      (nsRecord?.value ?? '—')
    );

  // A/NS/MX kommen aus den Records und stehen sofort. SSL/DNSSEC/DMARC laden
  // im Hintergrund → bis dahin ein Inline-Skeleton statt des Werts. Nur
  // solange sie wirklich laden: bei einem Fehler oder einer übersprungenen
  // Sektion (DNS-Eintrag ohne Host) blieb sonst das Skeleton für immer stehen.
  // Ein Fehler ist „nicht prüfbar“ — ebenso eine fertige Sektion, deren
  // Abfrage scheiterte (`failed`, #101). Übersprungen heißt „nicht anwendbar“ (—).
  const placeholder = (
    label: string,
    status: LoadStatus,
    failed?: unknown
  ): QuickFactItem | null =>
    status === 'loading'
      ? { label, loading: true }
      : status === 'error' || (status === 'done' && failed)
        ? { label, value: t('nicht prüfbar'), unchecked: true }
        : status !== 'done'
          ? { label, value: '—' }
          : null;

  const sslInfo = ssl.data;
  const sslItem: QuickFactItem =
    placeholder('SSL', ssl.status, !sslInfo && ssl.lookupFailed) ?? {
      label: 'SSL',
      value: sslInfo ? t('{count} Tage', { count: sslInfo.daysUntilExpiry }) : t('kein Cert'),
      ok: Boolean(sslInfo?.valid && (sslInfo?.daysUntilExpiry ?? 0) > 14),
      bad: !sslInfo?.valid || (sslInfo?.daysUntilExpiry ?? 999) < 14,
    };

  const dnssecInfo = dnssec.data;
  const dnssecItem: QuickFactItem =
    placeholder('DNSSEC', dnssec.status, !dnssecInfo?.enabled && dnssecInfo?.lookupFailed) ?? {
      label: 'DNSSEC',
      value: dnssecInfo?.enabled && dnssecInfo?.valid ? t('aktiv') : t('inaktiv'),
      ok: Boolean(dnssecInfo?.enabled && dnssecInfo?.valid),
      bad: !dnssecInfo?.enabled,
    };

  // Ein Record, der nicht wie geschrieben gilt, ist nicht „gesetzt“
  // (shared/dmarc.ts). Wirkt er dank rua= wie p=none, steht der Mangel da —
  // ohne Haken. Ignorieren ihn Empfänger, ist er so schlecht wie keiner.
  const { policy: dmarcPolicy, flaw: dmarcFlaw } = effectiveDmarcPolicy(mail.data?.dmarc);
  const dmarcItem: QuickFactItem =
    placeholder('DMARC', mail.status, mail.data?.dmarc.lookupFailed) ??
    (dmarcPolicy === null
      ? { label: 'DMARC', value: dmarcFlaw ? t('unwirksam') : t('fehlt'), bad: true }
      : dmarcFlaw
        ? { label: 'DMARC', value: phraseText(dmarcPolicyFlawLabelPhrase(dmarcFlaw)) }
        : { label: 'DMARC', value: t('gesetzt'), ok: true });

  const items: QuickFactItem[] = [
    { label: 'A', value: aValue, mono: true },
    { label: 'NS', value: nsValue, mono: true },
    mxItem,
    sslItem,
    dnssecItem,
    dmarcItem,
  ];

  const techLoading = techStack.status === 'loading';
  const sortedTech = sortTech(techStack.data ?? []);

  return (
    <LayoutCard>
      <Section>
        <Heading level={2}>{t('Schnellübersicht')}</Heading>

        {/* Zwei Spalten auch in der schmalen Seitenspalte: die Werte sind kurz,
            und die Karte bleibt flach genug, um beim Scrollen mitzulaufen. */}
        <ColumnLayout s={[1, 1]} m={[1, 1]} l={[1, 1]} rowGap="m">
          {items.map((item) => (
            <LabeledValue key={item.label}>
              <Label>{item.label}</Label>
              <FactValue item={item} />
            </LabeledValue>
          ))}
        </ColumnLayout>

        {/* Der erkannte Stack, kurz und mit Version — als Badges, die man lesen
            kann, statt Logos, deren Namen nur im Tooltip standen. */}
        {(techLoading || sortedTech.length > 0) && (
          <LabeledValue>
            <Label>Stack</Label>
            {techLoading ? (
              <Text>
                <SkeletonText width="10em" />
              </Text>
            ) : (
              <div className={styles.stack}>
                {sortedTech.map((tech) => (
                  <Badge key={tech.name} color="neutral">
                    {tech.version ? `${tech.name} ${tech.version}` : tech.name}
                  </Badge>
                ))}
              </div>
            )}
          </LabeledValue>
        )}
      </Section>
    </LayoutCard>
  );
}

/**
 * Wert einer Zeile. Bewertet (gut, schlecht, nicht prüfbar) als AlertText —
 * Icon und Wort, nie nur Farbe. Solange die Sektion lädt, ein Platzhalter in
 * Texthöhe.
 */
function FactValue({ item }: { item: QuickFactItem }) {
  if (item.loading) {
    return (
      <Text>
        <SkeletonText width="5em" />
      </Text>
    );
  }
  if (item.ok) return <AlertText status="success">{item.value}</AlertText>;
  if (item.bad) return <AlertText status="danger">{item.value}</AlertText>;
  if (item.unchecked) return <AlertText status="unavailable">{item.value}</AlertText>;
  return <Text className={item.mono ? `mono ${styles.value}` : styles.value}>{item.value}</Text>;
}
