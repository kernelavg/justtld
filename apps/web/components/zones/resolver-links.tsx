'use client';

import * as React from 'react';
import { Check, Copy, ExternalLink, Globe2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { buildResolverLinks } from '@/lib/metadata';

export function useResolverDomain(): string {
  return process.env.NEXT_PUBLIC_RESOLVER_DOMAIN || 'justtld.online';
}

export function CopyUrlButton({ url, label }: { url: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success('Адрес скопирован');
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error('Не удалось скопировать');
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 gap-1 px-2 text-xs"
      onClick={copy}
      title="Скопировать ссылку"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {label ? <span>{label}</span> : null}
    </Button>
  );
}

/** Карточка рабочих адресов резолвера для зоны или конкретного поддомена. */
export function ResolverLinksCard({
  tld,
  label,
  compact = false,
}: {
  tld: string;
  label?: string | null;
  compact?: boolean;
}) {
  const domain = useResolverDomain();
  const links = React.useMemo(
    () => buildResolverLinks({ tld, label, baseDomain: domain }),
    [tld, label, domain],
  );

  return (
    <div className={compact ? 'space-y-2' : 'space-y-2.5'}>
      <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <Globe2 className="h-3.5 w-3.5 text-primary" />
        <span>{label ? 'Адреса поддомена в резолвере' : 'Адреса зоны в резолвере'}</span>
      </div>
      <div className="space-y-1.5">
        {links.map((item) => (
          <div
            key={item.url}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/30 px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-medium text-muted-foreground">{item.label}</span>
                {item.recommended ? (
                  <Badge variant="outline" className="h-4 px-1.5 text-[10px]">
                    основной
                  </Badge>
                ) : null}
              </div>
              <a
                href={item.url}
                target="_blank"
                rel="noreferrer"
                className="mono block truncate text-xs text-foreground underline decoration-dotted underline-offset-2 hover:text-primary"
              >
                {item.url}
              </a>
            </div>
            <div className="flex items-center gap-1">
              <CopyUrlButton url={item.url} />
              <Button asChild size="sm" variant="outline" className="h-7 px-2 text-xs">
                <a href={item.url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
