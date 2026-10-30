import type { ReactNode } from 'react';
import {
  AlertBadge,
  AlertText,
  Badge,
  ColumnLayout,
  Content,
  Flex,
  Heading,
  InlineCode,
  Label,
  LabeledValue,
  Section,
  Text,
} from '@mittwald/flow-react-components';
import type { DnssecInfo, SslInfo } from '@/types/dns';
import type { SectionSlice } from '@/hooks/useProgressiveLookup';
import { useI18n } from '@/i18n';
import { UncheckedBadge, UncheckedLine } from '@/components/ui/Unchecked';
import { CalendarButton } from '@/components/calendar/CalendarButton';

interface SecurityViewProps {
  /** Geprüfter Host — Betreff und Report-Link der Kalender-Erinnerung. */
  domain: string;
  ssl: SectionSlice<SslInfo | null>;
  /** false bei DNS-Einträgen wie `_dmarc.…` — dort gibt es keinen Host für TLS. */
  sslApplicable?: boolean;
  dnssec: SectionSlice<DnssecInfo>;
}

type Status = 'success' | 'warning' | 'danger';

const NO_DNSSEC: DnssecInfo = { enabled: false, valid: false, chainOfTrust: 'none' };

/*
 * „nicht prüfbar“ (#101): eine ausgefallene Sektion genauso wie ein Timeout
 * im Check — vorher stand dort „Kein TLS“ bzw. „nicht aktiviert“. `unchecked`
 * ist die Zeile, warum; ohne sie hat der Check ein Ergebnis.
 *
 * Tab-Inhalt in der LayoutCard des Reports: je Bereich eine Section, Flow
 * trennt die beiden mit einer Linie.
 */
export function SecurityView({ domain, ssl, sslApplicable = true, dnssec }: SecurityViewProps) {
  const { t } = useI18n();
  const dnssecInfo = dnssec.data ?? NO_DNSSEC;

  const sslUnchecked = (ssl.status === 'error' || ssl.lookupFailed) && (
    <UncheckedLine name="SSL" reason={ssl.lookupFailed} />
  );

  // Ein gefundener Schlüssel ist ein Ergebnis, auch wenn die zweite Abfrage
  // scheiterte.
  const dnssecFailed = !dnssecInfo.enabled && dnssecInfo.lookupFailed;
  const dnssecUnchecked = (dnssec.status === 'error' || dnssecFailed) && (
    <UncheckedLine name="DNSSEC" reason={dnssecFailed}>
      {/* Validierende Resolver weisen eine kaputte Signatur mit SERVFAIL ab. */}
      {dnssecFailed === 'servfail' &&
        t('Bleibt es bei SERVFAIL, steckt meist eine fehlerhafte Signatur dahinter.')}
    </UncheckedLine>
  );

  return (
    <>
      <SslSection
        domain={domain}
        ssl={ssl.data ?? undefined}
        applicable={sslApplicable}
        unchecked={sslUnchecked}
      />
      <DnssecSection dnssec={dnssecInfo} unchecked={dnssecUnchecked} />
    </>
  );
}

/* ─── SSL ─────────────────────────────────────────────────────────────── */

/** Dieselben Schwellen wie die SSL-Findings: < 14 Tage Warnung, abgelaufen kritisch. */
function expiryStatus(days: number): Status {
  if (days < 0) return 'danger';
  if (days < 14) return 'warning';
  return 'success';
}

/** So viele SANs stehen ausgeschrieben da, der Rest als Zahl. */
const SHOWN_SANS = 12;

