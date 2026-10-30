import { useEffect, useState } from 'react';
import {
  AccentBox,
  Alert,
  AlertBadge,
  AlertText,
  Badge,
  BigNumber,
  Button,
  ColumnLayout,
  Content,
  Flex,
  Header,
  Heading,
  Icon,
  IconDanger,
  IconSecurity,
  IllustratedMessage,
  Label,
  LabeledValue,
  LoadingSpinner,
  Section,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Text,
} from '@mittwald/flow-react-components';
import { IconThumbDown, IconThumbUp } from '@tabler/icons-react';
import type { VirusScanReport } from '@/types/dns';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatDate, t, tRich, useI18n } from '@/i18n';
import type { DeKey } from '@/i18n/de';
import { LoadingAnnouncement } from '@/components/ui/LoadingAnnouncement';

interface VirusScanViewProps {
  data: VirusScanReport | null;
  loading: boolean;
  error: string | null;
  onRun: () => void;
}

/**
 * Der VirusTotal-Tab: Scan anstoßen, Urteil und Kennzahlen lesen, darunter
 * die Engines, die angeschlagen haben. Tab-Inhalt in der LayoutCard des
 * Reports — deshalb Sections statt Karten.
 */
export function VirusScanView({ data, loading, error, onRun }: VirusScanViewProps) {
  useI18n();
  const idle = !data && !loading && !error;
  const description = t('Prüft die Domain gegen 80+ Sicherheits-Engines auf Malware, Phishing und Blacklists.');

  return (
    <>
      <Section>
        <Header>
          <Heading level={2}>
            VirusTotal Scan
            {data && <AlertBadge status="success">{t('Scan abgeschlossen')}</AlertBadge>}
          </Heading>
          {!idle && (
            <Button variant="soft" color="secondary" onPress={onRun} isPending={loading}>
              {t('Scan starten')}
            </Button>
          )}
        </Header>

        {idle ? (
          <EmptyState icon={<IconSecurity />} action={<Button onPress={onRun}>{t('Scan starten')}</Button>}>
            {description}
          </EmptyState>
        ) : (
          <Text elementType="p">{description}</Text>
        )}

        {loading && <ScanLoader />}

        {error && !loading && (
          <EmptyState
            tone="danger"
            icon={<IconDanger />}
            action={
              <Button variant="soft" color="secondary" onPress={onRun}>
                {t('Erneut versuchen')}
              </Button>
            }
          >
            {error}
          </EmptyState>
        )}

        {data && !loading && <ScanSummary data={data} />}
      </Section>

      {data && !loading && <ScanDetails data={data} />}
    </>
  );
}

const VERDICT = {
  clean: { status: 'success', label: 'Sauber', sub: 'Keine Bedrohungen erkannt' },
  suspicious: { status: 'warning', label: 'Verdächtig', sub: 'Einige Engines haben Bedenken' },
  malicious: { status: 'danger', label: 'Schädlich', sub: 'Domain als Bedrohung eingestuft' },
} as const satisfies Record<string, { status: 'success' | 'warning' | 'danger'; label: DeKey; sub: DeKey }>;

/** Urteil und Kennzahlen — direkt unter dem Start. */
function ScanSummary({ data }: { data: VirusScanReport }) {
  const total = data.stats.malicious + data.stats.suspicious + data.stats.harmless + data.stats.undetected;
  const flagged = data.stats.malicious + data.stats.suspicious;
  const verdict = VERDICT[data.verdict];
  const harmlessVendors = data.vendors.filter((v) => v.category === 'harmless').length;
  const anyFlaggedVendor = data.vendors.some((v) => v.category === 'malicious' || v.category === 'suspicious');

  return (
    <>
      {/* Das Urteil trägt seinen Status als Wort, Icon und Farbe. */}
      <Alert status={verdict.status}>
        <Heading>{t(verdict.label)}</Heading>
        <Content>
          {t(verdict.sub)}.{' '}
          {tRich('{flagged} von {total} Engines haben angeschlagen', {
            flagged: <strong>{flagged}</strong>,
            total: <strong>{total}</strong>,
          })}
        </Content>
      </Alert>

      <ColumnLayout s={[1, 1]} m={[1, 1, 1, 1]} l={[1, 1, 1, 1]}>
        <Stat label="Malicious" value={data.stats.malicious} />
        <Stat label="Suspicious" value={data.stats.suspicious} />
        <Stat label="Harmless" value={data.stats.harmless} />
        <Stat label="Undetected" value={data.stats.undetected} />
      </ColumnLayout>

      <ColumnLayout s={[1]} m={[1, 1]} l={[1, 1]}>
        <LabeledValue>
          <Label>Reputation Score</Label>
          <Reputation value={data.reputation} />
          <Text>
            <small>{t('Community-Bewertung (negativ = schlechter Ruf)')}</small>
          </Text>
        </LabeledValue>
        <LabeledValue>
          <Label>Community Votes</Label>
          <Content>
            <Flex gap="m" align="center">
              <Flex gap="xs" align="center">
                <Icon color="success" aria-label="harmless">
                  <IconThumbUp />
                </Icon>
                <Text>{data.totalVotes.harmless}</Text>
              </Flex>
              <Flex gap="xs" align="center">
                <Icon color="danger" aria-label="malicious">
                  <IconThumbDown />
                </Icon>
                <Text>{data.totalVotes.malicious}</Text>
              </Flex>
            </Flex>
          </Content>
          <Text>
            <small>{t('Letzte Analyse: {date}', { date: formatDate(data.lastAnalysisDate) })}</small>
          </Text>
        </LabeledValue>
      </ColumnLayout>

      {!anyFlaggedVendor && harmlessVendors > 0 && (
        <AlertText status="success">
          {t('{count} Engines haben die Domain als unbedenklich eingestuft.', { count: harmlessVendors })}
        </AlertText>
      )}
    </>
  );
}

