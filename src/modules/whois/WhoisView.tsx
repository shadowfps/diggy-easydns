import { useState } from 'react';
import {
  AlertBadge,
  AlertText,
  Badge,
  Button,
  ColumnLayout,
  Content,
  Flex,
  Heading,
  IconUnavailable,
  InlineCode,
  Label,
  LabeledValue,
  Link,
  Section,
  Text,
  Tooltip,
  TooltipTrigger,
} from '@mittwald/flow-react-components';
import type { WhoisInfo } from '@/types/dns';
import { registryWebLookup, type RegistryWebLookup } from '@shared/registryWebLookup';
import { EmptyState } from '@/components/ui/EmptyState';
import { t, useI18n } from '@/i18n';
import type { DeKey } from '@/i18n/de';
import { CalendarButton } from '@/components/calendar/CalendarButton';

interface WhoisViewProps {
  /** Domain des Reports — Ziel des Links in der Kalender-Erinnerung. */
  domain: string;
  whois?: WhoisInfo;
  onUseDomain?: (domain: string) => void;
}

type Tone = 'ok' | 'warn' | 'bad';

/** EPP-Status-Codes übersetzt für Laien — kurz & verständlich. */
const STATUS_LABELS: Record<string, { label: DeKey; tone: Tone }> = {
  clienttransferprohibited: { label: 'Transfer-Sperre (Client)', tone: 'ok' },
  servertransferprohibited: { label: 'Transfer-Sperre (Registry)', tone: 'ok' },
  clientdeleteprohibited: { label: 'Lösch-Sperre (Client)', tone: 'ok' },
  serverdeleteprohibited: { label: 'Lösch-Sperre (Registry)', tone: 'ok' },
  clientupdateprohibited: { label: 'Update-Sperre (Client)', tone: 'ok' },
  serverupdateprohibited: { label: 'Update-Sperre (Registry)', tone: 'ok' },
  clientrenewprohibited: { label: 'Renewal-Sperre (Client)', tone: 'warn' },
  ok: { label: 'OK', tone: 'ok' },
  active: { label: 'Aktiv', tone: 'ok' },
  inactive: { label: 'Inaktiv', tone: 'warn' },
  pendingcreate: { label: 'Erstellung läuft', tone: 'warn' },
  pendingrenew: { label: 'Renewal läuft', tone: 'warn' },
  pendingupdate: { label: 'Update läuft', tone: 'warn' },
  pendingtransfer: { label: 'Transfer läuft', tone: 'warn' },
  pendingdelete: { label: 'Löschung läuft', tone: 'bad' },
  pendingrestore: { label: 'Restore läuft', tone: 'bad' },
  redemptionperiod: { label: 'Redemption Period', tone: 'bad' },
  clienthold: { label: 'Client-Hold (nicht aufgelöst!)', tone: 'bad' },
  serverhold: { label: 'Server-Hold (nicht aufgelöst!)', tone: 'bad' },
};

/** Warum diggy die Registry nicht fragt — je Grund aus shared/registryWebLookup.ts. */
const WEB_LOOKUP_TEXT: Record<RegistryWebLookup['reason'], DeKey> = {
  blocked: 'Die Registry von .{tld} sperrt automatische Abfragen. Die Daten zeigt ihre {link}.',
  permission: 'Die Registry von .{tld} erlaubt die Weitergabe ihrer WHOIS-Daten nur mit Genehmigung. Die Daten zeigt ihre {link}.',
};

const STATUS_ALERT: Record<Tone, 'success' | 'warning' | 'danger'> = {
  ok: 'success',
  warn: 'warning',
  bad: 'danger',
};

/**
 * WHOIS/RDAP als Tab-Inhalt: Registrierung, Domain-Status und Nameserver je
 * eine Section — Flow trennt sie mit einer Linie.
 */
