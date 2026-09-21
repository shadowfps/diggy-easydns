/**
 * TextType — Schreibmaschinen-Effekt mit blinkendem Cursor.
 *
 * Original-Quelle: https://reactbits.dev/text-animations/text-type
 * Lokal eingecheckt (TypeScript-Generics fixed).
 *
 * Akzeptiert single string oder string[] (rotiert dann mit Pause + Löschanimation).
 */

import {
  type ElementType,
  type HTMLAttributes,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { gsap } from 'gsap';
import './TextType.css';

interface TextTypeProps {
  className?: string;
  showCursor?: boolean;
  hideCursorWhileTyping?: boolean;
  cursorCharacter?: string | ReactNode;
  cursorBlinkDuration?: number;
  cursorClassName?: string;
  text: string | string[];
  as?: ElementType;
  typingSpeed?: number;
  initialDelay?: number;
  pauseDuration?: number;
  deletingSpeed?: number;
  loop?: boolean;
  textColors?: string[];
  variableSpeed?: { min: number; max: number };
  onSentenceComplete?: (sentence: string, index: number) => void;
  startOnVisible?: boolean;
  reverseMode?: boolean;
}

const TextType = ({
  text,
  as: Component = 'div',
  typingSpeed = 50,
  initialDelay = 0,
  pauseDuration = 2000,
  deletingSpeed = 30,
  loop = true,
  className = '',
  showCursor = true,
  hideCursorWhileTyping = false,
  cursorCharacter = '|',
  cursorClassName = '',
  cursorBlinkDuration = 0.5,
  textColors = [],
  variableSpeed,
  onSentenceComplete,
  startOnVisible = false,
  reverseMode = false,
  ...props
}: TextTypeProps & Omit<HTMLAttributes<HTMLElement>, 'children'>) => {
  const reducedMotion = useReducedMotion();
  const [displayedText, setDisplayedText] = useState('');
  const [currentCharIndex, setCurrentCharIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [currentTextIndex, setCurrentTextIndex] = useState(0);
  const [isVisible, setIsVisible] = useState(!startOnVisible);
  const cursorRef = useRef<HTMLSpanElement | null>(null);
  const containerRef = useRef<HTMLElement | null>(null);

  const textArray = useMemo(() => (Array.isArray(text) ? text : [text]), [text]);

  const getRandomSpeed = useCallback(() => {
    if (!variableSpeed) return typingSpeed;
    const { min, max } = variableSpeed;
    return Math.random() * (max - min) + min;
  }, [variableSpeed, typingSpeed]);

  const getCurrentTextColor = () => {
    if (textColors.length === 0) return 'inherit';
    return textColors[currentTextIndex % textColors.length];
  };

  // Lazy-Start: erst animieren wenn der Container im Viewport ist
  useEffect(() => {
    if (!startOnVisible || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setIsVisible(true);
        });
      },
      { threshold: 0.1 }
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [startOnVisible]);

  // Cursor-Blink mit GSAP — yoyo-Loop
  useEffect(() => {
    if (!showCursor || !cursorRef.current) return;

    gsap.set(cursorRef.current, { opacity: 1 });
    // Blinken ist eine Dauer-Animation ohne Stopp-Möglichkeit — WCAG 2.2.2
    // nennt "blinking" ausdrücklich. Bei reduzierter Bewegung bleibt der
    // Cursor sichtbar stehen.
    if (reducedMotion) return;

    const tween = gsap.to(cursorRef.current, {
      opacity: 0,
      duration: cursorBlinkDuration,
      repeat: -1,
      yoyo: true,
      ease: 'power2.inOut',
    });
    return () => {
      tween.kill();
    };
  }, [showCursor, cursorBlinkDuration, reducedMotion]);

  // Type/Delete-Schleife
  useEffect(() => {
    if (!isVisible) return;
    // Bewegung reduzieren: keine Tipp-/Löschschleife. WCAG 2.2.2 — die
    // Animation lief bisher dauerhaft und ließ sich nicht anhalten.
    // MotionConfig greift hier nicht, das sind setTimeout-Ketten. Was
    // stattdessen angezeigt wird, steht unten bei `visibleText`.
    if (reducedMotion) return;

    let timeout: ReturnType<typeof setTimeout>;

    const currentText = textArray[currentTextIndex];
    const processedText = reverseMode ? currentText.split('').reverse().join('') : currentText;

    const executeTypingAnimation = () => {
      if (isDeleting) {
        if (displayedText === '') {
          setIsDeleting(false);
          if (currentTextIndex === textArray.length - 1 && !loop) return;

          if (onSentenceComplete) {
            onSentenceComplete(textArray[currentTextIndex], currentTextIndex);
          }

          setCurrentTextIndex((prev) => (prev + 1) % textArray.length);
          setCurrentCharIndex(0);
          timeout = setTimeout(() => {
            // No-op — Pause zwischen Texten
          }, pauseDuration);
        } else {
          timeout = setTimeout(() => {
            setDisplayedText((prev) => prev.slice(0, -1));
          }, deletingSpeed);
        }
      } else {
        if (currentCharIndex < processedText.length) {
          timeout = setTimeout(
            () => {
              setDisplayedText((prev) => prev + processedText[currentCharIndex]);
              setCurrentCharIndex((prev) => prev + 1);
            },
            variableSpeed ? getRandomSpeed() : typingSpeed
          );
        } else if (textArray.length > 1) {
          if (!loop && currentTextIndex === textArray.length - 1) return;
          timeout = setTimeout(() => {
            setIsDeleting(true);
          }, pauseDuration);
        }
      }
    };

    if (currentCharIndex === 0 && !isDeleting && displayedText === '') {
      timeout = setTimeout(executeTypingAnimation, initialDelay);
    } else {
      executeTypingAnimation();
    }

    return () => clearTimeout(timeout);
  }, [
    currentCharIndex,
    displayedText,
    isDeleting,
    typingSpeed,
    deletingSpeed,
    pauseDuration,
    textArray,
    currentTextIndex,
    loop,
    initialDelay,
    isVisible,
    reverseMode,
    variableSpeed,
    getRandomSpeed,
    onSentenceComplete,
    reducedMotion,
  ]);

  /*
   * Bei reduzierter Bewegung steht der erste Satz statisch da.
   *
   * Vorher schrieb der Effect dafür `displayedText` und `currentCharIndex`
   * per setState — drei synchrone Aufrufe im Effect-Körper
   * (react-hooks/set-state-in-effect). Abgeleitet braucht es sie nicht: der
   * Tipp-State bleibt unberührt und damit in sich stimmig. Der Kommentar zur
   * Index-Synchronisation ist deshalb entfallen — die Verdopplung, gegen die
   * er sich richtete, kann so gar nicht mehr entstehen.
   *
   * Eine Verhaltensänderung bleibt: schaltet jemand die Präferenz zur
   * Laufzeit ab, tippt die Schleife den ersten Satz neu, statt hinter dem
   * fertigen Satz weiterzulaufen.
   */
  const visibleText = reducedMotion ? (textArray[0] ?? '') : displayedText;

  const shouldHideCursor =
    hideCursorWhileTyping &&
    // Ohne Tipp-Schleife tippt nichts, was den Cursor verstecken müsste —
    // sonst bliebe er bei reduzierter Bewegung dauerhaft ausgeblendet.
    !reducedMotion &&
    (currentCharIndex < textArray[currentTextIndex].length || isDeleting);

  /*
   * Als JSX statt createElement.
   *
   * Die Ref lag vorher im Props-Objekt, das an createElement übergeben wurde
   * — ein Funktionsaufruf, der sie im Render entgegennimmt und damit lesen
   * könnte (react-hooks/refs). In JSX übergibt React sie selbst, erst beim
   * Commit. Die `key`s entfallen mit der Kinder-Liste.
   */
  return (
    <Component ref={containerRef} className={`text-type ${className}`} {...props}>
      <span className="text-type__content" style={{ color: getCurrentTextColor() }}>
        {visibleText}
      </span>
      {showCursor && (
        <span
          ref={cursorRef}
          className={`text-type__cursor ${cursorClassName} ${
            shouldHideCursor ? 'text-type__cursor--hidden' : ''
          }`}
        >
          {cursorCharacter}
        </span>
      )}
    </Component>
  );
};

export default TextType;
