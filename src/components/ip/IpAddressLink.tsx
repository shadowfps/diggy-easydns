import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  Building2,
  Clock,
  Compass,
  Copy,
  Globe2,
  Hash,
  Link2,
  Loader2,
  MapPin,
  Network,
  Server,
  Wifi,
  X,
} from 'lucide-react';
import { lookupIpDetails } from '@/lib/api';
import type { IpDetails } from '@/types/dns';
import { cn } from '@/lib/cn';

interface IpAddressLinkProps {
  ip: string;
  className?: string;
}

const detailsCache = new Map<string, IpDetails>();
const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const IPV6_PATTERN = /^[0-9a-f:]+$/i;

export function IpAddressLink({ ip, className }: IpAddressLinkProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          'group inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-md text-left font-mono text-xs transition-colors',
          'hover:text-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 dark:hover:text-white dark:focus-visible:outline-ink-50',
          className
        )}
        aria-label={`Details zu ${ip} anzeigen`}
        title={`Details zu ${ip}`}
      >
        <span className="truncate">{ip}</span>
        <Link2 className="h-3.5 w-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
      </button>

      {typeof document !== 'undefined' &&
        createPortal(
          <IpDetailsOverlay ip={ip} open={open} onClose={() => setOpen(false)} />,
          document.body
        )}
    </>
  );
}

export function isInspectableIp(value: string): boolean {
  const normalized = value.trim();
  if (IPV4_PATTERN.test(normalized)) return true;
  return normalized.includes(':') && IPV6_PATTERN.test(normalized);
}

function IpDetailsOverlay({
  ip,
  open,
  onClose,
}: {
  ip: string;
  open: boolean;
  onClose: () => void;
}) {
  const [details, setDetails] = useState<IpDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;

    const cached = detailsCache.get(ip);
    if (cached) {
      setDetails(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let stale = false;
    setLoading(true);
    setError(null);
    setDetails(null);

    lookupIpDetails(ip)
      .then((result) => {
        if (stale) return;
        detailsCache.set(ip, result);
        setDetails(result);
      })
      .catch((err) => {
        if (stale) return;
        setError(err instanceof Error ? err.message : 'IP-Details konnten nicht geladen werden.');
      })
      .finally(() => {
        if (!stale) setLoading(false);
      });

    return () => {
      stale = true;
    };
  }, [ip, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(ip);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      window.prompt('IP kopieren:', ip);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink-950/45 p-4 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="ip-details-title"
            className="surface w-full max-w-[540px] overflow-hidden rounded-xl p-5 shadow-2xl shadow-ink-950/25 dark:bg-[#151515] dark:border-white/10"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-5 flex items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h2
                    id="ip-details-title"
                    className="truncate font-mono text-lg font-semibold text-ink-900 dark:text-ink-50"
                  >
                    {ip}
                  </h2>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="rounded-md p-1 text-ink-900/45 transition-colors hover:text-ink-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 dark:text-ink-50/45 dark:hover:text-white dark:focus-visible:outline-ink-50"
                    aria-label={copied ? 'IP kopiert' : 'IP kopieren'}
                    title={copied ? 'IP kopiert' : 'IP kopieren'}
                  >
                    <Copy className="h-4 w-4" />
                  </button>
                </div>
                <p className="mt-1 text-sm text-ink-900/55 dark:text-ink-50/55">
                  IP-, Netzwerk- und Geolocation-Details
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full bg-ink-100 p-2 text-ink-900/65 transition-colors hover:text-ink-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 dark:bg-white/10 dark:text-ink-50/75 dark:hover:text-white dark:focus-visible:outline-ink-50"
                aria-label="Details schließen"
                title="Schließen"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {loading && (
              <div className="flex items-center gap-2 rounded-lg bg-ink-100 px-4 py-5 text-sm text-ink-900/60 dark:bg-white/[0.04] dark:text-ink-50/60">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>IP-Details werden geladen...</span>
              </div>
            )}

            {error && !loading && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 px-4 py-4 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {details && !loading && !error && <IpDetailsRows details={details} />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function IpDetailsRows({ details }: { details: IpDetails }) {
  return (
    <div className="space-y-2.5">
      <DetailRow icon={<Network className="h-4 w-4" />} label="IP" value={details.ip} mono />
      <DetailRow
        icon={<Server className="h-4 w-4" />}
        label="Reverse"
        value={details.reverse ?? <MissingValue>nicht konfiguriert</MissingValue>}
      />
      <DetailRow
        icon={<Building2 className="h-4 w-4" />}
        label="Organisation"
        value={details.organization ?? <MissingValue />}
      />
      <DetailRow icon={<Wifi className="h-4 w-4" />} label="ISP" value={details.isp ?? <MissingValue />} />
      <DetailRow
        icon={<Hash className="h-4 w-4" />}
        label="ASN"
        value={formatAsn(details) ?? <MissingValue />}
        mono={Boolean(details.asn)}
      />
      <DetailRow
        icon={<Globe2 className="h-4 w-4" />}
        label="Netzwerk"
        value={details.network ?? <MissingValue />}
        mono={Boolean(details.network)}
      />
      <DetailRow
        icon={<MapPin className="h-4 w-4" />}
        label="Standort"
        value={formatLocation(details) ?? <MissingValue />}
      />
      <DetailRow
        icon={<Compass className="h-4 w-4" />}
        label="Koordinaten"
        value={formatCoordinates(details) ?? <MissingValue />}
      />
      <DetailRow
        icon={<Clock className="h-4 w-4" />}
        label="Zeitzone"
        value={details.timezone ?? <MissingValue />}
        mono={Boolean(details.timezone)}
      />
      {details.source && (
        <div className="pt-1 text-right text-[10px] uppercase tracking-wider text-ink-900/35 dark:text-ink-50/30">
          {details.source}
        </div>
      )}
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: ReactNode;
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(104px,0.42fr)_1fr] items-start gap-3 rounded-lg bg-ink-100 px-4 py-3 text-sm dark:bg-white/[0.04]">
      <div className="flex min-w-0 items-center gap-2 text-ink-900/60 dark:text-ink-50/60">
        <span className="shrink-0 text-ink-900/45 dark:text-ink-50/45">{icon}</span>
        <span className="truncate">{label}</span>
      </div>
      <div
        className={cn(
          'min-w-0 text-right font-medium text-ink-900 dark:text-white',
          mono && 'font-mono text-xs'
        )}
      >
        <span className="break-words">{value}</span>
      </div>
    </div>
  );
}

function MissingValue({ children = 'nicht verfügbar' }: { children?: ReactNode }) {
  return <span className="font-normal italic text-ink-900/45 dark:text-ink-50/45">{children}</span>;
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
