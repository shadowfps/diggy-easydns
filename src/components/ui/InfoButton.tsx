import {
  Button,
  ContextualHelp,
  ContextualHelpTrigger,
  Text,
} from '@mittwald/flow-react-components';
import type { Explanation } from '@/lib/explanations';
import { useI18n } from '@/i18n';

interface InfoButtonProps {
  /** Der erklärte Begriff, so wie er in der Oberfläche steht: „MX“, „DMARC“. */
  term: string;
  explanation: Explanation;
}

/**
 * Kleines „?“ neben einem Fachbegriff, das eine Erklärung aufklappt (#80) —
 * Flows ContextualHelp.
 *
 * Bewusst kein Hover-Tooltip: das erreicht man weder per Touch noch per
 * Tastatur. ContextualHelp ist ein Dialog im Popover: Klick, Enter oder
 * Leertaste öffnen, der Fokus wandert in die Erklärung, Escape oder ein Klick
 * daneben schließen und geben ihn an den Button zurück.
 *
 * Der Name des Buttons bleibt diggys eigener („Was bedeutet MX?“) statt
 * Flows „Weitere Informationen zu MX“: er ist übersetzt und sagt, was man
 * erfährt.
 */
export function InfoButton({ term, explanation }: InfoButtonProps) {
  const { t } = useI18n();
  return (
    <ContextualHelpTrigger subject={term}>
      <Button aria-label={t('Was bedeutet {term}?', { term })} />
      <ContextualHelp>
        <Text>
          {/* Der Punkt trennt nur fürs Auge; manche Screenreader lesen ihn
              sonst als „Mittelpunkt“ vor. */}
          <strong>
            {term} <span aria-hidden="true">·</span> {t(explanation.title)}
          </strong>
        </Text>
        <Text>{t(explanation.text)}</Text>
      </ContextualHelp>
    </ContextualHelpTrigger>
  );
}
