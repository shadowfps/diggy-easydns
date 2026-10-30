import {
  Heading,
  IconDanger,
  LayoutCard,
  LoadingSpinner,
  Section,
  Text,
} from '@mittwald/flow-react-components';
import { IpDetailsRows } from '@/components/ip/IpAddressLink';
import { formatIpOwnerLabel, useIpDetails } from '@/components/ip/useIpDetails';
import { EmptyState } from '@/components/ui/EmptyState';
import { useI18n } from '@/i18n';
import styles from './IpResultView.module.css';

interface IpResultViewProps {
  ip: string;
}

/**
 * Vollständige Ergebnis-Ansicht für eine reine IP-Adresse.
 * Fokus liegt auf dem PTR-/Reverse-DNS-Record — dazu Geolocation, ASN & Netz.
 */
export function IpResultView({ ip }: IpResultViewProps) {
  const { details, loading, error } = useIpDetails(ip);
  const { t } = useI18n();
  const ptrHosts = details?.ptr && details.ptr.length > 0 ? details.ptr : details?.reverse ? [details.reverse] : [];
  const owner = details ? formatIpOwnerLabel(details) : null;

  return (
    <div key={ip} className={styles.page}>
      {/* Kopf wie beim DNS-Report: Überzeile, dann die Adresse selbst. */}
      <div className={styles.head}>
        <Text className="eyebrow">{t('IP-Lookup')}</Text>
        <Heading level={1} className={`mono ${styles.ip}`}>
          {ip}
        </Heading>
      </div>

      <LayoutCard>
        <Section>
          <Heading level={2}>PTR / Reverse DNS</Heading>
          {loading ? (
            <div role="status" className={styles.loading}>
              <LoadingSpinner size="s" />
              <Text>{t('Reverse-DNS wird ermittelt…')}</Text>
            </div>
          ) : ptrHosts.length > 0 ? (
            <div className={styles.hosts}>
              {ptrHosts.map((host) => (
                <Text key={host} className={`mono ${styles.host}`}>
                  <strong>{host}</strong>
                </Text>
              ))}
            </div>
          ) : (
            <Text>{t('Für diese IP ist kein PTR-Record konfiguriert.')}</Text>
          )}
          {owner && !loading && <Text>{owner}</Text>}
        </Section>

        <Section>
          <Heading level={2}>{t('IP-, Netzwerk- und Geolocation-Details')}</Heading>
          {/* Ohne role="status": derselbe Ladevorgang wie beim PTR oben, der
              ihn schon ansagt. Zwei Status hießen zwei Ansagen (#108). */}
          {loading && (
            <div className={styles.loading}>
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
        </Section>
      </LayoutCard>
    </div>
  );
}
