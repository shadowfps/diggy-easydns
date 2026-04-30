import { cn } from '@/lib/cn';

interface DiggyLogoProps {
  className?: string;
  animate?: boolean;
}

export function DiggyLogo({ className, animate = false }: DiggyLogoProps) {
  return (
    <svg
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('text-diggy-500', animate && 'animate-dig', className)}
      aria-label="Diggy"
    >
      {/* Kopf */}
      <path
        d="M12 18 C12 11, 18 7, 24 7 C30 7, 36 11, 36 18 L36 28 C36 35, 30 40, 24 40 C18 40, 12 35, 12 28 Z"
        fill="currentColor"
      />
      {/* Linkes Ohr */}
      <path
        d="M11 13 C9 11, 7 12, 7 16 C7 19, 9 21, 12 21 L13 18 Z"
        fill="currentColor"
      />
      {/* Rechtes Ohr */}
      <path
        d="M37 13 C39 11, 41 12, 41 16 C41 19, 39 21, 36 21 L35 18 Z"
        fill="currentColor"
      />
      {/* Schnauze */}
      <ellipse cx="24" cy="29" rx="6" ry="5" fill="#0B0A07" fillOpacity="0.18" />
      {/* Nase */}
      <ellipse cx="24" cy="26" rx="2" ry="1.5" fill="#0B0A07" />
      {/* Augen */}
      <circle cx="19" cy="20" r="1.6" fill="#0B0A07" />
      <circle cx="29" cy="20" r="1.6" fill="#0B0A07" />
      {/* Augen-Glanz */}
      <circle cx="19.5" cy="19.5" r="0.5" fill="#FEF7EC" />
      <circle cx="29.5" cy="19.5" r="0.5" fill="#FEF7EC" />
    </svg>
  );
}

export function DiggyPaw({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="6" cy="9" rx="2" ry="2.6" />
      <ellipse cx="18" cy="9" rx="2" ry="2.6" />
      <ellipse cx="9.5" cy="5.5" rx="1.8" ry="2.4" />
      <ellipse cx="14.5" cy="5.5" rx="1.8" ry="2.4" />
      <path d="M12 11 C8 11, 6 14, 6 17 C6 20, 8 21, 12 21 C16 21, 18 20, 18 17 C18 14, 16 11, 12 11 Z" />
    </svg>
  );
}
