'use client';

import * as React from 'react';
import { METADATA_MAX_LENGTH } from '@justtld/shared';
import { Input, Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/primitives';
import { buildMetadataJson, parseZoneMetadata } from '@/lib/metadata';
import { cn } from '@/lib/utils';

type MetadataEditorProps = {
  value: string;
  onChange: (nextValue: string) => void;
  idPrefix?: string;
};

/**
 * Удобный редактор метаданных: либо поля «Сайт / Заголовок / Описание» (сами
 * собираются в JSON для резолвера), либо режим прямого ввода JSON/текста.
 */
export function MetadataEditor({ value, onChange, idPrefix = 'meta' }: MetadataEditorProps) {
  const initial = React.useMemo(() => parseZoneMetadata(value), [value]);
  const [rawMode, setRawMode] = React.useState(
    Boolean(value.trim()) && !initial.isJson && !initial.url,
  );
  const [url, setUrl] = React.useState(initial.url ?? '');
  const [title, setTitle] = React.useState(initial.title ?? '');
  const [description, setDescription] = React.useState(initial.description ?? '');

  React.useEffect(() => {
    const parsed = parseZoneMetadata(value);
    if (!rawMode) {
      setUrl(parsed.url ?? '');
      setTitle(parsed.title ?? '');
      setDescription(parsed.description ?? '');
    }
    // синхронизация только при смене режима или открытии нового объекта
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawMode]);

  const bytes = React.useMemo(() => new TextEncoder().encode(value).length, [value]);
  const tooLong = bytes > METADATA_MAX_LENGTH;

  const updateFields = (next: { url?: string; title?: string; description?: string }) => {
    const nextUrl = next.url ?? url;
    const nextTitle = next.title ?? title;
    const nextDesc = next.description ?? description;
    setUrl(nextUrl);
    setTitle(nextTitle);
    setDescription(nextDesc);
    const built = buildMetadataJson({ url: nextUrl, title: nextTitle, description: nextDesc });
    onChange(built.json);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="inline-flex rounded-md bg-muted p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setRawMode(false)}
            className={cn(
              'rounded px-2.5 py-1 font-medium transition-colors',
              !rawMode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            Конструктор
          </button>
          <button
            type="button"
            onClick={() => setRawMode(true)}
            className={cn(
              'rounded px-2.5 py-1 font-medium transition-colors',
              rawMode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground',
            )}
          >
            Сырой JSON
          </button>
        </div>
        <span
          className={cn(
            'mono text-xs tabular-nums',
            tooLong ? 'font-semibold text-destructive' : 'text-muted-foreground',
          )}
        >
          {bytes}/{METADATA_MAX_LENGTH} Б
        </span>
      </div>

      {rawMode ? (
        <div className="space-y-1.5">
          <Textarea
            id={`${idPrefix}-raw`}
            rows={4}
            className="mono text-xs"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder='{"url":"https://example.com","title":"Мой проект"}'
          />
          <p className="text-[11px] text-muted-foreground">
            Резолвер автоматически перенаправляет на <code className="mono">url</code> /{' '}
            <code className="mono">site</code> / <code className="mono">redirect</code>{' '}
            (http/https).
          </p>
        </div>
      ) : (
        <div className="space-y-2.5 rounded-lg border bg-muted/25 p-3">
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-url`} className="text-xs">
              URL сайта или редиректа
            </Label>
            <Input
              id={`${idPrefix}-url`}
              type="url"
              value={url}
              onChange={(event) => updateFields({ url: event.target.value })}
              placeholder="https://example.com"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-title`} className="text-xs">
              Заголовок (опционально)
            </Label>
            <Input
              id={`${idPrefix}-title`}
              value={title}
              onChange={(event) => updateFields({ title: event.target.value })}
              placeholder="Например: Личный блог"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${idPrefix}-desc`} className="text-xs">
              Описание (опционально)
            </Label>
            <Input
              id={`${idPrefix}-desc`}
              value={description}
              onChange={(event) => updateFields({ description: event.target.value })}
              placeholder="Короткое описание для карточки резолвера"
            />
          </div>
          {value ? (
            <p className="mono truncate text-[11px] text-muted-foreground">JSON: {value}</p>
          ) : null}
        </div>
      )}
    </div>
  );
}
