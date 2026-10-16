import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  Building2,
  Check,
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
import type { IpDetails } from '@/types/dns';
import { cn } from '@/lib/cn';
import { CardHeader } from '@/components/ui/CardHeader';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { formatIpOwnerLabel, useIpDetails } from './useIpDetails';
import { t, useI18n } from '@/i18n';

interface IpAddressLinkProps {
  ip: string;
  className?: string;
}

export function IpOwnerLabel({ ip, className }: { ip: string; className?: string }) {
  const { details, loading } = useIpDetails(ip);

  if (loading) {
    return (
      <span className={cn('text-xs text-fg-subtle', className)} aria-hidden>
        …
      </span>
    );
  }

  const label = details ? formatIpOwnerLabel(details) : null;
  if (!label) return null;

  return (
    <span
      className={cn('min-w-0 truncate font-sans text-sm text-fg-subtle', className)}
      title={label}
    >
      {label}
    </span>
  );
}

export function IpAddressLink({ ip, className }: IpAddressLinkProps) {
  const [open, setOpen] = useState(false);
  /*
   * Hält das Portal noch, bis die Exit-Animation durch ist.
   *
   * Ein rein an `open` gekoppeltes Portal unmountet sofort beim Schließen, und
   * damit lief die AnimatePresence-Exit-Animation nie — der Dialog verschwand
   * hart. Ein reines `open`-Rendering war aber nötig, weil sonst für jede
   * angezeigte IP ein leeres Portal in document.body lag.
   */
  const [mounted, setMounted] = useState(false);

  const handleOpen = () => {
    setMounted(true);
    setOpen(true);
  };
  useI18n();

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          'group inline-flex max-w-full min-w-0 items-center gap-1.5 text-left font-mono text-[13px] underline-offset-4 transition-colors hover:text-fg hover:underline',
          className
        )}
        aria-label={t('Details zu {ip} anzeigen', { ip })}
        title={t('Details zu {ip}', { ip })}
      >
        <span className="truncate">{ip}</span>
        <Link2 className="size-3.5 shrink-0 opacity-60 transition-opacity group-hover:opacity-100" />
      </button>

      {/*
        Portal nur bei offenem Dialog. Vorher wurde es für JEDE angezeigte IP
        erzeugt — bei einer Domain mit einem Dutzend A-Records lagen ebenso
        viele leere Portale in document.body, jedes mit eigenen Effects.
      */}
      {mounted &&
        typeof document !== 'undefined' &&
        createPortal(
          <IpDetailsOverlay
            ip={ip}
            open={open}
            onClose={() => setOpen(false)}
            onExited={() => setMounted(false)}
          />,
          document.body
        )}
    </>
  );
}