function SslSection({
  domain,
  ssl,
  applicable,
  unchecked,
}: {
  domain: string;
  ssl?: SslInfo;
  applicable: boolean;
  unchecked?: ReactNode;
}) {
  const { t, formatDate } = useI18n();

  if (!applicable) {
    return (
      <Section>
        <Heading level={2}>SSL / TLS</Heading>
        <Text elementType="p">
          {t('Nicht anwendbar: Namen mit Unterstrich sind DNS-Einträge, keine Hosts — unter ihnen läuft kein Webserver mit Zertifikat.')}
        </Text>
      </Section>
    );
  }

  if (!ssl) {
    // Der zugehörige Befund (no-ssl) ist eine Warnung, kein kritischer Fehler.
    // Scheiterte nur der Check, ist nichts bewertet: neutral, „nicht prüfbar“.
    return (
      <Section>
        <Heading level={2}>
          SSL / TLS
          {unchecked && <UncheckedBadge />}
        </Heading>
        {unchecked || <AlertText status="warning">{t('Kein TLS auf Port 443 erreichbar')}</AlertText>}
      </Section>
    );
  }

  const validFrom = formatDate(ssl.validFrom);
  const validTo = formatDate(ssl.validTo);

  return (
    <Section>
      <Heading level={2}>
        SSL / TLS
        {ssl.valid ? (
          <AlertBadge status="success">{t('gültig')}</AlertBadge>
        ) : (
          <AlertBadge status="danger">{t('nicht vertrauenswürdig')}</AlertBadge>
        )}
      </Heading>

      <ColumnLayout>
        <LabeledValue>
          <Label>{t('Aussteller')}</Label>
          <Content>{ssl.issuer}</Content>
        </LabeledValue>
        <LabeledValue>
          <Label>Subject</Label>
          <InlineCode className="wrap-anywhere">{ssl.subject}</InlineCode>
        </LabeledValue>
        <LabeledValue>
          <Label>{t('Gültig')}</Label>
          <Content>
            <Flex wrap="wrap" align="center" columnGap="s" rowGap="xs">
              <Text>
                {validFrom} – {validTo}
              </Text>
              <AlertBadge status={expiryStatus(ssl.daysUntilExpiry)}>
                {ssl.daysUntilExpiry < 0
                  ? t('seit {count} Tagen abgelaufen', { count: Math.abs(ssl.daysUntilExpiry) })
                  : t('noch {count} Tage', { count: ssl.daysUntilExpiry })}
              </AlertBadge>
            </Flex>
          </Content>
        </LabeledValue>
        <LabeledValue>
          <Label>{t('Protokoll')}</Label>
          <Content>{`${ssl.tlsVersion} · ${ssl.signatureAlgorithm}`}</Content>
        </LabeledValue>
      </ColumnLayout>

      {/* Für ein abgelaufenes Zertifikat gibt es nichts mehr vorzumerken. */}
      {ssl.daysUntilExpiry >= 0 && (
        <div>
          <CalendarButton
            reminder={{
              kind: 'certificate',
              subject: domain,
              expiresAt: ssl.validTo,
              reportDomain: domain,
            }}
          />
        </div>
      )}

      {ssl.sans.length > 0 && (
        <>
          <Heading level={3}>SANs ({ssl.sans.length})</Heading>
          <Flex wrap="wrap" align="center" gap="xs">
            {ssl.sans.slice(0, SHOWN_SANS).map((san) => (
              <InlineCode key={san}>{san}</InlineCode>
            ))}
            {ssl.sans.length > SHOWN_SANS && (
              <Text>
                <small>+{ssl.sans.length - SHOWN_SANS}</small>
              </Text>
            )}
          </Flex>
        </>
      )}
    </Section>
  );
}

/* ─── DNSSEC ─────────────────────────────────────────────────────────── */

function DnssecSection({ dnssec, unchecked }: { dnssec: DnssecInfo; unchecked?: ReactNode }) {
  const { t } = useI18n();
  let statusText = t('inaktiv');
  let badge: ReactNode = <Badge color="neutral">{t('nicht aktiviert')}</Badge>;
  let body: ReactNode = (
    <Text elementType="p">
      {t('DNSSEC schützt deine Domain gegen DNS-Spoofing. Die meisten Registrare bieten DNSSEC mit einem Klick — beim Hosting-Panel nachsehen.')}
    </Text>
  );

  if (unchecked) {
    statusText = t('unbekannt');
    badge = <UncheckedBadge />;
    body = unchecked;
  } else if (dnssec.enabled && dnssec.valid && dnssec.chainOfTrust === 'valid') {
    statusText = t('aktiv & valide');
    badge = <AlertBadge status="success">{t('Chain of Trust valide')}</AlertBadge>;
    body = (
      <ColumnLayout>
        <LabeledValue>
          <Label>{t('Algorithmus')}</Label>
          {dnssec.algorithm ? <InlineCode>{dnssec.algorithm}</InlineCode> : <Content>{t('unbekannt')}</Content>}
        </LabeledValue>
        <LabeledValue>
          <Label>Status</Label>
          <Content>{t('DS- und DNSKEY-Records vorhanden, Signatur über Cloudflare und Google geprüft.')}</Content>
        </LabeledValue>
      </ColumnLayout>
    );
  } else if (dnssec.enabled && dnssec.chainOfTrust === 'incomplete') {
    statusText = t('Chain unterbrochen');
    badge = <AlertBadge status="danger">{t('Chain unterbrochen')}</AlertBadge>;
    body = (
      <Text elementType="p">
        {t('Die Domain hat einen DNSKEY, aber der Parent-DS-Record fehlt. Resolver können die Signatur nicht prüfen → DNSSEC ist effektiv aus. Beim Registrar den DS-Record nachtragen.')}
      </Text>
    );
  } else if (dnssec.enabled && dnssec.chainOfTrust === 'invalid') {
    statusText = 'invalid';
    badge = <AlertBadge status="danger">{t('Validierung fehlgeschlagen')}</AlertBadge>;
    body = (
      <Text elementType="p">
        {t('DS und DNSKEY sind da, aber die Chain validiert nicht. Möglicherweise abgelaufene Signaturen oder falsche Schlüssel.')}
      </Text>
    );
  }

  return (
    <Section>
      <Heading level={2}>
        {`DNSSEC · ${statusText}`}
        {badge}
      </Heading>
      {body}
    </Section>
  );
}
