import { Copy } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../../lib/cn';

// Ports docs/designs/extras.css `.settings-code`. Pre block used for
// shell-snippet examples (env vars, curl commands). Optional copy
// button mirrors the rest of the app's mono-string surfaces.
export interface SettingsCodeProps {
  code: string;
  copyable?: boolean;
  flush?: boolean;
}

export function SettingsCode({ code, copyable = true, flush = false }: SettingsCodeProps) {
  const [copied, setCopied] = useState(false);

  const onCopy = (): void => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div
      className={cn(
        'relative overflow-x-auto rounded-md border border-border-subtle bg-bg-base',
        flush ? '' : 'mx-4 my-3',
      )}
    >
      <pre className="whitespace-pre-wrap px-3.5 py-3 font-mono text-[11.5px] leading-[1.6] text-text-secondary">
        {code}
      </pre>
      {copyable && (
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy to clipboard"
          className={cn(
            'absolute right-2 top-2 rounded p-1 text-text-muted transition-colors',
            'hover:bg-bg-hover hover:text-text-primary',
          )}
          title={copied ? 'Copied' : 'Copy'}
        >
          <Copy size={11} />
        </button>
      )}
    </div>
  );
}
