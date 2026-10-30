import type { ReactNode } from 'react';
import {
  AlertBadge,
  Button,
  DonutChart,
  Flex,
  Heading,
  IconChevronRight,
  IconDanger,
  IconInfo,
  IconSuccess,
  IconUnavailable,
  IconWarning,
  Label,
  LabeledValue,
  LayoutCard,
  Section,
  Separator,
  Text,
} from '@mittwald/flow-react-components';
import type { Finding, HealthScore } from '@/types/dns';
import type { SectionKey } from '@/hooks/useProgressiveLookup';
import { verdictFor } from '@/lib/scoring';
import { findingText, useI18n } from '@/i18n';
import type { DeKey } from '@/i18n/de';
import styles from './ScoreCard.module.css';

interface ScoreCardProps {
  score: HealthScore;
  findings: Finding[];
  /** Sektionen, deren Abfrage ganz ausfiel — ihre Findings fehlen im Score. */
  failed?: readonly SectionKey[];
  onShowFindings: () => void;
}

type Status = 'success' | 'warning' | 'danger';

const PRIORITY: Finding['severity'][] = ['critical', 'warning', 'info'];

function mostSevere(findings: Finding[]): Finding | undefined {
  return PRIORITY.map((severity) => findings.find((f) => f.severity === severity)).find(Boolean);
}

/** Gut, Warnung, kritisch — dieselben Stufen wie die Findings. */
function scoreStatus(s: number): Status {
  if (s >= 65) return 'success';
  if (s >= 40) return 'warning';
  return 'danger';
}

/**
 * Der Health Score: ein Ring (Flows DonutChart) mit der Zahl, das Urteil als
 * AlertBadge in der Überschrift, die Zählung der Befunde und der wichtigste
 * offene Punkt.
 *
 * Die Zahl steht vom ersten Render an auf dem Endwert. Das frühere Hochzählen
 * entfällt mit Flow — damit auch die Sonderbehandlung bei „Bewegung
 * reduzieren“ (#103): den Ring animiert Flow selbst und hält ihn bei der
 * Einstellung an.
 */
export function ScoreCard({ score, findings, failed = [], onShowFindings }: ScoreCardProps) {
  const { t, tRich } = useI18n();
  const status = scoreStatus(score.score);
  // „Nicht prüfbar“ zieht nichts ab (#101). Ohne diesen Hinweis sähe ein
  // Score, dem ganze Checks fehlen, aus wie ein vollständiger — und wer
  // Abfragen ins Leere laufen lässt, käme so zu einem besseren. Der
  // Tech-Stack liefert keine Findings; fällt er aus, fehlt dem Score nichts.
  const unchecked =
    findings.filter((f) => f.unchecked).length + failed.filter((key) => key !== 'techStack').length;
  // Reine Empfehlungen (`advisory`, etwa BIMI) erst, wenn sonst nichts offen ist.
  const top = mostSevere(findings.filter((f) => !f.advisory)) ?? mostSevere(findings);

  return (
    <LayoutCard>
      <Section>
        <Heading level={2}>
          Health Score
          <AlertBadge status={status}>{t(verdictFor(score.score))}</AlertBadge>
        </Heading>

        <div className={styles.overview}>
          <DonutChart
            value={score.score}
            maxValue={100}
            status={status}
            size="l"
            formatOptions={{ style: 'decimal' }}
            aria-label="Health Score"
          >
            <strong className={styles.value}>{score.score}</strong>
            <small>/ 100</small>
          </DonutChart>

          <div className={styles.stats}>
            <Stat label="ok" count={score.counts.success} icon={<IconSuccess color="success" size="s" />} />
            <Stat label="info" count={score.counts.info} icon={<IconInfo color="info" size="s" />} />
            <Stat label="Warnungen" count={score.counts.warning} icon={<IconWarning color="warning" size="s" />} />
            <Stat label="kritisch" count={score.counts.critical} icon={<IconDanger color="danger" size="s" />} />
          </div>
        </div>

        {unchecked > 0 && (
          <Text elementType="p" className={styles.unchecked}>
            <IconUnavailable color="unavailable" size="s" />
            <small>
              {tRich('{label} {count} Checks nicht prüfbar', {
                label: <strong>{t('Unvollständig:')}</strong>,
                count: unchecked,
              })}
            </small>
          </Text>
        )}

        <Separator />

        {/* Der nächste Schritt: der schwerste offene Punkt, ein Klick zu allen. */}
        <Flex align="center" justify="space-between" gap="m">
          <TopFinding finding={top} />
          <Button size="s" variant="plain" color="secondary" onPress={onShowFindings}>
            <Text>{t('Alle Findings')}</Text>
            <IconChevronRight />
          </Button>
        </Flex>
      </Section>
    </LayoutCard>
  );
}

const TOP_ICON = {
  critical: <IconDanger color="danger" />,
  warning: <IconWarning color="warning" />,
  info: <IconInfo color="info" />,
} as const;

function TopFinding({ finding }: { finding?: Finding }) {
  const { t } = useI18n();
  if (!finding) {
    return (
      <div className={styles.top}>
        <IconSuccess color="success" />
        <Text>
          <strong>{t('Keine offenen Punkte')}</strong>
        </Text>
      </div>
    );
  }
  return (
    <div className={styles.top}>
      {TOP_ICON[finding.severity as keyof typeof TOP_ICON]}
      <LabeledValue>
        <Label>{t('Wichtigster Punkt')}</Label>
        <Text className={styles.topTitle}>{findingText(finding).title}</Text>
      </LabeledValue>
    </div>
  );
}

/**
 * `label` ist ein Schlüssel: „3 Warnungen“ braucht die Mehrzahl, das
 * Englische auch dort („3 warnings“). „ok“ und „info“ heißen in beiden
 * Sprachen gleich und brauchen keinen Eintrag.
 */
function Stat({ label, count, icon }: { label: DeKey | 'ok' | 'info'; count: number; icon: ReactNode }) {
  const { t } = useI18n();
  return (
    <Text className={styles.stat}>
      {icon}
      <small>
        <strong>{count}</strong> {label === 'ok' || label === 'info' ? label : t(label, { count })}
      </small>
    </Text>
  );
}
