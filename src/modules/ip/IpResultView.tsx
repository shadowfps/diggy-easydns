import { motion } from 'framer-motion';
import { AlertCircle, Loader2, Server } from 'lucide-react';
import { IpDetailsRows, formatIpOwnerLabel, useIpDetails } from '@/components/ip/IpAddressLink';

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
      <div className="mb-5 text-center">
        <span className="font-mono text-base text-ink-900/60 dark:text-ink-50/60">{ip}</span>
      </div>

      {/* PTR-Highlight */}
      <div className="surface mb-4 rounded-xl p-5">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-ink-900/45 dark:text-ink-50/45">
          <Server className="h-4 w-4" />
          <span>PTR / Reverse DNS</span>
        </div>
        {loading ? (
          <div className="mt-3 flex items-center gap-2 text-sm text-ink-900/60 dark:text-ink-50/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Reverse-DNS wird ermittelt…</span>
          </div>
        ) : ptrHosts.length > 0 ? (
          <div className="mt-2 flex flex-col gap-1">
            {ptrHosts.map((host) => (
              <span key={host} className="break-all font-mono text-lg font-semibold text-ink-900 dark:text-white">
                {host}
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-sm italic text-ink-900/45 dark:text-ink-50/45">
            Für diese IP ist kein PTR-Record konfiguriert.
          </p>
        )}
        {owner && !loading && (
          <p className="mt-2 text-sm text-ink-900/55 dark:text-ink-50/55">{owner}</p>
        )}
      </div>

      {/* Details */}
      {loading && (
        <div className="surface flex items-center gap-2 rounded-xl px-4 py-5 text-sm text-ink-900/60 dark:text-ink-50/60">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>IP-Details werden geladen…</span>
        </div>
      )}

      {error && !loading && (
        <div className="flex items-start gap-2 rounded-xl bg-red-500/10 px-4 py-4 text-sm text-red-600 dark:text-red-400">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {details && !loading && !error && (
        <div className="surface rounded-xl p-5">
          <IpDetailsRows details={details} />
        </div>
      )}
    </motion.div>
  );
}
