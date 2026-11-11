import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  CounterBadge,
  IconDanger,
  IconUnavailable,
  Section,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  TabTitle,
  Text,
} from '@mittwald/flow-react-components';
import type { DnsRecord, RecordType } from '@/types/dns';
import { IpAddressLink, IpOwnerLabel, IpPtrLabel } from '@/components/ip/IpAddressLink';
import { isInspectableIp } from '@/components/ip/isInspectableIp';
import { EmptyState } from '@/components/ui/EmptyState';
import { InfoButton } from '@/components/ui/InfoButton';
import { LookupLink } from '@/components/ui/LookupLink';
import { NULL_MX_EXPLANATION, explainRecordType } from '@/lib/explanations';
import { isNullMx } from '@/lib/nullMx';
import { useI18n } from '@/i18n';
import styles from './RecordsList.module.css';

interface RecordsListProps {
  records: DnsRecord[];
  domain: string;
  /** Typen ohne Antwort (Timeout, SERVFAIL …) — ob es sie gibt, ist offen. */
  failedTypes?: RecordType[];
  /** Den Namen gibt es im DNS nicht (NXDOMAIN). */
  nxdomain?: boolean;
}

type Filter = RecordType | 'ALL';

/**
 * Alle Records, umschaltbar nach Typ.
 *
 * Der Filter schaltet den sichtbaren Inhalt um — in Flow sind das Tabs (der
 * frühere Chip-Umschalter entspräche dem veralteten SegmentedControl). Ist
 * für die Typen kein Platz, klappt Flow die Leiste selbst zu einer Auswahl
 * zusammen.
 *
 * Flow hält alle Tab-Panels gemountet (nur `inert`). Die Tabelle steht deshalb
 * nur im gewählten Tab — sonst lägen alle Records mehrfach im DOM, und jede
 * IP fragte ihren Netzbetreiber je Tab ab.
 */
export function RecordsList({ records, domain, failedTypes = [], nxdomain = false }: RecordsListProps) {
  const [filter, setFilter] = useState<Filter>('ALL');
  const { t } = useI18n();

  const types = useMemo(() => {
    const counts = new Map<RecordType, number>();
    records.forEach((r) => counts.set(r.type, (counts.get(r.type) ?? 0) + 1));
    return Array.from(counts.entries());
  }, [records]);

  // Null-MX nur, wenn er der einzige MX ist (Regel: shared/nullMx.ts) —
  // steht ein echter daneben, stellen Absender dorthin zu.
  const nullMx = useMemo(() => isNullMx(records.filter((r) => r.type === 'MX')), [records]);

  const table = (key: Filter, shown: () => DnsRecord[]) =>
    filter === key && <RecordsTable records={shown()} nullMx={nullMx} />;

  if (records.length === 0) return <NoRecords domain={domain} failedTypes={failedTypes} nxdomain={nxdomain} />;

  return (
    <Section>
      {failedTypes.length > 0 && (
        <Alert status="warning">
          <Text>
            {t('Keine Antwort für {types} — diese Typen fehlen deshalb womöglich in der Liste.', {
              types: failedTypes.join(', '),
            })}
          </Text>
        </Alert>
      )}
      <Tabs
        aria-label={t('Record-Typ')}
        selectedKey={filter}
        onSelectionChange={(key) => setFilter(key as Filter)}
      >
        <Tab id="ALL">
          <TabTitle>
            {t('Alle')}
            <CounterBadge count={records.length} />
          </TabTitle>
          {table('ALL', () => records)}
        </Tab>
        {types.map(([type, count]) => (
          <Tab key={type} id={type}>
            <TabTitle>
              {type}
              <CounterBadge count={count} />
            </TabTitle>
            {table(type, () => records.filter((r) => r.type === type))}
          </Tab>
        ))}
      </Tabs>
    </Section>
  );
}

/** Die Typen, die der Server abfragt (server/services/dnsLookup.ts). */
const QUERIED_TYPES = 'A, AAAA, CNAME, MX, NS, TXT, CAA, SOA';

/**
 * Keine Records (#151): Bisher stand dann nur der Tabellenkopf da — ob die
 * Abfrage fertig, gescheitert oder ohne Treffer war, war nicht zu erkennen.
 * Drei Fälle, weil sie Verschiedenes heißen: Ohne Antwort ist offen, ob es
 * Records gibt. NXDOMAIN heißt, den Namen gibt es nicht. Sonst existiert er,
 * hat aber keinen der abgefragten Typen.
 */
function NoRecords({ domain, failedTypes, nxdomain }: { domain: string; failedTypes: RecordType[]; nxdomain: boolean }) {
  const { t, tRich } = useI18n();
  const name = <span className="mono">{domain}</span>;
  if (failedTypes.length > 0) {
    return (
      <EmptyState tone="danger" icon={<IconDanger />} title={t('Keine Antwort vom DNS')}>
        {t('Für {types} kam keine Antwort (Zeitüberschreitung oder Serverfehler). Ob es Records gibt, ist deshalb offen.', {
          types: failedTypes.join(', '),
        })}
      </EmptyState>
    );
  }
  if (nxdomain) {
    return (
      <EmptyState icon={<IconUnavailable />} title={t('Domain existiert nicht')}>
        {tRich('Den Namen {domain} gibt es im DNS nicht (NXDOMAIN). Stimmt die Schreibweise? Ob die Domain registriert ist, zeigt der Tab WHOIS.', {
          domain: name,
        })}
      </EmptyState>
    );
  }
  return (
    <EmptyState title={t('Keine Records gefunden')}>
      {tRich('{domain} existiert, hat aber keine Records der abgefragten Typen ({types}).', {
        domain: name,
        types: QUERIED_TYPES,
      })}
    </EmptyState>
  );
}

