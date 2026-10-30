import type { ReactNode } from 'react';
import {
  Button,
  ColumnLayout,
  Content,
  CopyButton,
  Heading,
  IconDanger,
  IconLink,
  Label,
  LabeledValue,
  Link,
  LoadingSpinner,
  Modal,
  ModalTrigger,
  Section,
  Text,
} from '@mittwald/flow-react-components';
import type { IpDetails } from '@/types/dns';
import { EmptyState } from '@/components/ui/EmptyState';
import { formatIpOwnerLabel, useIpDetails } from './useIpDetails';
import { useI18n } from '@/i18n';
import { Hostname } from '@/components/ui/Hostname';
import { LookupLink } from '@/components/ui/LookupLink';
import { lookupPathFor } from '@/lib/lookupPath';
import styles from './IpAddressLink.module.css';

interface IpAddressLinkProps {
  ip: string;
  className?: string;
}

/**
 * Der PTR der IP (Reverse DNS), klein neben der Adresse — als Link auf den
 * Report des Namens (#147). Ohne PTR nichts: „nicht konfiguriert“ stünde
 * sonst in jeder Zeile, und das IP-Fenster sagt es ohnehin.
 *
 * Kostet keine eigene Abfrage: Die Details lädt IpOwnerLabel daneben schon,
 * useIpDetails teilt sie je IP.
 */
export function IpPtrLabel({ ip }: { ip: string }) {
  const { details } = useIpDetails(ip);
  const ptr = details ? ptrHostsOf(details)[0] : undefined;
  if (!ptr) return null;

  return (
    <Text className={styles.ptr}>
      <small>
        PTR <LookupLink value={ptr} />
      </small>
    </Text>
  );
}

/** Wem das Netz hinter der IP gehört — klein neben der Adresse. */
export function IpOwnerLabel({ ip, className }: { ip: string; className?: string }) {
  const { details, loading } = useIpDetails(ip);

  if (loading) {
    return (
      <Text className={className} aria-hidden="true">
        <small>…</small>
      </Text>
    );
  }

  const label = details ? formatIpOwnerLabel(details) : null;
  if (!label) return null;

  return (
    <Text className={className ? `${styles.owner} ${className}` : styles.owner}>
      <small>{label}</small>
    </Text>
  );
}

/**
 * Eine IP-Adresse, die ihre Details in einem Modal zeigt (Flows ModalTrigger).
 *
 * Ein Button, kein Link: er öffnet ein Overlay, statt zu navigieren. Fokus,
 * Schließen-Button, Escape, Klick daneben und das Sperren des Seiten-Scrollens
 * übernimmt Flow;
 * gerendert wird das Modal erst beim Öffnen — bei einer Domain mit einem
 * Dutzend A-Records liegen sonst ebenso viele Dialoge im DOM.
 */
export function IpAddressLink({ ip, className }: IpAddressLinkProps) {
  const { t } = useI18n();

  return (
    <ModalTrigger>
      <Button
        size="s"
        variant="plain"
        color="secondary"
        aria-label={t('Details zu {ip} anzeigen', { ip })}
        className={className ? `${styles.trigger} ${className}` : styles.trigger}
      >
        <Text className="mono">
          <Hostname value={ip} />
        </Text>
        <IconLink />
      </Button>
      <Modal size="m">
        <IpDetailsDialog ip={ip} />
      </Modal>
    </ModalTrigger>
  );
}

/** Inhalt des Modals — lädt die Details erst, wenn es offen ist. */
function IpDetailsDialog({ ip }: { ip: string }) {
  const { t } = useI18n();
  const { details, loading, error } = useIpDetails(ip);

  return (
    <>
      <Heading>
        <span className={`mono ${styles.ip}`}>{ip}</span>
        <CopyButton text={ip} aria-label={t('IP kopieren')} />
      </Heading>
      <Content>
        <Section>
          <Text>{t('IP-, Netzwerk- und Geolocation-Details')}</Text>
          {loading && (
            <div role="status" className={styles.loading}>
              <LoadingSpinner size="s" />
              <Text>{t('IP-Details werden geladen…')}</Text>
            </div>
          )}
          {error && !loading && (
            <EmptyState tone="danger" icon={<IconDanger />}>
              {error}
            </EmptyState>
          )}
          {details && !loading && !error && <IpDetailsRows details={details} />}
          {/* Eigene Adresse, eigener Eintrag im Verlauf, teilbar (#147). */}
          <Link href={lookupPathFor(ip)}>{t('Als eigene Suche öffnen')}</Link>
        </Section>
      </Content>
    </>
  );
}

/**
 * Die Details als Wertepaare (Flows LabeledValue), zweispaltig, wo Platz ist.
 * Fehlt ein Wert, steht dort „nicht verfügbar“ statt eines leeren Felds.
 */
export function IpDetailsRows({ details }: { details: IpDetails }) {
  const { t } = useI18n();
  const ptrHosts = ptrHostsOf(details);

  return (
    <>
      <ColumnLayout s={[1]} m={[1, 1]} l={[1, 1]} rowGap="m">
        <DetailRow label="IP" value={details.ip} mono />
        <DetailRow
          label="PTR (Reverse)"
          value={
            ptrHosts.length > 0 ? (
              <span className={styles.hosts}>
                {ptrHosts.map((host) => (
                  <span key={host} className="mono">
                    <LookupLink value={host} />
                  </span>
                ))}
              </span>
            ) : (
              t('nicht konfiguriert')
            )
          }
        />
        <DetailRow label={t('Organisation')} value={details.organization} />
        <DetailRow label="ISP" value={details.isp} />
        <DetailRow label="ASN" value={formatAsn(details)} mono />
        <DetailRow label={t('Netzwerk')} value={details.network} mono />
        <DetailRow label={t('Standort')} value={formatLocation(details)} />
        <DetailRow label={t('Koordinaten')} value={formatCoordinates(details)} />
        <DetailRow label={t('Zeitzone')} value={details.timezone} mono />
      </ColumnLayout>
      {details.source && (
        <Text className={styles.source}>
          <small>{details.source}</small>
        </Text>
      )}
    </>
  );
}

function DetailRow({ label, value, mono }: { label: string; value?: ReactNode; mono?: boolean }) {
  const { t } = useI18n();
  const missing = value === undefined || value === null || value === '';
  return (
    <LabeledValue>
      <Label>{label}</Label>
      <Text className={mono && !missing ? 'mono wrap-anywhere' : 'wrap-anywhere'}>
        {missing ? t('nicht verfügbar') : value}
      </Text>
    </LabeledValue>
  );
}

function formatAsn(details: IpDetails): string | undefined {
  if (!details.asn && !details.asnName) return undefined;
  return [details.asn, details.asnName].filter(Boolean).join('  ');
}

function formatLocation(details: IpDetails): string | undefined {
  return [details.country, details.region, details.city].filter(Boolean).join(', ') || undefined;
}

function formatCoordinates(details: IpDetails): string | undefined {
  if (details.latitude === undefined || details.longitude === undefined) return undefined;
  return `Latitude: ${details.latitude}, Longitude: ${details.longitude}`;
}

/** Die PTR-Namen der IP; fehlt die DNS-Antwort, der Reverse-Name des Geo-Dienstes. */
function ptrHostsOf(details: IpDetails): string[] {
  if (details.ptr && details.ptr.length > 0) return details.ptr;
  return details.reverse ? [details.reverse] : [];
}
