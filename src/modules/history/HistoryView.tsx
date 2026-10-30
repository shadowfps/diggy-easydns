import type { ReactNode } from 'react';
import {
  Action,
  ActionGroup,
  AlertBadge,
  Avatar,
  Button,
  ColumnLayout,
  Content,
  Heading,
  Icon,
  IconDelete,
  IconDomain,
  IconRefresh,
  Label,
  LabeledValue,
  LayoutCard,
  Modal,
  Text,
  typedList,
  useModalController,
} from '@mittwald/flow-react-components';
import { IconHistory } from '@tabler/icons-react';
import type { LookupHistoryEntry } from '@/lib/lookupHistory';
import { EmptyState } from '@/components/ui/EmptyState';
import { verdictFor } from '@/lib/scoring';
import { formatDate, t, useI18n } from '@/i18n';
import styles from './HistoryView.module.css';

interface HistoryViewProps {
  entries: LookupHistoryEntry[];
  onRun: (domain: string) => void;
  onUseDomain?: (domain: string) => void;
  onClear: () => void;
}

const HistoryList = typedList<LookupHistoryEntry>();

/**
 * Die letzten Suchen — Flows Template „Übersichtsseite“: Überschrift, eine
 * LayoutCard mit der List, je Lookup ein List-Item.
 *
 * Suche, Filter und Sortierung der List bleiben weg: es sind höchstens zehn
 * Einträge, neueste zuerst. Ohne `settingStorageKey` merkt sich die List
 * nichts — die History bleibt das Einzige, was diggy dafür speichert.
 */
export function HistoryView({ entries, onRun, onUseDomain, onClear }: HistoryViewProps) {
  useI18n();
  const confirmClear = useModalController();

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <Text className="eyebrow">History</Text>
        <Heading level={1}>{t('Letzte Suchanfragen')}</Heading>
      </div>

      <LayoutCard>
        <HistoryList.List
          aria-label={t('Letzte Suchanfragen')}
          getItemId={(entry) => `${entry.domain}-${entry.lookedUpAt}`}
          batchSize={20}
          hidePagination
          emptyView={
            <EmptyState icon={<HistoryIcon />} title={t('Noch keine History')}>
              {t('Erfolgreiche Domain-Lookups erscheinen hier automatisch.')}
            </EmptyState>
          }
        >
          <HistoryList.StaticData data={entries} />
          <ActionGroup>
            {/* Die leere List blendet ihre Aktionen selbst aus. */}
            <Button variant="soft" color="secondary" onPress={() => confirmClear.open()}>
              <IconDelete />
              <Text>{t('History löschen')}</Text>
            </Button>
          </ActionGroup>
          <HistoryList.Item textValue={(entry) => entry.domain}>
            {(entry) => <HistoryItem entry={entry} onRun={onRun} onUseDomain={onUseDomain} />}
          </HistoryList.Item>
        </HistoryList.List>
      </LayoutCard>

      {/* Löschen lässt sich nicht rückgängig machen — Flows Template
          „Bestätigen“: kurze Rückfrage mit den Folgen. */}
      <Modal controller={confirmClear}>
        <Heading>{t('History löschen')}</Heading>
        <Content>
          <Text>
            {t('Alle Einträge werden aus diesem Browser gelöscht. Das lässt sich nicht rückgängig machen.')}
          </Text>
        </Content>
        <ActionGroup>
          <Action closeModal>
            <Button color="danger" onPress={onClear}>
              {t('History löschen')}
            </Button>
            <Button variant="soft" color="secondary">
              {t('Abbrechen')}
            </Button>
          </Action>
        </ActionGroup>
      </Modal>
    </div>
  );
}

/** Tabler, weil Flows Bibliothek kein Verlaufs-Icon kennt. */
function HistoryIcon() {
  return (
    <Icon>
      <IconHistory />
    </Icon>
  );
}