/** Ein schlechter Ruf ist ein Befund, ein guter eine Entwarnung, null nichts von beidem. */
function Reputation({ value }: { value: number }) {
  const shown = value > 0 ? `+${value}` : `${value}`;
  if (value < 0) return <AlertText status="danger">{shown}</AlertText>;
  if (value > 0) return <AlertText status="success">{shown}</AlertText>;
  return <Content>{shown}</Content>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <AccentBox>
      <BigNumber>
        <Text>{value}</Text>
        <Text>{label}</Text>
      </BigNumber>
    </AccentBox>
  );
}

/** Angeschlagene Engines und Kategorien — je eine eigene Section. */
function ScanDetails({ data }: { data: VirusScanReport }) {
  const flaggedVendors = data.vendors.filter(
    (v) => v.category === 'malicious' || v.category === 'suspicious'
  );
  // Rot nur, wenn wirklich eine Engine „malicious“ meldet — reine
  // Verdachtsfälle sind eine Warnung.
  const anyMalicious = flaggedVendors.some((v) => v.category === 'malicious');
  const categories = [...new Set(Object.values(data.categories))];

  return (
    <>
      {flaggedVendors.length > 0 && (
        <Section>
          <Heading level={2}>
            {t('{count} Engines haben angeschlagen', { count: flaggedVendors.length })}
            <AlertBadge status={anyMalicious ? 'danger' : 'warning'}>
              {anyMalicious ? t('Schädlich') : t('Verdächtig')}
            </AlertBadge>
          </Heading>
          <Table aria-label={t('{count} Engines haben angeschlagen', { count: flaggedVendors.length })}>
            <TableHeader>
              <TableColumn>Engine</TableColumn>
              <TableColumn>{t('Ergebnis')}</TableColumn>
            </TableHeader>
            <TableBody>
              {flaggedVendors.map((v) => (
                <TableRow key={v.name}>
                  <TableCell>{v.name}</TableCell>
                  <TableCell>
                    <AlertBadge status={v.category === 'malicious' ? 'danger' : 'warning'}>{v.result}</AlertBadge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}

      {categories.length > 0 && (
        <Section>
          <Heading level={2}>{t('Kategorisierung durch Sicherheits-Engines')}</Heading>
          <Flex gap="s" wrap="wrap">
            {categories.map((cat) => (
              <Badge key={cat} color="neutral">
                {cat}
              </Badge>
            ))}
          </Flex>
        </Section>
      )}
    </>
  );
}

const SCAN_STAGES: DeKey[] = [
  'Verbinde mit VirusTotal…',
  'Prüfe 80+ Security-Engines…',
  'Analysiere Blacklists…',
  'Werte Reputation aus…',
  'Bereite Ergebnisse auf…',
];

function ScanLoader() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStage((s) => (s + 1) % SCAN_STAGES.length);
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  // Einmalige Ansage statt aria-busy, Anzeige aria-hidden — Begründung beim
  // PageSpeedLoader.
  return (
    <>
      <LoadingAnnouncement>{t('VirusTotal-Scan läuft…')}</LoadingAnnouncement>
      <IllustratedMessage aria-hidden="true">
        <LoadingSpinner size="l" />
        <Heading level={3}>{t('Scan läuft')}</Heading>
        <Text>{t(SCAN_STAGES[stage])}</Text>
      </IllustratedMessage>
    </>
  );
}
