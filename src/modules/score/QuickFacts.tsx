import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { Check, X } from 'lucide-react';
import type {
  DetectedTech,
  DnsRecord,
  DnssecInfo,
  MailSecurity,
  SslInfo,
  TechCategory,
} from '@/types/dns';
import type { SectionSlice } from '@/hooks/useProgressiveLookup';
import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/Skeleton';
import { IpAddressLink, isInspectableIp } from '@/components/ip/IpAddressLink';

/* ─── Tech-Stack SVG logos ───────────────────────────────────────────────── */

const TECH_CATEGORY_ORDER: TechCategory[] = [
  'server', 'language', 'cms', 'framework', 'css', 'library', 'cdn', 'hosting',
];

/** Returns a sorted + capped list of detected technologies. */
function sortTech(techs: DetectedTech[]): DetectedTech[] {
  return [...techs]
    .sort(
      (a, b) =>
        TECH_CATEGORY_ORDER.indexOf(a.category) -
        TECH_CATEGORY_ORDER.indexOf(b.category),
    )
    .slice(0, 12);
}

interface TechIconProps {
  tech: DetectedTech;
}

function TechIcon({ tech }: TechIconProps) {
  const label = tech.version ? `${tech.name} ${tech.version}` : tech.name;
  const svg = getTechSvg(tech.name);

  return (
    <div
      title={label}
      className="w-8 h-8 flex items-center justify-center rounded-lg border border-ink-100 dark:border-ink-900/80 bg-white dark:bg-ink-900 hover:border-ink-300 dark:hover:border-ink-700 transition-colors cursor-default"
    >
      {svg ?? (
        <span className="text-[10px] font-semibold text-ink-900/50 dark:text-ink-50/50 leading-none">
          {tech.name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </div>
  );
}

function getTechSvg(name: string): ReactNode {
  switch (name) {
    case 'WordPress':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#21759B"
            d="M12 2C6.486 2 2 6.486 2 12s4.486 10 10 10 10-4.486 10-10S17.514 2 12 2zm0 1.542c1.888 0 3.63.579 5.069 1.56L5.102 17.069A8.444 8.444 0 0 1 3.542 12c0-4.669 3.79-8.458 8.458-8.458zm0 16.916a8.416 8.416 0 0 1-4.963-1.609l11.967-11.967A8.458 8.458 0 0 1 20.458 12c0 4.669-3.79 8.458-8.458 8.458z"
          />
        </svg>
      );
    case 'PHP':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#777BB4"
            d="M7.01 10.207h-.944l-.515 2.648h.838c.556 0 .97-.105 1.242-.314.272-.21.455-.559.55-1.049.092-.47.05-.802-.124-.995-.175-.193-.523-.29-1.047-.29zM12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm-1.386 13.863H8.946l.401-2.06H7.73l-.401 2.06H5.671l1.227-6.324h1.666l-.371 1.906h1.616l.371-1.906h1.657l-1.223 6.324zm5.217 0h-1.574l.088-.439c-.601.35-1.214.526-1.838.526-.621 0-1.084-.167-1.388-.5-.304-.334-.384-.813-.239-1.438.101-.421.28-.779.534-1.075.255-.297.568-.527.938-.69.371-.164.804-.246 1.301-.246.316 0 .701.056 1.156.168l.176-.901c.046-.235.009-.402-.111-.503-.12-.1-.347-.15-.681-.15-.29 0-.604.043-.943.13a8.09 8.09 0 0 0-.879.304l.267-1.371c.33-.112.671-.2 1.021-.264.35-.063.693-.095 1.03-.095.631 0 1.097.136 1.397.407.3.271.385.669.253 1.195l-.668 3.459zm3.985-5.888l-1.223 6.324h-1.657l1.223-6.324h1.657z"
          />
        </svg>
      );
    case 'React':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#61DAFB"
            d="M14.23 12.004a2.236 2.236 0 0 1-2.235 2.236 2.236 2.236 0 0 1-2.236-2.236 2.236 2.236 0 0 1 2.235-2.236 2.236 2.236 0 0 1 2.236 2.236zm2.648-10.69c-1.346 0-3.107.96-4.888 2.622-1.78-1.653-3.542-2.602-4.887-2.602-.41 0-.783.093-1.106.278-1.375.793-1.683 3.264-.973 6.365C1.98 8.917 0 10.42 0 12.004c0 1.59 1.99 3.097 5.043 4.03-.704 3.113-.39 5.588.988 6.38.32.187.69.275 1.102.275 1.345 0 3.107-.96 4.888-2.624 1.78 1.654 3.542 2.603 4.887 2.603.41 0 .783-.09 1.106-.275 1.374-.792 1.683-3.263.973-6.365C22.02 15.096 24 13.59 24 12.004c0-1.59-1.99-3.097-5.043-4.032.704-3.11.39-5.587-.988-6.38-.318-.184-.688-.277-1.092-.278zm-.005 1.09c.312 0 .593.074.826.22.898.519 1.208 2.368.87 4.78-.164 1.098-.445 2.293-.826 3.513-.777-.192-1.607-.35-2.474-.465-.474-.645-.977-1.258-1.501-1.832.577-.577 1.137-1.2 1.674-1.862.53-.655.99-1.32 1.382-1.98.412-.687.703-1.35.877-1.975.15-.557.201-1.052.139-1.459-.07-.45-.26-.73-.539-.885a1.277 1.277 0 0 0-.608-.135zm-11.36.125c.313 0 .598.072.833.214.555.32.833.937.833 1.832 0 .64-.16 1.401-.48 2.264a17.9 17.9 0 0 0-3.004 1.293 17.77 17.77 0 0 0-1.474 1.003C1.95 10.42 1.5 11.18 1.5 12.004c0 .824.45 1.583 1.394 2.272.474.35 1.04.673 1.686.957a17.82 17.82 0 0 0 1.332.49c.23-.748.521-1.527.866-2.32.345-.796.729-1.566 1.148-2.305-.405-.73-.773-1.477-1.095-2.237-.32-.757-.572-1.509-.748-2.25-.16-.673-.227-1.296-.195-1.844.022-.38.11-.707.262-.959.128-.213.298-.363.543-.443.135-.044.28-.066.432-.066z"
          />
        </svg>
      );
    case 'Vue.js':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path fill="#4FC08D" d="M24 1.61h-9.94L12 5.16 9.94 1.61H0l12 20.78zM2.28 3.17h3.43L12 15.26l6.29-12.09h3.43L12 19.48z" />
        </svg>
      );
    case 'Angular':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#DD0031"
            d="M9.931 12.645h4.138l-2.07-4.908zm-2.458 5.838l1.485-3.545h5.087l1.485 3.545L12 21.232zM11.996.009L.686 3.988l1.725 14.76 9.585 5.243 9.588-5.238 1.727-14.772z"
          />
        </svg>
      );
    case 'Next.js':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="currentColor"
            d="M11.572 0c-.176 0-.31.001-.358.007a19.76 19.76 0 0 1-.364.033C7.443.346 4.25 2.185 2.228 5.012a11.875 11.875 0 0 0-2.119 5.243c-.096.659-.108.854-.108 1.747s.012 1.089.108 1.748c.652 4.506 3.86 8.292 8.209 9.695.779.25 1.6.422 2.534.525.363.04 1.935.04 2.299 0 1.611-.178 2.977-.577 4.323-1.264.207-.106.247-.134.219-.158-.02-.013-.9-1.193-1.955-2.62l-1.919-2.592-2.404-3.558a338.739 338.739 0 0 0-2.422-3.556c-.009-.002-.018 1.579-.023 3.51-.007 3.38-.01 3.515-.052 3.595a.426.426 0 0 1-.206.214c-.075.037-.14.044-.495.044H7.81l-.108-.068a.438.438 0 0 1-.157-.171l-.05-.106.006-4.703.007-4.705.072-.092a.645.645 0 0 1 .174-.143c.096-.047.134-.051.54-.051.478 0 .558.018.682.154.035.038 1.337 1.999 2.895 4.361a10760.433 10760.433 0 0 0 4.735 7.17l1.9 2.879.096-.063a12.317 12.317 0 0 0 2.466-2.163 11.944 11.944 0 0 0 2.824-6.134c.096-.66.108-.854.108-1.748 0-.893-.012-1.088-.108-1.747-.652-4.506-3.859-8.292-8.208-9.695a12.597 12.597 0 0 0-2.499-.523A33.119 33.119 0 0 0 11.573 0zm4.069 7.217c.347 0 .408.005.486.047a.473.473 0 0 1 .237.277c.018.06.023 1.365.018 4.304l-.006 4.218-.744-1.14-.746-1.14v-3.066c0-1.982.01-3.097.023-3.15a.478.478 0 0 1 .233-.296c.096-.05.13-.054.5-.054z"
          />
        </svg>
      );
    case 'Nuxt.js':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#00DC82"
            d="M13.46 2.695a1.563 1.563 0 0 0-2.92 0L.268 20.95A1.563 1.563 0 0 0 1.728 23.1h8.823a1.563 1.563 0 0 0 1.46-2.15l-5.56-14.19 6.41 16.34h9.41a1.563 1.563 0 0 0 1.46-2.15z"
          />
        </svg>
      );
    case 'Svelte':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#FF3E00"
            d="M10.354 21.125a4.44 4.44 0 0 1-4.765-1.767 4.128 4.128 0 0 1-.703-3.107 3.898 3.898 0 0 1 .134-.522l.105-.321.287.21a7.21 7.21 0 0 0 2.186 1.092l.208.063-.02.208a1.253 1.253 0 0 0 .226.83 1.337 1.337 0 0 0 1.435.533 1.231 1.231 0 0 0 .343-.15l5.59-3.562a1.164 1.164 0 0 0 .524-.778 1.242 1.242 0 0 0-.211-.937 1.337 1.337 0 0 0-1.435-.533 1.23 1.23 0 0 0-.343.15l-2.133 1.36a4.078 4.078 0 0 1-1.135.496 4.44 4.44 0 0 1-4.765-1.766 4.128 4.128 0 0 1-.703-3.108 3.875 3.875 0 0 1 1.742-2.58l5.59-3.562a4.079 4.079 0 0 1 1.135-.496 4.44 4.44 0 0 1 4.765 1.767 4.128 4.128 0 0 1 .703 3.107 3.9 3.9 0 0 1-.134.522l-.105.321-.287-.21a7.21 7.21 0 0 0-2.186-1.092l-.208-.063.02-.208a1.253 1.253 0 0 0-.226-.83 1.337 1.337 0 0 0-1.435-.533 1.234 1.234 0 0 0-.343.15l-5.59 3.562a1.164 1.164 0 0 0-.524.778 1.242 1.242 0 0 0 .211.937 1.337 1.337 0 0 0 1.435.533 1.23 1.23 0 0 0 .343-.15l2.133-1.36a4.075 4.075 0 0 1 1.135-.496 4.44 4.44 0 0 1 4.765 1.766 4.128 4.128 0 0 1 .703 3.108 3.875 3.875 0 0 1-1.742 2.58l-5.59 3.562a4.08 4.08 0 0 1-1.135.496z"
          />
        </svg>
      );
    case 'Astro':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#FF5D01"
            d="M16.074 16.86c-.72.616-2.157 1.035-3.812 1.035-2.032 0-3.735-.632-4.187-1.483-.162-.303-.162-.633 0-.937.453-.851 2.155-1.483 4.187-1.483 1.655 0 3.092.42 3.812 1.035V13.47c-.72-.616-2.157-1.035-3.812-1.035-3.246 0-5.874 1.321-5.874 2.951s2.628 2.951 5.874 2.951c1.655 0 3.092-.419 3.812-1.035v-1.442zm-8.148-8.36L12 2.25l4.074 6.25H8.926zM12 2.25L7.926 8.5H2.25L12 21.75 21.75 8.5H16.074L12 2.25z"
          />
        </svg>
      );
    case 'Tailwind CSS':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#06B6D4"
            d="M12.001 4.8c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624C13.666 10.618 15.027 12 18.001 12c3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C16.337 6.182 14.976 4.8 12.001 4.8zM6.001 12c-3.2 0-5.2 1.6-6 4.8 1.2-1.6 2.6-2.2 4.2-1.8.913.228 1.565.89 2.288 1.624 1.177 1.194 2.538 2.576 5.512 2.576 3.2 0 5.2-1.6 6-4.8-1.2 1.6-2.6 2.2-4.2 1.8-.913-.228-1.565-.89-2.288-1.624C10.337 13.382 8.976 12 6.001 12z"
          />
        </svg>
      );
    case 'Bootstrap':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#7952B3"
            d="M6.375 7.125V4.5h1.688l.046.003a1.47 1.47 0 0 1 1.327 1.46 1.47 1.47 0 0 1-1.374 1.461zm0 3.843V8.25h1.819l.045.002a1.64 1.64 0 0 1 1.481 1.632 1.64 1.64 0 0 1-1.526 1.632l-.045.002zM23.79 9.816a11.88 11.88 0 0 0-.459-1.474c-.34-.91-.81-1.772-1.398-2.55a11.972 11.972 0 0 0-2.014-2.013A11.995 11.995 0 0 0 12.007 1.5 11.993 11.993 0 0 0 .48 12c0 3.13 1.196 6.087 3.368 8.31A11.993 11.993 0 0 0 12 22.5a11.999 11.999 0 0 0 10.5-6.198 11.978 11.978 0 0 0 1.29-6.486zM9.75 13.5H8.625v2.25H7.5V8.25h2.25A2.625 2.625 0 0 1 12.375 10.5a2.57 2.57 0 0 1-.705 1.77 2.625 2.625 0 0 1 1.08 2.145v.585a2.625 2.625 0 0 1-2.625 2.625H7.5v-1.125h2.25a1.5 1.5 0 0 0 1.5-1.5v-.585a1.5 1.5 0 0 0-1.5-1.5h-.562l.562-.015zm3-4.688a1.5 1.5 0 0 0-1.5-1.5H8.625V11.625h2.625a1.5 1.5 0 0 0 1.5-1.5v-.313z"
          />
        </svg>
      );
    case 'jQuery':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#0769AD"
            d="M0 12.068C0 5.404 5.404 0 12.068 0c6.665 0 12.068 5.404 12.068 12.068 0 6.665-5.403 12.07-12.068 12.07C5.404 24.136 0 18.733 0 12.068zm18.29-6.26c-2.379-1.64-5.688-1.968-8.46-.815-1.89.799-3.464 2.382-4.246 4.237-.73 1.705-.71 3.69.02 5.39.67 1.58 1.93 2.91 3.46 3.73 1.68.92 3.7 1.15 5.56.71 1.69-.4 3.2-1.43 4.23-2.84.85-1.15 1.33-2.58 1.31-4.01h-6.54v1.97h4.33c-.26 1.28-1.12 2.4-2.28 2.98-1.37.7-3.04.71-4.42.04-1.12-.54-2.01-1.5-2.47-2.65-.49-1.18-.48-2.55.03-3.72.44-1.02 1.24-1.88 2.23-2.41 1.12-.59 2.47-.74 3.71-.4.9.24 1.69.79 2.31 1.5l1.5-1.49c-.82-.83-1.81-1.48-2.93-1.8l.41-.48z"
          />
        </svg>
      );
    case 'nginx':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#009639"
            d="M12 0L1.605 6v12L12 24l10.395-6V6zm-1.201 16.469c-2.504.343-4.8-.199-4.8-.199v-1.43s2.144.449 4.01.262c1.071-.107 1.476-.583 1.476-1.105v-.017c0-.559-.371-.913-2.165-1.279-2.265-.464-3.437-1.28-3.437-3.025v-.017c0-1.802 1.47-2.913 3.601-2.913 2.143 0 3.797.621 3.797.621v1.401s-1.652-.55-3.399-.55c-.963 0-1.39.434-1.39.993v.017c0 .569.444.9 2.35 1.291 2.204.455 3.252 1.272 3.252 3.013v.017c.001 1.864-1.369 2.877-3.295 2.919z"
          />
        </svg>
      );
    case 'Apache':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#D22128"
            d="M.97 21.169C-.435 23.68.272 24.007 1.393 22.76c.73-.816 1.404-1.677 2.067-2.538l.003.002c.012-.014.021-.03.033-.046.17-.217.337-.43.506-.639.025-.033.05-.065.078-.097C5.534 18.2 7.218 16.46 9.73 16.17l-3.24 4.566-1.278.268c-.403.088-.69.448-.69.86v1.504c0 .486.393.88.88.88h1.394c.485 0 .88-.394.88-.88v-.948l3.394-.712c.33-.069.604-.298.725-.61l2.553-6.603c.55-.053 1.116-.08 1.69-.079a20.24 20.24 0 0 1 2.186.12l3.39-8.766C22.685 4.38 22.67 2.29 20.636.78 18.584-.75 14.618-.094 11.96 1.49c-.576.342-1.13.748-1.648 1.227L.97 21.169zm15.2-8.765l-2.3 5.951a19.71 19.71 0 0 0-1.705-.07 18.6 18.6 0 0 0-1.48.063l2.307-5.97a20.82 20.82 0 0 1 1.487-.058 21.1 21.1 0 0 1 1.691.084zm1.5-4.56l-2.313 5.982c-.614-.077-1.235-.12-1.852-.123l2.303-5.955c.636.02 1.265.054 1.862.097zm.2-4.674a7.24 7.24 0 0 1 1.573 1.122L16.89 9.785a22.96 22.96 0 0 0-1.858-.107l2.84-7.508zm-1.51 3.917a16.7 16.7 0 0 0-1.694-.082L16.978 1.1a7.82 7.82 0 0 1 1.81 1.023l-2.429 4.964z"
          />
        </svg>
      );
    case 'IIS':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#5E5E5E"
            d="M0 0h11.377v11.372H0zm12.623 0H24v11.372H12.623zM0 12.623h11.377V24H0zm12.623 0H24V24H12.623z"
          />
        </svg>
      );
    case 'LiteSpeed':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#0095D3"
            d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm1.2 17.4H6.6V6.6h1.8v9h4.8v1.8zm3-3.6h-1.8V6.6h1.8v7.2z"
          />
        </svg>
      );
    case 'Caddy':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#1EBC8A"
            d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 4.8a7.2 7.2 0 1 1 0 14.4A7.2 7.2 0 0 1 12 4.8zm0 2.4a4.8 4.8 0 1 0 0 9.6 4.8 4.8 0 0 0 0-9.6z"
          />
        </svg>
      );
    case 'Node.js':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#339933"
            d="M11.998 24c-.321 0-.641-.084-.922-.247l-2.936-1.737c-.438-.245-.224-.332-.08-.383.585-.203.703-.25 1.328-.604.065-.037.151-.023.218.017l2.256 1.339c.082.045.198.045.272 0l8.795-5.076c.082-.047.134-.141.134-.238V6.921c0-.099-.052-.19-.137-.24l-8.791-5.073c-.081-.047-.189-.047-.271 0L3.075 6.68c-.087.05-.139.142-.139.241v10.15c0 .097.052.19.139.237l2.409 1.391c1.307.654 2.108-.116 2.108-.891V7.787c0-.142.114-.253.256-.253h1.115c.139 0 .255.111.255.253v10.021c0 1.745-.95 2.745-2.604 2.745-.508 0-.909 0-2.026-.551L2.28 18.675a1.85 1.85 0 0 1-.919-1.604V6.921c0-.66.353-1.273.919-1.604l8.795-5.082a1.864 1.864 0 0 1 1.847 0l8.794 5.082c.566.331.919.944.919 1.604v10.15c0 .66-.353 1.273-.919 1.604l-8.794 5.076a1.834 1.834 0 0 1-.924.249z"
          />
        </svg>
      );
    case 'TYPO3':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#FF8700"
            d="M6.781 0C3.098 0 0 3.098 0 6.781v10.438C0 20.902 3.098 24 6.781 24h10.438C20.902 24 24 20.902 24 17.219V6.781C24 3.098 20.902 0 17.219 0zm1.296 4.8h7.847v2.372H13.38v11.627h-2.757V7.172H8.077z"
          />
        </svg>
      );
    case 'Joomla':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#5091CD"
            d="M7.292 0C5.54 0 4.105 1.435 4.105 3.187c0 1.752 1.435 3.187 3.187 3.187.63 0 1.219-.186 1.714-.503l2.671 2.676-.014.013 2.693 2.691.011-.01 2.012 2.012a3.17 3.17 0 0 0-.503 1.713c0 1.752 1.434 3.187 3.187 3.187 1.752 0 3.187-1.435 3.187-3.187 0-1.752-1.435-3.187-3.187-3.187-.63 0-1.219.186-1.714.503l-1.871-1.87 2.704-2.704a3.17 3.17 0 0 0 1.714.503c1.752 0 3.187-1.434 3.187-3.187 0-1.752-1.435-3.187-3.187-3.187-1.752 0-3.187 1.435-3.187 3.187 0 .63.186 1.219.503 1.714l-2.704 2.703-2.69-2.693a3.17 3.17 0 0 0 .503-1.714C11.703 1.435 10.268 0 8.516 0H7.292zM1.473 12.459c-1.752 0-3.187 1.435-3.187 3.187 0 1.752 1.435 3.187 3.187 3.187a3.17 3.17 0 0 0 1.714-.503l2.762 2.762a3.17 3.17 0 0 0-.503 1.714c0 1.752 1.435 3.187 3.187 3.187 1.752 0 3.187-1.435 3.187-3.187 0-1.752-1.435-3.187-3.187-3.187a3.17 3.17 0 0 0-1.714.503L3.187 17.36a3.17 3.17 0 0 0 .503-1.714c0-1.752-1.435-3.187-3.187-3.187h-.03z"
          />
        </svg>
      );
    case 'Drupal':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#0678BE"
            d="M15.78 5.113C14.09 3.425 12.48 1.815 12.008 0c-.472 1.815-2.082 3.425-3.771 5.113-2.489 2.49-5.362 5.362-5.362 9.465a9.135 9.135 0 0 0 18.267 0c0-4.103-2.874-6.976-5.362-9.465zm-3.772 15.97a5.3 5.3 0 0 1-5.298-5.298c0-1.997 1.103-3.495 2.173-4.564.748-.75 1.507-1.38 2.183-2.003.264-.243.524-.488.775-.74.252.252.511.497.775.74.676.622 1.435 1.253 2.183 2.003 1.07 1.069 2.173 2.567 2.173 4.564a5.3 5.3 0 0 1-5.264 5.298h-.7z"
          />
        </svg>
      );
    case 'Shopify':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#96BF48"
            d="M15.337 23.979l5.24-1.134S18.338 9.448 18.322 9.3c-.017-.148-.15-.246-.28-.246-.131 0-2.373-.049-2.373-.049s-1.57-1.538-1.735-1.702v16.676zm-1.657-16.18s-.882-.263-1.96-.263c-2.01 0-2.108 1.264-2.108 1.58 0 1.736 4.527 2.403 4.527 6.473 0 3.204-2.026 5.265-4.76 5.265-3.286 0-4.96-2.044-4.96-2.044l.878-2.905s1.724 1.48 3.18 1.48c.95 0 1.33-.747 1.33-1.296 0-2.26-3.714-2.36-3.714-6.086 0-3.13 2.26-6.162 6.801-6.162 1.744 0 2.611.5 2.611.5L13.68 7.8zm4.562-2.164a5.6 5.6 0 0 0-.483-.033c-.265 0-.521.082-.744.23l-.273 1.208s-.597-.197-1.555-.197c-.22 0-.435.016-.638.05L14.74 4.747A2.044 2.044 0 0 0 13.5 3c-.562 0-1.047.247-1.4.636l-.254 2.427-.15.05c-.5.155-.858.59-.858 1.132v.18l4.394-.008V5.63L18.12 3c.47.263.789.762.789 1.333v.282z"
          />
        </svg>
      );
    case 'Contao':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#F47C00"
            d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm3.6 16.8c-1.08.72-2.4 1.08-3.84 1.08-3.72 0-6.36-2.76-6.36-6.36s2.64-6.36 6.36-6.36c1.32 0 2.52.36 3.48.96l-1.2 2.04c-.6-.36-1.32-.6-2.04-.6-2.16 0-3.72 1.68-3.72 3.96 0 2.28 1.56 3.96 3.72 3.96.84 0 1.68-.24 2.28-.72l1.32 2.04z"
          />
        </svg>
      );
    case 'Kirby':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#FF0100"
            d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm-1.2 16.8V7.2l7.2 4.8-7.2 4.8z"
          />
        </svg>
      );
    case 'Cloudflare':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#F48120"
            d="M16.478 15.851l.328-1.131c.132-.455.066-.877-.175-1.19-.24-.31-.644-.48-1.124-.48l-9.57-.016a.2.2 0 0 1-.185-.12.2.2 0 0 1 .029-.216c.063-.076.158-.12.262-.12l9.637-.017c1.14-.055 2.369-.975 2.8-2.117l.547-1.419a.3.3 0 0 0 .015-.196A7.034 7.034 0 0 0 5.248 8.39a3.224 3.224 0 0 0-4.38 2.987 3.2 3.2 0 0 0 .062.63A4.553 4.553 0 0 0 0 16.01a4.516 4.516 0 0 0 4.516 4.516h11.544a.3.3 0 0 0 .284-.205l.134-.47z"
          />
        </svg>
      );
    case 'Vercel':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path fill="currentColor" d="M24 22.525H0l12-21.05z" />
        </svg>
      );
    case 'Netlify':
      return (
        <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden>
          <path
            fill="#00C7B7"
            d="M13.507 3.9l-.002.003-.84 2.66 3.243 3.243 2.843-.898.003-.002A10.066 10.066 0 0 0 13.507 3.9zm-3.015.011a10.067 10.067 0 0 0-5.248 5.244l.003.002 2.84.897L11.33 6.81l-.838-2.899zm-5.9 6.906A10.044 10.044 0 0 0 4.59 14h3.82v-.003l.96-3.045-2.779-2.135zM19.41 14a10.044 10.044 0 0 0 0-3.182l-2.78 2.133.96 3.046V14H19.41zM8.555 15.2L7.6 18.244a10.064 10.064 0 0 0 5.247 5.25l.002-.002.836-2.665-3.13-3.63zm7.287 0l-3.129 3.628.835 2.666a10.065 10.065 0 0 0 5.249-5.249L15.843 15.2z"
          />
        </svg>
      );
    default:
      return null;
  }
}

