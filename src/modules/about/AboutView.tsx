import { motion } from 'framer-motion';
import {
  Code2,
  Globe2,
  GraduationCap,
  Heart,
  ServerCog,
  Sparkles,
} from 'lucide-react';

export function AboutView() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto max-w-5xl"
    >
      <div className="mb-8 text-center">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-ink-200 bg-white px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-900/60 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-50/60">
          <Heart className="h-3.5 w-3.5" />
          About
        </div>
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Warum diggy existiert</h1>
      </div>

      <div className="surface rounded-2xl p-6 md:p-8">
        <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
          <div>
            <p className="text-lg leading-relaxed text-ink-900/80 dark:text-ink-50/80">
              diggy ist ein privates Lern- und Entwicklungsprojekt. Ich nutze es, um besser zu
              verstehen, wie DNS, Domains, SSL, Mail-Security und Web-Performance in der Praxis
              zusammenspielen.
            </p>

            <div className="mt-5 space-y-4 text-sm leading-relaxed text-ink-900/65 dark:text-ink-50/65">
              <p>
                Ich arbeite bei einem Webhoster und habe dadurch täglich Berührungspunkte mit
                Domains, Hosting und technischen Setups. Dieses Tool ist aus genau dieser Neugier
                entstanden: Dinge sichtbar machen, die sonst oft in verschiedenen Tools,
                Terminals oder Panels verteilt sind.
              </p>
              <p>
                Gleichzeitig lerne ich noch, probiere Ideen aus und entwickle nebenbei auch an
                anderen Projekten. diggy ist also bewusst nicht „fertig“, sondern wächst Schritt
                für Schritt weiter.
              </p>
              <p>
                Ich stelle das Tool gerne öffentlich zur Verfügung, damit andere schnell einen
                kompakten Blick auf eine Domain bekommen können. Wenn es jemandem hilft, ein
                Problem schneller zu verstehen, hat sich das Projekt schon gelohnt.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <AboutCard
              icon={<GraduationCap className="h-4 w-4" />}
              title="Lernprojekt"
              text="Gebaut, um Hosting- und DNS-Themen besser zu verstehen."
            />
            <AboutCard
              icon={<ServerCog className="h-4 w-4" />}
              title="Webhosting-Bezug"
              text="Inspiriert von realen Fragen rund um Domains, Mail und SSL."
            />
            <AboutCard
              icon={<Globe2 className="h-4 w-4" />}
              title="Öffentlich nutzbar"
              text="Ein kleines Tool für schnelle Checks, nicht nur für mich allein."
            />
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <InfoPanel
          icon={<Code2 className="h-4 w-4" />}
          title="Was diggy sein soll"
          text="Ein ruhiger Ort für Domain-Checks: DNS Records, Health Score, Mail Security, WHOIS/RDAP, Propagation und Speed in einer Oberfläche."
        />
        <InfoPanel
          icon={<Sparkles className="h-4 w-4" />}
          title="Was noch kommt"
          text="Mehr Feinschliff, bessere Erklärungen, sauberere Reports und kleine Features, die beim Lernen und Debuggen wirklich helfen."
        />
      </div>
    </motion.div>
  );
}

function AboutCard({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-xl border border-ink-100 bg-ink-100/60 p-4 dark:border-ink-800 dark:bg-ink-950/45">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <span className="text-ink-900/55 dark:text-ink-50/55">{icon}</span>
        {title}
      </div>
      <p className="text-sm leading-relaxed text-ink-900/55 dark:text-ink-50/55">{text}</p>
    </div>
  );
}

function InfoPanel({
  icon,
  title,
  text,
}: {
  icon: React.ReactNode;
  title: string;
  text: string;
}) {
  return (
    <div className="surface rounded-2xl p-5">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium">
        <span className="text-ink-900/55 dark:text-ink-50/55">{icon}</span>
        {title}
      </div>
      <p className="text-sm leading-relaxed text-ink-900/60 dark:text-ink-50/60">{text}</p>
    </div>
  );
}
