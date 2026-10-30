import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  AccentBox,
  ActionGroup,
  Alert,
  AlertBadge,
  Badge,
  Combine,
  CopyButton,
  Heading,
  Label,
  LayoutCard,
  Link,
  Section,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Text,
  TextField,
} from '@mittwald/flow-react-components';
import { Field, Form, SubmitButton } from '@mittwald/flow-react-components/react-hook-form';
import { checkDomainAvailability } from '@/lib/api';
import type { DomainAvailabilityResult, DomainCheckReport } from '@/types/dns';
import { errorText, t, useI18n } from '@/i18n';
import type { DeKey } from '@/i18n/de';
import styles from './AvailabilityView.module.css';

const MITTWALD_HOSTING_URL = 'https://www.mittwald.de/webhosting';

interface Values {
  query: string;
}

/**
 * Domain noch frei? Flows Formular-Baustein — `Form` mit react-hook-form,
 * ein Feld, der Absende-Button; das Ergebnis darunter als Tabelle.
 */
export function AvailabilityView() {
  const [report, setReport] = useState<DomainCheckReport | null>(null);
  // Der Fehler selbst — übersetzt wird beim Rendern.
  const [error, setError] = useState<unknown>(null);
  const { tRich } = useI18n();
  // `Field` statt `typedField(form)`: die Fabrik erzeugte bei jedem Render
  // eine neue Komponente (react-hooks/static-components).
  const form = useForm<Values>({ defaultValues: { query: '' } });

  // Solange die Anfrage läuft, hält `Form` den Button im Ladezustand.
  const handleSubmit = async ({ query }: Values) => {
    setError(null);
    setReport(null);
    try {
      setReport(await checkDomainAvailability(query.trim()));
    } catch (err) {
      setError(err);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <Text className="eyebrow">{t('Available Check')}</Text>
        <Heading level={1}>Domain Generator</Heading>
        <Text elementType="p">
          {t('Finde die passende Domain für dein Projekt — mit Alternativen zu gängigen TLDs.')}
        </Text>
      </div>

      <LayoutCard>
        <Form form={form} onSubmit={handleSubmit}>
          <Section>
            <Field
              name="query"
              rules={{
                // `required` macht das Feld für Flow zum Pflichtfeld, `validate`
                // fängt eine Eingabe nur aus Leerzeichen.
                required: t('Bitte gib einen Namen oder eine Domain ein.'),
                validate: (value: string) =>
                  value.trim() !== '' || t('Bitte gib einen Namen oder eine Domain ein.'),
              }}
            >
              <TextField
                placeholder={t('meinprojekt oder meinprojekt.de')}
                autoComplete="off"
                spellCheck="false"
                inputMode="url"
                className="mono"
              >
                <Label>Domain</Label>
              </TextField>
            </Field>
            <ActionGroup>
              {/* Ohne Erfolgs-Haken: das Ergebnis steht gleich darunter. */}
              <SubmitButton color="primary" showFeedback={false}>
                {t('Prüfen')}
              </SubmitButton>
            </ActionGroup>
          </Section>
        </Form>

        {error != null && (
          <Section>
            <Alert status="danger">
              <Text>{errorText(error, 'Verfügbarkeits-Check fehlgeschlagen')}</Text>
            </Alert>
          </Section>
        )}

        {report && (
          <Section>
            <Heading level={2}>
              {tRich('{count} Vorschläge für {label}', {
                count: report.results.length,
                label: <span className="mono">{report.label}</span>,
              })}
            </Heading>
            <Table aria-label={t('{count} Vorschläge für {label}', { count: report.results.length, label: report.label })}>
              <TableHeader>
                <TableColumn>Domain</TableColumn>
                <TableColumn>Status</TableColumn>
              </TableHeader>
              <TableBody>
                {report.results.map((result, index) => (
                  <AvailabilityRow key={result.domain} result={result} highlight={index === 0} />
                ))}
              </TableBody>
            </Table>
            <MittwaldHostingHint />
          </Section>
        )}
      </LayoutCard>
    </div>
  );
}

/** Frei → success, vergeben → neutral, unklar → Warnung. Icon und Wort tragen den Status mit. */
const STATUS_CONFIG: Record<
  DomainAvailabilityResult['status'],
  { label: DeKey; status: 'success' | 'warning' | null }
> = {
  available: { label: 'Verfügbar', status: 'success' },
  taken: { label: 'Vergeben', status: null },
  unknown: { label: 'Unklar', status: 'warning' },
};

function AvailabilityRow({ result, highlight }: { result: DomainAvailabilityResult; highlight: boolean }) {
  const config = STATUS_CONFIG[result.status];
  useI18n();

  return (
    <TableRow>
      <TableCell>
        <Combine>
          <Text className="mono wrap-anywhere">{highlight ? <strong>{result.domain}</strong> : result.domain}</Text>
          <CopyButton text={result.domain} variant="plain" color="secondary" aria-label={t('Domain kopieren')} />
        </Combine>
      </TableCell>
      <TableCell>
        {config.status ? (
          <AlertBadge status={config.status}>{t(config.label)}</AlertBadge>
        ) : (
          <Badge color="neutral">{t(config.label)}</Badge>
        )}
      </TableCell>
    </TableRow>
  );
}

/** Ergänzend, nicht kritisch — deshalb eine AccentBox statt eines Alerts. */
function MittwaldHostingHint() {
  const { tRich } = useI18n();
  return (
    <AccentBox>
      <Text>
        {tRich(
          'Du suchst qualitatives Hosting für dein neues Projekt? Dann schau doch mal bei {mittwald} vorbei — Managed Webhosting aus Deutschland, gemacht für Agenturen und Freelancer.',
          {
            mittwald: (
              <Link href={MITTWALD_HOSTING_URL} target="_blank" rel="noopener noreferrer">
                Mittwald
              </Link>
            ),
          }
        )}
      </Text>
    </AccentBox>
  );
}