function HistoryItem({
  entry,
  onRun,
  onUseDomain,
}: {
  entry: LookupHistoryEntry;
  onRun: (domain: string) => void;
  onUseDomain?: (domain: string) => void;
}) {
  return (
    <HistoryList.ItemView>
      <Avatar>
        <IconDomain />
      </Avatar>
      <Heading>
        <span className="mono">{entry.domain}</span>
        {/* Aus dem Score statt aus dem gespeicherten Wort: das steht auf
            Deutsch im Storage und ließe sich sonst nicht übersetzen. */}
        <AlertBadge status={scoreStatus(entry.score)}>
          {entry.score} · {t(verdictFor(entry.score))}
        </AlertBadge>
      </Heading>
      <Text>{formatRelativeTime(entry.lookedUpAt)}</Text>

      <Content>
        <ActionGroup>
          <Button variant="soft" color="secondary" size="s" onPress={() => onRun(entry.domain)}>
            <IconRefresh />
            <Text>{t('Scan erneut')}</Text>
          </Button>
        </ActionGroup>
      </Content>

      <Content slot="bottom">
        <div className={styles.details}>
          <ColumnLayout s={[1]} m={[1, 1, 1]} l={[1, 1, 1]} rowGap="m">
            <CoreValues label="IP" values={entry.ips} />
            <CoreValues label="MX" values={entry.mx} />
            <CoreValues label="NS" values={entry.nameservers} onUseValue={onUseDomain} />
          </ColumnLayout>
          <div className={styles.badges}>
            <StatusBadge ok={entry.sslValid}>{entry.sslValid ? sslLabel(entry) : t('SSL fehlt')}</StatusBadge>
            <StatusBadge ok={entry.dnssecValid}>
              {entry.dnssecValid ? t('DNSSEC aktiv') : t('DNSSEC inaktiv')}
            </StatusBadge>
            <StatusBadge ok={entry.dmarcPresent}>
              {entry.dmarcPresent ? t('DMARC gesetzt') : t('DMARC fehlt')}
            </StatusBadge>
          </div>
        </div>
      </Content>
    </HistoryList.ItemView>
  );
}

function CoreValues({
  label,
  values,
  onUseValue,
}: {
  label: string;
  values: string[];
  onUseValue?: (value: string) => void;
}) {
  return (
    <LabeledValue>
      <Label>{label}</Label>
      <Content>
        {values.length > 0 ? (
          <div className={styles.values}>
            {values.slice(0, 3).map((value) =>
              onUseValue ? (
                <Button
                  key={value}
                  variant="plain"
                  color="secondary"
                  size="s"
                  onPress={() => onUseValue(value)}
                  aria-label={t('{value} in die Suche übernehmen', { value })}
                  className={styles.valueButton}
                >
                  <Text className="mono wrap-anywhere">{value}</Text>
                </Button>
              ) : (
                <Text key={value} className="mono wrap-anywhere">
                  {value}
                </Text>
              )
            )}
            {values.length > 3 && (
              <Text>
                <small>{t('+{count} weitere', { count: values.length - 3 })}</small>
              </Text>
            )}
          </div>
        ) : (
          <Text>
            <small>{t('keine Daten')}</small>
          </Text>
        )}
      </Content>
    </LabeledValue>
  );
}

function StatusBadge({ ok, children }: { ok: boolean; children: ReactNode }) {
  return <AlertBadge status={ok ? 'success' : 'danger'}>{children}</AlertBadge>;
}

/** Dieselben Schwellen wie die ScoreCard: gut, Warnung, kritisch. */
function scoreStatus(score: number): 'success' | 'warning' | 'danger' {
  if (score >= 65) return 'success';
  if (score >= 40) return 'warning';
  return 'danger';
}

function sslLabel(entry: LookupHistoryEntry): string {
  if (entry.sslDaysUntilExpiry === undefined) return t('SSL gültig');
  return t('SSL {count} Tage', { count: entry.sslDaysUntilExpiry });
}

function formatRelativeTime(iso: string): string {
  const timestamp = new Date(iso).getTime();
  if (!Number.isFinite(timestamp)) return t('unbekannt');
  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));

  if (minutes < 1) return t('gerade eben');
  if (minutes < 60) return t('vor {count} min', { count: minutes });

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('vor {count} h', { count: hours });

  return formatDate(iso, { day: '2-digit', month: 'short', year: 'numeric' });
}
