import { motion } from 'motion/react';
import {
  Code2,
  Globe2,
  GraduationCap,
  Heart,
  ServerCog,
  Sparkles,
} from 'lucide-react';
import { CardHeader } from '@/components/ui/CardHeader';
import { useI18n } from '@/i18n';

export function AboutView() {
  const { t } = useI18n();
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="mx-auto w-full max-w-3xl"
    >
      <p className="eyebrow flex items-center gap-1.5">
        <Heart className="size-3.5" />
        About
      </p>
      <h1 className="page-title mt-2">{t('Warum diggy existiert')}</h1>
      <p className="mt-3 text-base leading-relaxed text-fg-muted">
        {t('diggy ist ein privates Lern- und Entwicklungsprojekt. Ich nutze es, um besser zu verstehen, wie DNS, Domains, SSL, Mail-Security und Web-Performance in der Praxis zusammenspielen.')}
      </p>

      <div className="mt-8 space-y-4">
        <div className="card">
          <div className="space-y-4 text-sm leading-relaxed text-fg-muted">
            <p>
              {t('Ich arbeite bei einem Webhoster und habe dadurch täglich Berührungspunkte mit Domains, Hosting und technischen Setups. Dieses Tool ist aus genau dieser Neugier entstanden: Dinge sichtbar machen, die sonst oft in verschiedenen Tools, Terminals oder Panels verteilt sind.')}
            </p>
            <p>
              {t('Gleichzeitig lerne ich noch, probiere Ideen aus und entwickle nebenbei auch an anderen Projekten. diggy ist also bewusst nicht „fertig“, sondern wächst Schritt für Schritt weiter.')}
            </p>
            <p>
              {t('Ich stelle das Tool gerne öffentlich zur Verfügung, damit andere schnell einen kompakten Blick auf eine Domain bekommen können. Wenn es jemandem hilft, ein Problem schneller zu verstehen, hat sich das Projekt schon gelohnt.')}
            </p>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <AboutCard
              icon={<GraduationCap className="size-4" />}
              title={t('Lernprojekt')}
              text={t('Gebaut, um Hosting- und DNS-Themen besser zu verstehen.')}
            />
            <AboutCard
              icon={<ServerCog className="size-4" />}
              title={t('Webhosting-Bezug')}
              text={t('Inspiriert von realen Fragen rund um Domains, Mail und SSL.')}
            />
            <AboutCard
              icon={<Globe2 className="size-4" />}
              title={t('Öffentlich nutzbar')}
              text={t('Ein kleines Tool für schnelle Checks, nicht nur für mich allein.')}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <InfoPanel
            icon={<Code2 className="size-4" />}
            title={t('Was diggy sein soll')}
            text={t('Ein ruhiger Ort für Domain-Checks: DNS Records, Health Score, Mail Security, WHOIS/RDAP, Propagation und Speed in einer Oberfläche.')}
          />
          <InfoPanel
            icon={<Sparkles className="size-4" />}
            title={t('Was noch kommt')}
            text={t('Mehr Feinschliff, bessere Erklärungen, sauberere Reports und kleine Features, die beim Lernen und Debuggen wirklich helfen.')}
          />
        </div>
      </div>
    </motion.div>
  );
}

/** Fläche in der Karte — deshalb `panel`, nicht noch eine Karte. */
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
    <div className="panel">
      <div className="card-title">
        <span className="text-fg-muted">{icon}</span>
        {title}
      </div>
      <p className="mt-1 text-sm leading-relaxed text-fg-muted">{text}</p>
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
    <div className="card">
      <CardHeader icon={icon} title={title} />
      <p className="mt-4 text-sm leading-relaxed text-fg-muted">{text}</p>
    </div>
  );
}
