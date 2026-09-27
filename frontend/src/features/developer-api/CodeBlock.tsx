import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RiCheckLine, RiFileCopyLine } from '@remixicon/react';
import { Button } from '../../components/base/buttons/button';
import { cx } from '../../utils/cx';

const COPIED_TIMEOUT_MS = 2000;

interface CodeBlockProps {
  code: string;
  /** Names the copy button for screen readers, e.g. "Copy key" or "Copy curl example". */
  copyLabel?: string;
  className?: string;
}

/**
 * The one monospace box + Copy button used both for the just-created secret
 * (Settings) and the quick-start snippets (the public Developers page) — a
 * look-alike part shared as one component rather than two near-identical
 * ones.
 */
export function CodeBlock({ code, copyLabel, className }: CodeBlockProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => setCopied(false), COPIED_TIMEOUT_MS);
    } catch {
      // Clipboard access can be denied (permissions, insecure context); the
      // code stays visible and selectable either way, so there's nothing
      // else to show for a failed copy.
    }
  }

  return (
    <div
      className={cx(
        'flex items-start gap-2 rounded-2xl border border-border-table bg-background-secondary-default p-3',
        className,
      )}
    >
      <pre className="min-w-0 flex-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-body-2-regular text-text-primary">
        {code}
      </pre>
      <Button
        type="button"
        variant="secondary"
        size="small"
        leadingIcon={copied ? RiCheckLine : RiFileCopyLine}
        onClick={copy}
        // Announces the done state itself once copied, rather than keeping
        // a caller-specific label ("Copy key") that would no longer match
        // what the button now says.
        aria-label={copied ? t('developerApi.copied') : copyLabel}
        className="shrink-0"
      >
        {copied ? t('developerApi.copied') : t('developerApi.copy')}
      </Button>
    </div>
  );
}