function RecordsTable({ records, nullMx }: { records: DnsRecord[]; nullMx: boolean }) {
  const { t } = useI18n();

  // Das „?“ zur Erklärung steht nur in der ersten Zeile je Typ. An jeder
  // Zeile wären es bei vielen TXT- oder NS-Records ein Dutzend gleiche
  // Fragezeichen untereinander — und ebenso viele Tab-Stopps.
  const explainedRows = new Set<number>();
  const seenTypes = new Set<RecordType>();
  records.forEach((record, i) => {
    if (seenTypes.has(record.type)) return;
    seenTypes.add(record.type);
    explainedRows.add(i);
  });

  return (
    // Typ und TTL so schmal wie ihr längster Inhalt („CNAME ?“, „86400s“):
    // auf dem Handy bleibt sonst für den Wert kaum ein Drittel der Breite.
    <Table aria-label={t('DNS-Records')} layout="fixed" verticalAlign="middle">
      <TableHeader>
        <TableColumn width="5.5rem">{t('Typ')}</TableColumn>
        <TableColumn>{t('Wert')}</TableColumn>
        <TableColumn width="5.5rem" horizontalAlign="end">
          TTL
        </TableColumn>
      </TableHeader>
      <TableBody>
        {records.map((record, i) => {
          const hasIpDetails =
            (record.type === 'A' || record.type === 'AAAA') && isInspectableIp(record.value);
          const explanation = explainedRows.has(i) ? explainRecordType(record.type) : undefined;

          return (
            <TableRow key={`${record.type}-${i}-${record.value}`}>
              <TableCell>
                <span className={`mono ${styles.type}`}>
                  {record.type}
                  {explanation && <InfoButton term={record.type} explanation={explanation} />}
                </span>
              </TableCell>
              <TableCell>
                <span className={`mono ${styles.value}`}>
                  {record.priority !== undefined && (
                    <span className={styles.priority}>{record.priority}</span>
                  )}
                  {hasIpDetails ? (
                    <>
                      <IpAddressLink ip={record.value} />
                      <IpPtrLabel ip={record.value} />
                      <IpOwnerLabel ip={record.value} />
                    </>
                  ) : record.type === 'NS' || record.type === 'CNAME' ? (
                    // Ein Hostname, den man selbst prüfen will (#147): Link auf seinen Report.
                    <LookupLink value={record.value} />
                  ) : record.type === 'MX' ? (
                    <MxTarget value={record.value} nullMx={nullMx} />
                  ) : (
                    // Ganz zeigen statt abschneiden: DKIM-Schlüssel, SPF und
                    // Verifizierungs-Tokens will man lesen und kopieren können.
                    // `wrap-anywhere` bricht lange Base64-Ketten, bevorzugt aber
                    // Leerzeichen (#64).
                    <span className="wrap-anywhere">{record.value}</span>
                  )}
                </span>
              </TableCell>
              <TableCell horizontalAlign="end">
                <Ttl ttl={record.ttl} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/**
 * TTL in Sekunden — oder „—“, wenn der Server sie nicht ermitteln konnte
 * (`null`, #76). Eine `0s` wäre dort falsch: 0 ist eine echte TTL und hieße
 * „nicht cachen“. Der Strich ist für Screenreader ausgeblendet und durch
 * „TTL unbekannt“ ersetzt, sonst würde nur „Gedankenstrich“ vorgelesen.
 */
function Ttl({ ttl }: { ttl: number | null }) {
  const { t } = useI18n();
  if (ttl === null) {
    return (
      <Text title={t('TTL unbekannt')}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{t('TTL unbekannt')}</span>
      </Text>
    );
  }

  return <Text className={styles.ttl}>{ttl}s</Text>;
}

/**
 * Ziel eines MX. Die Wurzel kommt vom Resolver als leerer Name, in der
 * Zonendatei heißt sie „.“ — gezeigt wird sie wie im Vergleich als Punkt,
 * sonst stünde vom Null-MX nur die Priorität da (#120). Nur die Anzeige:
 * der Record selbst (und damit der JSON-Export) bleibt, wie er kam.
 *
 * Das Badge steht nur beim echten Null-MX. Ein leeres Ziel neben weiteren
 * MX ist nach RFC 7505 ungültig; die Domain empfängt dann über die anderen.
 */
function MxTarget({ value, nullMx }: { value: string; nullMx: boolean }) {
  const { t } = useI18n();
  return (
    <>
      <span className="wrap-anywhere">{value && !nullMx ? <LookupLink value={value} /> : value || '.'}</span>
      {nullMx && (
        <span className={styles.nullMx}>
          <Badge color="neutral">{t('Null-MX — keine Mails')}</Badge>
          <InfoButton term={t('Null-MX')} explanation={NULL_MX_EXPLANATION} />
        </span>
      )}
    </>
  );
}