/* ─── Component ──────────────────────────────────────────────────────────── */

interface QuickFactItem {
  label: string;
  value?: ReactNode;
  mono?: boolean;
  muted?: boolean;
  ok?: boolean;
  bad?: boolean;
  loading?: boolean;
}

interface QuickFactsProps {
  records: DnsRecord[];
  ssl: SectionSlice<SslInfo | null>;
  dnssec: SectionSlice<DnssecInfo>;
  mail: SectionSlice<MailSecurity>;
  techStack: SectionSlice<DetectedTech[]>;
  onUseDomain?: (domain: string) => void;
}

export function QuickFacts({ records, ssl, dnssec, mail, techStack, onUseDomain }: QuickFactsProps) {
  const aRecord = records.find((r) => r.type === 'A');
  const mxRecord = records.find((r) => r.type === 'MX');
  const nsRecord = records.find((r) => r.type === 'NS');
  const aValue =
    aRecord && isInspectableIp(aRecord.value) ? (
      <IpAddressLink ip={aRecord.value} className="text-ink-900/80 dark:text-ink-50/80" />
    ) : (
      aRecord?.value ?? '—'
    );

  const nsValue =
    nsRecord && onUseDomain ? (
      <button
        type="button"
        onClick={() => onUseDomain(nsRecord.value)}
        className="min-w-0 truncate rounded-md text-left font-mono text-xs text-ink-900/80 transition-colors hover:text-ink-950 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink-900 dark:text-ink-50/80 dark:hover:text-white dark:focus-visible:outline-ink-50"
        title={`${nsRecord.value} in die Suche übernehmen`}
      >
        {nsRecord.value}
      </button>
    ) : (
      nsRecord?.value ?? '—'
    );

  // A/NS/MX kommen aus den Records und stehen sofort. SSL/DNSSEC/DMARC laden
  // im Hintergrund → bis dahin ein Inline-Skeleton statt des Werts.
  const sslInfo = ssl.data;
  const sslItem: QuickFactItem =
    ssl.status !== 'done'
      ? { label: 'SSL', loading: true }
      : {
          label: 'SSL',
          value: sslInfo ? `${sslInfo.daysUntilExpiry} Tage` : 'kein Cert',
          ok: Boolean(sslInfo?.valid && (sslInfo?.daysUntilExpiry ?? 0) > 14),
          bad: !sslInfo?.valid || (sslInfo?.daysUntilExpiry ?? 999) < 14,
        };

  const dnssecInfo = dnssec.data;
  const dnssecItem: QuickFactItem =
    dnssec.status !== 'done'
      ? { label: 'DNSSEC', loading: true }
      : {
          label: 'DNSSEC',
          value: dnssecInfo?.enabled && dnssecInfo?.valid ? 'aktiv' : 'inaktiv',
          ok: Boolean(dnssecInfo?.enabled && dnssecInfo?.valid),
          bad: !dnssecInfo?.enabled,
        };

  const dmarcPresent = mail.data?.dmarc.present;
  const dmarcItem: QuickFactItem =
    mail.status !== 'done'
      ? { label: 'DMARC', loading: true }
      : {
          label: 'DMARC',
          value: dmarcPresent ? 'gesetzt' : 'fehlt',
          ok: Boolean(dmarcPresent),
          bad: !dmarcPresent,
        };

  const items: QuickFactItem[] = [
    { label: 'A', value: aValue, mono: true },
    { label: 'NS', value: nsValue, mono: true },
    { label: 'MX', value: mxRecord?.value ?? '—', mono: true, muted: !mxRecord },
    sslItem,
    dnssecItem,
    dmarcItem,
  ];

  const techLoading = techStack.status !== 'done';
  const sortedTech = sortTech(techStack.data ?? []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="surface rounded-2xl p-6"
    >
      <div className="text-sm text-ink-900/60 dark:text-ink-50/60 mb-4">
        Schnellübersicht
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3 min-w-0">
            <span className="text-xs uppercase tracking-wider text-ink-900/40 dark:text-ink-50/40 w-14 shrink-0 font-medium">
              {item.label}
            </span>
            {item.loading ? (
              <Skeleton className="h-3.5 w-16" />
            ) : (
              <span
                className={cn(
                  'truncate',
                  item.mono && 'font-mono text-xs',
                  item.muted && 'text-ink-900/30 dark:text-ink-50/30',
                  item.ok && 'text-emerald-600 dark:text-emerald-400 flex items-center gap-1',
                  item.bad && 'text-red-600 dark:text-red-400 flex items-center gap-1'
                )}
              >
                {item.ok && <Check className="w-3.5 h-3.5 shrink-0" />}
                {item.bad && <X className="w-3.5 h-3.5 shrink-0" />}
                {item.value}
              </span>
            )}
          </div>
        ))}
      </div>

      {(techLoading || sortedTech.length > 0) && (
        <div className="mt-4 pt-4 border-t border-ink-100 dark:border-ink-900/60">
          <span className="text-xs uppercase tracking-wider text-ink-900/40 dark:text-ink-50/40 font-medium">
            Tech-Stack
          </span>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {techLoading
              ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8 w-8 rounded-lg" />)
              : sortedTech.map((tech) => <TechIcon key={tech.name} tech={tech} />)}
          </div>
        </div>
      )}
    </motion.div>
  );
}
