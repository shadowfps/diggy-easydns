import { useEffect, useState } from 'react';
import {
  AccentBox,
  AlertBadge,
  AlertText,
  BigNumber,
  Button,
  ColumnLayout,
  Header,
  Heading,
  IconDanger,
  IconMonitoring,
  IllustratedMessage,
  LoadingSpinner,
  RadioButton,
  RadioGroup,
  Section,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Text,
} from '@mittwald/flow-react-components';
import type { PageSpeedReport, PageSpeedStrategy } from '@/types/dns';
import { EmptyState } from '@/components/ui/EmptyState';
import { t, useI18n } from '@/i18n';
import type { DeKey } from '@/i18n/de';
import { LoadingAnnouncement } from '@/components/ui/LoadingAnnouncement';

interface PageSpeedViewProps {
  data: PageSpeedReport | null;
  loading: boolean;
  error: string | null;
  strategy: PageSpeedStrategy;
  onStrategyChange: (strategy: PageSpeedStrategy) => void;
  onRun: () => void;
}

type MetricTone = 'good' | 'warn' | 'bad' | 'neutral';

/**
 * Lighthouse-Bewertung als Status mit Icon UND Wort — wie bei den Findings.
 * Vorher war „verbesserungswürdig“ genauso rot wie „schlecht“, und das Wort
 * stand nur für Screenreader da.
 */
const METRIC_TONE: Record<Exclude<MetricTone, 'neutral'>, { status: 'success' | 'warning' | 'danger'; label: DeKey }> = {
  good: { status: 'success', label: 'gut' },
  warn: { status: 'warning', label: 'verbesserungswürdig' },
  bad: { status: 'danger', label: 'schlecht' },
};

/**
 * Der PageSpeed-Tab: Strategie wählen, Scan anstoßen, Kennzahlen lesen.
 * Tab-Inhalt in der LayoutCard des Reports — deshalb Sections statt Karten.
 */
export function PageSpeedView({
  data,
  loading,
  error,
  strategy,
  onStrategyChange,
  onRun,
}: PageSpeedViewProps) {
  useI18n();
  const idle = !data && !loading && !error;

  return (
    <>
      <Section>
        <Header>
          <Heading level={2}>
            PageSpeed Scan
            {data && <AlertBadge status="success">{t('Scan abgeschlossen')}</AlertBadge>}
          </Heading>
          {/* Nach einem Ergebnis oder Fehler: erneut, etwa mit der anderen Strategie. */}
          {!idle && (
            <Button variant="soft" color="secondary" onPress={onRun} isPending={loading}>
              {t('Scan starten')}
            </Button>
          )}
        </Header>

        {/* Mobil oder Desktop — eine Einfachauswahl, deshalb RadioGroup.
            Während des Scans gesperrt: die laufende Messung gilt der alten Wahl. */}
        <RadioGroup
          aria-label={t('Messung für')}
          value={strategy}
          onChange={(value) => onStrategyChange(value as PageSpeedStrategy)}
          isDisabled={loading}
          s={[1, 1]}
          m={[1, 1]}
          l={[1, 1, 1, 1]}
        >
          <RadioButton value="mobile">Mobile</RadioButton>
          <RadioButton value="desktop">Desktop</RadioButton>
        </RadioGroup>

        {idle && (
          <EmptyState
            icon={<IconMonitoring />}
            action={<Button onPress={onRun}>{t('Scan starten')}</Button>}
          >
            {t('Misst Ladezeit und Core Web Vitals mit Google Lighthouse — mobil oder am Desktop.')}
          </EmptyState>
        )}

        {loading && <PageSpeedLoader />}

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

        {data && !loading && (
          <ColumnLayout s={[1, 1]} m={[1, 1, 1]} l={[1, 1, 1]}>
            <Metric
              label="Performance Score"
              value={`${data.performanceScore}`}
              tone={scoreTone(data.performanceScore)}
            />
            <Metric label="LCP" value={formatMs(data.metrics.lcpMs)} tone={lcpTone(data.metrics.lcpMs)} />
            <Metric label="INP" value={formatMs(data.metrics.inpMs)} tone={inpTone(data.metrics.inpMs)} />
            <Metric label="FCP" value={formatMs(data.metrics.fcpMs)} tone={fcpTone(data.metrics.fcpMs)} />
            <Metric label="TTFB" value={formatMs(data.metrics.ttfbMs)} tone={ttfbTone(data.metrics.ttfbMs)} />
            <Metric label="CLS" value={formatCls(data.metrics.cls)} tone={clsTone(data.metrics.cls)} />
          </ColumnLayout>
        )}
      </Section>

      {data && !loading && <Opportunities items={data.opportunities} />}
    </>
  );
}

