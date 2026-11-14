import { useEffect, useState } from 'react';
import { Markdown } from './markdown';
import { useMotionPaused } from './motion';
import { revealStep } from './smooth-text';

interface StreamingMarkdownProps {
  text: string;
  streaming: boolean;
  onCitation?: (id: string) => void;
}

const REVEAL_INTERVAL = 33;

export function StreamingMarkdown({ text, streaming, onCitation }: StreamingMarkdownProps) {
  const reduced = useMotionPaused();
  const [shown, setShown] = useState(streaming && !reduced ? 0 : text.length);

  useEffect(() => {
    if (reduced) {
      setShown(text.length);
      return;
    }
    if (shown >= text.length) return;
    const timer = setTimeout(() => setShown((cur) => revealStep(cur, text.length)), REVEAL_INTERVAL);
    return () => clearTimeout(timer);
  }, [text, reduced, shown]);

  const active = !reduced && (streaming || shown < text.length);
  return (
    <Markdown text={active ? text.slice(0, shown) : text} streaming={active} onCitation={onCitation} />
  );
}
