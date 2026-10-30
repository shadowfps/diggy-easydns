import {
  AlertBadge,
  Badge,
  Combine,
  CopyButton,
  Heading,
  InlineCode,
  Section,
  Text,
} from '@mittwald/flow-react-components';
import type { Finding, Severity } from '@/types/dns';
import { findingText, useI18n } from '@/i18n';
import type { DeKey } from '@/i18n/de';

interface FindingsListProps {
  findings: Finding[];
}

type Status = 'danger' | 'warning' | 'info' | 'success';

const SEVERITY_CONFIG: Record<Severity, { label: DeKey; status: Status }> = {
  critical: { label: 'Kritisch', status: 'danger' },
  warning: { label: 'Warnung', status: 'warning' },
  info: { label: 'Hinweis', status: 'info' },
  success: { label: 'OK', status: 'success' },
};

// Fachbegriffe — in beiden Sprachen gleich.
const CATEGORY_LABEL: Record<string, string> = {
  dns: 'DNS',
  dnssec: 'DNSSEC',
  mail: 'Mail',
  security: 'Security',
  ssl: 'SSL',
  performance: 'Performance',
};

const SEVERITY_ORDER: Severity[] = ['critical', 'warning', 'info', 'success'];

/**
 * Alle Befunde, der schwerste zuerst. Je Finding eine Section — Flow trennt
 * sie mit einer Linie, die Liste liest sich als ein Befund, nicht als acht
 * lose Kästen.
 */
export function FindingsList({ findings }: FindingsListProps) {
  const sorted = [...findings].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity)
  );

  return (
    <>
      {sorted.map((finding) => (
        <FindingSection key={finding.id} finding={finding} />
      ))}
    </>
  );
}

function FindingSection({ finding }: { finding: Finding }) {
  const cfg = SEVERITY_CONFIG[finding.severity];
  const { t } = useI18n();
  const text = findingText(finding);

  return (
    <Section>
      <Heading level={2}>
        {text.title}
        <AlertBadge status={cfg.status}>{t(cfg.label)}</AlertBadge>
      </Heading>
      <Text>
        <small>
          <Badge color="neutral">{CATEGORY_LABEL[finding.category] ?? finding.category}</Badge>
          {/* Ein „Hinweis“ kostet sonst Punkte — hier sieht man, warum der
              Score trotzdem bleibt. */}
          {finding.advisory && <> · {t('ohne Punktabzug')}</>}
        </small>
      </Text>
      <Text elementType="p">{text.description}</Text>

      {finding.fix && text.fixExplanation && <Text elementType="p">{text.fixExplanation}</Text>}
      {finding.fix?.snippet && (
        // Der Wert zum Eintragen, mit Kopieren direkt daneben — immer
        // sichtbar, also per Touch und Tastatur erreichbar.
        <Combine>
          <InlineCode whiteSpace="pre-wrap" className="wrap-anywhere">
            {finding.fix.snippet}
          </InlineCode>
          <CopyButton text={finding.fix.snippet} variant="soft" color="secondary" aria-label={t('Snippet kopieren')} />
        </Combine>
      )}
    </Section>
  );
}