export function WhoisView({ domain, whois, onUseDomain }: WhoisViewProps) {
  /**
   * Bezugszeitpunkt einmal beim Mount festhalten.
   *
   * `Date.now()` stand vorher direkt in den beiden Rechnungen weiter unten und
   * lief damit bei jedem Render neu. Die Werte hingen also daran, wann die
   * Komponente zufällig neu rendert — genau das beanstandet react-hooks/purity.
   * Beide Angaben sind auf Tage gerundet, ein fester Zeitpunkt pro Mount reicht.
   *
   * Steht bewusst VOR dem frühen Return: Hooks müssen in jedem Render laufen.
   */
  const [now] = useState(() => Date.now());
  const { tRich, formatDate } = useI18n();

  if (!whois) {
    // .ch, .at, .it: Der Server fragt gar nicht erst (#105) — .ch sperrt
    // automatisierte Abfragen, nic.at und Registro .it erlauben die
    // Weitergabe ihrer Daten nur mit Genehmigung. Der Satz allein ließe
    // offen, wo es die Daten gibt.
    const webLookup = registryWebLookup(domain);
    return (
      <EmptyState icon={<IconUnavailable />} title={t('WHOIS / RDAP nicht verfügbar')}>
        {webLookup
          ? tRich(WEB_LOOKUP_TEXT[webLookup.reason], {
              tld: webLookup.tld,
              link: (
                <Link href={webLookup.url} target="_blank" rel="noopener noreferrer">
                  {t('Web-Abfrage')}
                </Link>
              ),
            })
          : t('Diese TLD unterstützt kein RDAP, oder der Lookup ist fehlgeschlagen.')}
      </EmptyState>
    );
  }

  const expiresInDays = whois.expiresAt
    ? Math.floor((new Date(whois.expiresAt).getTime() - now) / (1000 * 60 * 60 * 24))
    : undefined;
  const ageDays = whois.createdAt
    ? Math.floor((now - new Date(whois.createdAt).getTime()) / (1000 * 60 * 60 * 24))
    : undefined;

  // Dieselben Schwellen wie die WHOIS-Findings: unter 7 Tagen (oder schon
  // abgelaufen) kritisch, unter 30 Tagen eine Warnung.
  const expiryStatus =
    expiresInDays === undefined
      ? undefined
      : expiresInDays < 7
      ? 'danger'
      : expiresInDays < 30
      ? 'warning'
      : 'success';

  return (
    <>
      {/* Registrar + Daten */}
      <Section>
        <Heading level={2}>
          {t('Registrierung')}
          {/* Woher die Daten kommen (RDAP-Server oder WHOIS-Host) — Metadaten. */}
          {whois.source && (
            <Badge color="neutral" className="mono">
              {whois.source}
            </Badge>
          )}
        </Heading>

        <ColumnLayout s={[1]} m={[1, 1]} l={[1, 1]}>
          <LabeledValue>
            <Label>Registrar</Label>
            <Content>{whois.registrar ?? '—'}</Content>
          </LabeledValue>
          <LabeledValue>
            <Label>{t('Erstellt')}</Label>
            <Content>
              {whois.createdAt ? (
                <>
                  {formatDate(whois.createdAt, DATE_FORMAT)}
                  {ageDays !== undefined && (
                    <Text>
                      {' '}
                      <small>({formatAge(ageDays)})</small>
                    </Text>
                  )}
                </>
              ) : (
                '—'
              )}
            </Content>
          </LabeledValue>
          <LabeledValue>
            <Label>{t('Läuft ab')}</Label>
            <Content>
              {whois.expiresAt ? (
                <Flex wrap="wrap" align="center" columnGap="s" rowGap="xs">
                  <Text>{formatDate(whois.expiresAt, DATE_FORMAT)}</Text>
                  {expiresInDays !== undefined && expiryStatus && (
                    <AlertBadge status={expiryStatus}>
                      {expiresInDays < 0
                        ? t('vor {count} Tagen', { count: Math.abs(expiresInDays) })
                        : t('noch {count} Tage', { count: expiresInDays })}
                    </AlertBadge>
                  )}
                </Flex>
              ) : (
                '—'
              )}
            </Content>
          </LabeledValue>
          <LabeledValue>
            <Label>{t('Geändert')}</Label>
            <Content>{whois.updatedAt ? formatDate(whois.updatedAt, DATE_FORMAT) : '—'}</Content>
          </LabeledValue>
        </ColumnLayout>

        {/* Nur mit bekanntem Ablauf, der noch bevorsteht — eine bereits
            abgelaufene Domain braucht keine Erinnerung mehr, sondern Handeln. */}
        {whois.expiresAt && expiresInDays !== undefined && expiresInDays >= 0 && (
          <div>
            <CalendarButton
              reminder={{
                kind: 'domain',
                // Liefert der Server die abgefragte Domain nicht mit (älterer
                // Stand), ist der Report-Name die beste verfügbare Angabe.
                subject: whois.domain ?? domain,
                expiresAt: whois.expiresAt,
                reportDomain: domain,
              }}
            />
          </div>
        )}
      </Section>

      {/* Status + DNSSEC */}
      <Section>
        <Heading level={2}>{t('Domain-Status')}</Heading>

        {whois.status && whois.status.length > 0 ? (
          <Flex wrap="wrap" gap="xs">
            {whois.status.map((s) => {
              const norm = s.toLowerCase().replace(/\s+/g, '');
              // Unbekannte Codes erscheinen roh — so, wie die Registry sie meldet.
              const meta = STATUS_LABELS[norm];
              return (
                <AlertBadge key={s} status={STATUS_ALERT[meta?.tone ?? 'ok']}>
                  {meta ? t(meta.label) : s}
                </AlertBadge>
              );
            })}
          </Flex>
        ) : (
          <Text>{t('Keine Status-Codes.')}</Text>
        )}

        {/* Ohne Angabe der Registry (.eu über WHOIS, #105) wäre „nicht
            delegiert“ eine Behauptung, die niemand gemacht hat. */}
        <Text elementType="p">
          {tRich('DNSSEC bei Registry: {status}', {
            status: whois.dnssecDelegated ? (
              <AlertText status="success">{t('delegiert')}</AlertText>
            ) : (
              <strong>{whois.dnssecDelegated === false ? t('nicht delegiert') : t('keine Angabe')}</strong>
            ),
          })}
        </Text>
      </Section>

      {/* Nameserver aus WHOIS */}
      <Section>
        <Heading level={2}>{t('Nameserver (laut Registry)')}</Heading>

        {whois.nameServers && whois.nameServers.length > 0 ? (
          onUseDomain ? (
            // Ein Button je Nameserver übernimmt den Namen in die Suche; ohne
            // diese Aktion eine schlichte Liste — ein nicht klickbarer Button
            // sähe bedienbar aus.
            <Flex wrap="wrap" gap="s">
              {whois.nameServers.map((ns) => (
                <TooltipTrigger key={ns} delay="long">
                  <Button size="s" variant="soft" color="secondary" onPress={() => onUseDomain(ns)}>
                    <Text className="mono">{ns}</Text>
                  </Button>
                  <Tooltip>{t('{value} in die Suche übernehmen', { value: ns })}</Tooltip>
                </TooltipTrigger>
              ))}
            </Flex>
          ) : (
            <Text>
              <ul>
                {whois.nameServers.map((ns) => (
                  <li key={ns}>
                    <InlineCode>{ns}</InlineCode>
                  </li>
                ))}
              </ul>
            </Text>
          )
        ) : (
          <Text>{t('Keine Nameserver gemeldet.')}</Text>
        )}
      </Section>
    </>
  );
}

/* ─── Bausteine ──────────────────────────────────────────────────────── */

const DATE_FORMAT: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };

function formatAge(days: number): string {
  if (days < 60) return t('{count} Tage', { count: days });
  const months = Math.floor(days / 30);
  if (months < 24) return t('{count} Monate', { count: months });
  const years = Math.floor(days / 365);
  const remainingMonths = Math.floor((days % 365) / 30);
  if (remainingMonths === 0) return t('{count} Jahre', { count: years });
  return `${t('{count} Jahre', { count: years })}, ${t('{count} Monate', { count: remainingMonths })}`;
}
