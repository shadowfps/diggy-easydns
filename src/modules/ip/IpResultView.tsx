import { motion } from 'motion/react';
import { AlertCircle, Loader2, Network, Server } from 'lucide-react';
import { IpDetailsRows } from '@/components/ip/IpAddressLink';
import { formatIpOwnerLabel, useIpDetails } from '@/components/ip/useIpDetails';
import { CardHeader } from '@/components/ui/CardHeader';
import { EmptyState } from '@/components/ui/EmptyState';

interface IpResultViewProps {
  ip: string;
}

/**
 * Vollständige Ergebnis-Ansicht für eine reine IP-Adresse.
 * Fokus liegt auf dem PTR-/Reverse-DNS-Record — dazu Geolocation, ASN & Netz.
 */
export function IpResultView({ ip }: IpResultViewProps) {
  const { details, loading, error } = useIpDetails(ip);
  const ptrHosts = details?.ptr && details.ptr.length > 0 ? details.ptr : details?.reverse ? [details.reverse] : [];
  const owner = details ? formatIpOwnerLabel(details) : null;

  return (
    <motion.div
      key={ip}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="mx-auto mt-6 w-full max-w-2xl md:mt-8"
    >
      {/* Kopf wie beim DNS-Report: Überzeile, dann die Adresse selbst. */}
      <div className="min-w-0">
        <p className="eyebrow">IP-Lookup</p>
        <h1 className="mt-1.5 break-all font-mono text-2xl font-semibold tracking-tight text-fg sm:text-3xl">
          {ip}
        </h1>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {/* PTR-Highlight */}
        <div className="card">
          <CardHeader icon={<Server className="size-4" />} title="PTR / Reverse DNS" />
          <div className="mt-4">
            {loading ? (
              <div role="status" className="flex items-center gap-2 text-sm text-fg-muted">
                <Loader2 className="size-4 animate-spin" />
                <span>Reverse-DNS wird ermittelt…</span>
              </div>
            ) : ptrHosts.length > 0 ? (
              <div className="flex flex-col gap-1">
                {ptrHosts.map((host) => (
                  <span key={host} className="break-all font-mono text-lg font-semibold text-fg">
                    {host}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-sm text-fg-subtle">Für diese IP ist kein PTR-Record konfiguriert.</p>
            )}
            {owner && !loading && <p className="mt-2 text-sm text-fg-muted">{owner}</p>}
          </div>
        </div>

        {/* Details */}
        {loading && (
          <div role="status" className="card flex items-center gap-2 text-sm text-fg-muted">
            <Loader2 className="size-4 animate-spin" />
            <span>IP-Details werden geladen…</span>
          </div>
        )}

        {error && !loading && (
          <EmptyState tone="danger" icon={<AlertCircle className="size-5" />}>
            {error}
          </EmptyState>
        )}

        {details && !loading && !error && (
          <div className="card">
            <CardHeader icon={<Network className="size-4" />} title="IP-, Netzwerk- und Geolocation-Details" />
            <div className="mt-4">
              <IpDetailsRows details={details} />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