function IpDetailsOverlay({
  ip,
  open,
  onClose,
  onExited,
}: {
  ip: string;
  open: boolean;
  onClose: () => void;
  /** Feuert, wenn die Exit-Animation durch ist — dann darf das Portal weg. */
  onExited: () => void;
}) {
  /*
   * Derselbe Hook wie im IpOwnerLabel.
   *
   * Hier stand eine handkopierte Fassung davon: Cache-Treffer, Fetch,
   * stale-Guard — dieselben dreißig Zeilen und dieselbe setState-Kaskade im
   * Effect. Der Hook deckt das seit dem Umbau vollständig ab; sein `enabled`
   * ist genau das `open` von hier, und weil sein Ergebnis an die IP gebunden
   * ist, entfällt auch das frühere `setDetails(null)` beim Wechsel.
   */
  const { details, loading, error } = useIpDetails(ip, open);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useI18n();

  useFocusTrap(dialogRef, open);

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
      window.prompt(t('IP kopieren:'), ip);
    }
  };

  return (
    <AnimatePresence onExitComplete={onExited}>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-xs"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ip-details-title"
            className="overlay max-h-full w-full max-w-[540px] overflow-y-auto p-5 sm:p-6"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.18 }}
            onClick={(event) => event.stopPropagation()}
          >
            {/* Kopieren steht vor Schließen: so landet der erste Fokus wie
                bisher auf „IP kopieren“. */}
            <CardHeader
              icon={<Network className="size-4" />}
              title={
                <span id="ip-details-title" className="min-w-0 break-all font-mono">
                  {ip}
                </span>
              }
              subtitle={t('IP-, Netzwerk- und Geolocation-Details')}
              aside={
                <div className="-mt-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="btn btn-secondary btn-sm"
                    aria-label={copied ? t('IP kopiert') : t('IP kopieren')}
                    title={copied ? t('IP kopiert') : t('IP kopieren')}
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    <span className="hidden sm:inline">
                      {copied ? t('IP kopiert') : t('IP kopieren')}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={onClose}
                    className="btn btn-ghost btn-sm btn-icon"
                    aria-label={t('Details schließen')}
                    title={t('Schließen')}
                  >
                    <X className="size-4" />
                  </button>
                </div>
              }
            />

            <div className="mt-4">
              {loading && (
                <div className="panel flex items-center gap-2 text-sm text-fg-muted">
                  <Loader2 className="size-4 animate-spin" />
                  <span>{t('IP-Details werden geladen…')}</span>
                </div>
              )}

              {error && !loading && (
                <div className="panel flex items-center gap-3">
                  <span className="icon-tile icon-tile-danger">
                    <AlertCircle className="size-4" />
                  </span>
                  <span className="text-sm text-fg">{error}</span>
                </div>
              )}

              {details && !loading && !error && <IpDetailsRows details={details} />}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export function IpDetailsRows({ details }: { details: IpDetails }) {
  const ptrHosts = details.ptr && details.ptr.length > 0 ? details.ptr : details.reverse ? [details.reverse] : [];

  // Label/Wert-Raster: Labels links in einer festen Spalte, Werte bündig
  // daneben. Auf schmalen Bildschirmen steht der Wert unter seinem Label.
  return (
    <div>
      <dl className="space-y-3">
        <DetailRow icon={<Network className="size-3.5" />} label="IP" value={details.ip} mono />
        <DetailRow
          icon={<Server className="size-3.5" />}
          label="PTR (Reverse)"
          value={
            ptrHosts.length > 0 ? (
              <span className="flex flex-col gap-0.5 font-mono text-[13px]">
                {ptrHosts.map((host) => (
                  <span key={host} className="break-all">
                    {host}
                  </span>
                ))}
              </span>
            ) : (
              <MissingValue>{t('nicht konfiguriert')}</MissingValue>
            )
          }
        />
        <DetailRow
          icon={<Building2 className="size-3.5" />}
          label={t('Organisation')}
          value={details.organization ?? <MissingValue />}
        />
        <DetailRow icon={<Wifi className="size-3.5" />} label="ISP" value={details.isp ?? <MissingValue />} />
        <DetailRow
          icon={<Hash className="size-3.5" />}
          label="ASN"
          value={formatAsn(details) ?? <MissingValue />}
          mono={Boolean(details.asn)}
        />
        <DetailRow
          icon={<Globe2 className="size-3.5" />}
          label={t('Netzwerk')}
          value={details.network ?? <MissingValue />}
          mono={Boolean(details.network)}
        />
        <DetailRow
          icon={<MapPin className="size-3.5" />}
          label={t('Standort')}
          value={formatLocation(details) ?? <MissingValue />}
        />
        <DetailRow
          icon={<Compass className="size-3.5" />}
          label={t('Koordinaten')}
          value={formatCoordinates(details) ?? <MissingValue />}
        />
        <DetailRow
          icon={<Clock className="size-3.5" />}
          label={t('Zeitzone')}
          value={details.timezone ?? <MissingValue />}
          mono={Boolean(details.timezone)}
        />
      </dl>
      {details.source && (
        <p className="mt-4 text-right text-xs text-fg-subtle">
          {details.source}
        </p>
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
    <div className="grid gap-0.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
      <dt className="flex h-5 min-w-0 items-center gap-2 text-xs text-fg-subtle">
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
      </dt>
      <dd className={cn('min-w-0 text-sm leading-5 text-fg wrap-break-word', mono && 'font-mono text-[13px]')}>
        {value}
      </dd>
    </div>
  );
}

function MissingValue({ children }: { children?: ReactNode }) {
  return <span className="text-fg-subtle">{children ?? t('nicht verfügbar')}</span>;
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