function Opportunities({ items }: { items: PageSpeedReport['opportunities'] }) {
  return (
    <Section>
      <Heading level={2}>{t('Top Optimierungspotenziale')}</Heading>
      {items.length === 0 ? (
        <AlertText status="success">{t('Keine kritischen Opportunities gefunden.')}</AlertText>
      ) : (
        <Table aria-label={t('Top Optimierungspotenziale')}>
          <TableHeader>
            <TableColumn>{t('Optimierung')}</TableColumn>
            <TableColumn>{t('Potenzial')}</TableColumn>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.title}</TableCell>
                <TableCell>{item.displayValue ?? '–'}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Section>
  );
}

/** Eine Kennzahl: Wert und Name groß, darunter das Urteil als Status. */
function Metric({ label, value, tone }: { label: string; value: string; tone: MetricTone }) {
  const cfg = tone === 'neutral' ? undefined : METRIC_TONE[tone];
  return (
    <AccentBox>
      <BigNumber>
        <Text>{value}</Text>
        <Text>{label}</Text>
      </BigNumber>
      {cfg && <AlertText status={cfg.status}>{t(cfg.label)}</AlertText>}
    </AccentBox>
  );
}

const LOADING_STAGES: DeKey[] = [
  'Verbinde mit PageSpeed Insights…',
  'Starte Lighthouse Runner…',
  'Messe Core Web Vitals…',
  'Analysiere Render-Pfad…',
  'Bereite Ergebnisse auf…',
];

function PageSpeedLoader() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setStage((s) => (s + 1) % LOADING_STAGES.length);
    }, 2500);
    return () => window.clearInterval(id);
  }, []);

  // Der Ladezustand wird angesagt, nicht nur gezeigt: bei „Bewegung
  // reduzieren“ steht der Spinner still. Angesagt wird genau einmal über
  // LoadingAnnouncement; die sichtbare Anzeige ist aria-hidden, sonst käme
  // jeder Stufenwechsel als neue Ansage. Kein aria-busy: auf einer
  // Live-Region heißt das „Ansagen zurückhalten, bis busy wieder false ist“ —
  // das wurde es nie, die Anzeige verschwand einfach.
  return (
    <>
      <LoadingAnnouncement>{t('PageSpeed-Analyse läuft…')}</LoadingAnnouncement>
      <IllustratedMessage aria-hidden="true">
        <LoadingSpinner size="l" />
        <Heading level={3}>{t('Analyse läuft')}</Heading>
        <Text>{t(LOADING_STAGES[stage])}</Text>
      </IllustratedMessage>
    </>
  );
}

function formatMs(value?: number): string {
  if (value === undefined) return '-';
  return value >= 1000 ? `${(value / 1000).toFixed(2)}s` : `${value}ms`;
}

function formatCls(value?: number): string {
  if (value === undefined) return '-';
  return value.toFixed(3);
}

/** Lighthouse: ab 90 gut, 50–89 verbesserungswürdig, darunter schlecht. */
function scoreTone(score: number): MetricTone {
  if (score >= 90) return 'good';
  if (score >= 50) return 'warn';
  return 'bad';
}

function lcpTone(value?: number): MetricTone {
  if (value === undefined) return 'neutral';
  if (value <= 2500) return 'good';
  if (value <= 4000) return 'warn';
  return 'bad';
}

function inpTone(value?: number): MetricTone {
  if (value === undefined) return 'neutral';
  if (value <= 200) return 'good';
  if (value <= 500) return 'warn';
  return 'bad';
}

function fcpTone(value?: number): MetricTone {
  if (value === undefined) return 'neutral';
  if (value <= 1800) return 'good';
  if (value <= 3000) return 'warn';
  return 'bad';
}

function ttfbTone(value?: number): MetricTone {
  if (value === undefined) return 'neutral';
  if (value <= 800) return 'good';
  if (value <= 1800) return 'warn';
  return 'bad';
}

function clsTone(value?: number): MetricTone {
  if (value === undefined) return 'neutral';
  if (value <= 0.1) return 'good';
  if (value <= 0.25) return 'warn';
  return 'bad';
}
