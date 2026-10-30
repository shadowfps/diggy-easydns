import {
  ColumnLayout,
  Heading,
  LayoutCard,
  Section,
  Skeleton,
  SkeletonText,
  Text,
} from '@mittwald/flow-react-components';

/**
 * Platzhalter für die progressiv nachgeladenen Report-Sektionen — Flows
 * Skeleton und SkeletonText. Die Presets bilden den Footprint der echten
 * Ansichten grob nach, damit beim Einblenden der Daten kein Layout-Sprung
 * entsteht: im Report stehen sie in der LayoutCard der Tabs, deshalb ohne
 * eigene Karte (außer, wo die echte Ansicht selbst eine Karte ist).
 *
 * Die Skeletons selbst sind für Screenreader ausgeblendet; den Ladezustand
 * trägt `aria-busy` am umgebenden Element.
 */

/** Ein Block aus Überschrift und ein paar Textzeilen. */
function SectionSkeleton({ lines = 3 }: { lines?: number }) {
  const widths = ['100%', '80%', '66%', '90%', '50%'];
  return (
    <Section>
      <Heading level={3}>
        <SkeletonText width="9em" />
      </Heading>
      {Array.from({ length: lines }).map((_, i) => (
        <Text key={i}>
          <SkeletonText width={widths[i % widths.length]} />
        </Text>
      ))}
    </Section>
  );
}

/** Platzhalter für den Health-Score (Aggregat — braucht alle Sektionen). */
export function ScoreCardSkeleton() {
  return (
    <LayoutCard aria-busy="true">
      <Section>
        <Heading level={2}>
          <SkeletonText width="7em" />
        </Heading>
        <Skeleton height="7.5rem" width="7.5rem" />
        <Text>
          <SkeletonText width="80%" />
        </Text>
        <Text>
          <SkeletonText width="60%" />
        </Text>
      </Section>
    </LayoutCard>
  );
}

/**
 * Platzhalter für „Seit dem letzten Check“, solange deren Code nachlädt —
 * so hoch wie die eingeklappte Karte, sonst schöbe ihr Einblenden die Tabs.
 */
export function SinceLastCheckSkeleton() {
  return (
    <LayoutCard aria-busy="true">
      <Text>
        <SkeletonText width="16em" />
      </Text>
      <Text>
        <small>
          <SkeletonText width="11em" />
        </small>
      </Text>
    </LayoutCard>
  );
}

/** N Abschnitte — für Security (2) und Mail (4). */
export function SectionCardsSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <SectionSkeleton key={i} />
      ))}
    </div>
  );
}

/** Resolver-Zeilen für die Propagation-Ansicht. */
export function PropagationSkeleton() {
  return (
    <Section aria-busy="true">
      <Heading level={3}>
        <SkeletonText width="9em" />
      </Heading>
      <ColumnLayout s={[1]} m={[1, 1]} l={[1, 1]} rowGap="s">
        {/* So viele Zeilen wie Resolver (DOH_RESOLVERS) — die Ansicht springt dann nicht. */}
        {Array.from({ length: 9 }).map((_, i) => (
          <Text key={i}>
            <SkeletonText width="85%" />
          </Text>
        ))}
      </ColumnLayout>
    </Section>
  );
}

/** WHOIS/RDAP — Registrierung, Status, Nameserver. */
export function WhoisSkeleton() {
  return (
    <div aria-busy="true">
      <Section>
        <Heading level={3}>
          <SkeletonText width="9em" />
        </Heading>
        <ColumnLayout s={[1]} m={[1, 1]} l={[1, 1]} rowGap="s">
          {[0, 1, 2, 3].map((i) => (
            <Text key={i}>
              <SkeletonText width="75%" />
            </Text>
          ))}
        </ColumnLayout>
      </Section>
      <SectionSkeleton lines={1} />
      <SectionSkeleton lines={1} />
    </div>
  );
}

/** Gestapelte Zeilen — für die (aggregierte) Findings-Liste. */
export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true">
      {Array.from({ length: rows }).map((_, i) => (
        <SectionSkeleton key={i} lines={1} />
      ))}
    </div>
  );
}

/**
 * Platzhalter für eine eigene Seite (History, About, Available Check), solange
 * ihr Chunk lädt: Überschrift und eine Karte, so breit wie die Textseiten.
 */
export function PageSkeleton() {
  return (
    <div aria-busy="true" style={{ width: '100%', maxWidth: '48rem', marginInline: 'auto' }}>
      <Heading level={1}>
        <SkeletonText width="8em" />
      </Heading>
      <LayoutCard>
        <SectionSkeleton lines={3} />
      </LayoutCard>
    </div>
  );
}

/**
 * Platzhalter für Impressum und Datenschutz, solange ihr Chunk lädt (App.tsx).
 *
 * Mindestens bildschirmhoch: die Seiten sind es sowieso, und so liegt der
 * Footer schon vorher unter dem Rand. Mit einem Platzhalter von vier Zeilen
 * sprang er beim Eintreffen des Datenschutztexts aus dem Bild — gemessen auf
 * „Fast 3G“, 390 px: CLS 0,26 beim direkten Aufruf, 0,36 beim Wechsel aus
 * dem Footer.
 */
export function LegalPageSkeleton() {
  return (
    <div aria-busy="true" style={{ minHeight: '100dvh' }}>
      <Heading level={1}>
        <SkeletonText width="8em" />
      </Heading>
      <LayoutCard>
        <SectionSkeleton lines={4} />
      </LayoutCard>
    </div>
  );
}
