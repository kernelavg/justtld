'use client';

import * as React from 'react';
import {
  Code2,
  ExternalLink,
  FilePlus2,
  FolderOpen,
  Globe,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import { toast } from 'sonner';
import type { SiteFileDto, SiteSettingsDto } from '@justtld/shared';
import {
  deleteSiteFile,
  getSiteFileContent,
  getSiteFiles,
  getSiteSubdomains,
  saveSiteFile,
  updateSiteSettings,
} from '@/lib/api';
import { useResolverDomain } from '@/components/zones/resolver-links';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input, Textarea } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle, Label } from '@/components/ui/primitives';

type Props = {
  tld: string;
  isOwner: boolean;
  hasSession: boolean;
  onRequireAuth?: () => void;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} МБ`;
}

function isTextType(mimeType: string, path: string): boolean {
  const lower = mimeType.toLowerCase();
  return (
    lower.startsWith('text/') ||
    lower.includes('javascript') ||
    lower.includes('json') ||
    lower.includes('svg') ||
    lower.includes('xml') ||
    /\.(html?|css|js|mjs|json|svg|txt|md|xml)$/i.test(path)
  );
}

export function SiteManager({ tld, isOwner, hasSession, onRequireAuth }: Props) {
  const resolverDomain = useResolverDomain();
  const [subLabel, setSubLabel] = React.useState('');
  const [subOptions, setSubOptions] = React.useState<string[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [settings, setSettings] = React.useState<SiteSettingsDto | null>(null);
  const [files, setFiles] = React.useState<SiteFileDto[]>([]);
  const [totalBytes, setTotalBytes] = React.useState(0);
  const [maxSiteBytes, setMaxSiteBytes] = React.useState(10 * 1024 * 1024);

  const [mode, setMode] = React.useState<'card' | 'hosting' | 'redirect'>('hosting');
  const [entryFile, setEntryFile] = React.useState('index.html');
  const [spaFallback, setSpaFallback] = React.useState(false);

  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);
  const [editorContent, setEditorContent] = React.useState('');
  const [editorIsText, setEditorIsText] = React.useState(true);
  const [editorLoading, setEditorLoading] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);

  const [newFilePath, setNewFilePath] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const cleanTld = tld.replace(/^\./, '');
  const siteUrl = subLabel
    ? `https://${subLabel}.${cleanTld}.${resolverDomain}`
    : `https://${cleanTld}.${resolverDomain}`;
  const previewApiUrl = `/api/site-serve?zone=${encodeURIComponent(cleanTld)}&label=${encodeURIComponent(subLabel)}&path=%2F`;

  React.useEffect(() => {
    getSiteSubdomains(tld)
      .then((res) => {
        const names = new Set<string>();
        for (const s of res.onchain) names.add(s.label);
        for (const c of res.custody) if (c.subLabel) names.add(c.subLabel);
        setSubOptions(Array.from(names).sort());
      })
      .catch(() => setSubOptions([]));
  }, [tld]);

  const loadFiles = React.useCallback(async () => {
    if (!hasSession) return;
    setLoading(true);
    setError(null);
    try {
      const res = await getSiteFiles(tld, subLabel);
      setSettings(res.settings);
      setFiles(res.files);
      setTotalBytes(res.totalBytes);
      setMaxSiteBytes(res.maxSiteBytes);

      setMode(res.settings?.mode ?? 'card');
      setEntryFile(res.settings?.entryFile ?? 'index.html');
      setSpaFallback(res.settings?.spaFallback ?? false);

      if (res.files.length > 0) {
        const first =
          res.files.find((f) => f.path === 'index.html') ??
          res.files.find((f) => isTextType(f.mimeType, f.path)) ??
          res.files[0];
        if (first) {
          setSelectedPath(first.path);
        }
      } else {
        setSelectedPath(null);
        setEditorContent('');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить файлы сайта');
    } finally {
      setLoading(false);
    }
  }, [hasSession, tld, subLabel]);

  React.useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  const openFile = React.useCallback(
    async (filePath: string) => {
      setSelectedPath(filePath);
      setEditorLoading(true);
      setDirty(false);
      try {
        const res = await getSiteFileContent(tld, filePath, subLabel);
        setEditorIsText(res.isText);
        setEditorContent(res.content ?? '');
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Ошибка чтения файла');
      } finally {
        setEditorLoading(false);
      }
    },
    [tld, subLabel],
  );

  React.useEffect(() => {
    if (selectedPath && hasSession) {
      void openFile(selectedPath);
    }
  }, [selectedPath, hasSession, openFile]);

  const saveCurrentFile = async () => {
    if (!selectedPath || !editorIsText) return;
    setBusy(true);
    try {
      await saveSiteFile(tld, { path: selectedPath, content: editorContent }, subLabel);
      setDirty(false);
      toast.success(`Файл ${selectedPath} сохранён`);
      const res = await getSiteFiles(tld, subLabel);
      setFiles(res.files);
      setTotalBytes(res.totalBytes);
      setSettings(res.settings);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Не удалось сохранить файл');
    } finally {
      setBusy(false);
    }
  };

  const createNewFile = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = newFilePath.trim().replace(/^\/+/, '');
    if (!cleaned) return;
    setBusy(true);
    try {
      const template = cleaned.endsWith('.html')
        ? `<!doctype html>\n<html lang="ru">\n<head>\n  <meta charset="utf-8" />\n  <title>${subLabel ? `${subLabel}.${tld}` : tld}</title>\n</head>\n<body>\n  <h1>${cleaned}</h1>\n</body>\n</html>\n`
        : cleaned.endsWith('.css')
          ? `body {\n  font-family: system-ui, sans-serif;\n}\n`
          : '';
      await saveSiteFile(tld, { path: cleaned, content: template }, subLabel);
      setNewFilePath('');
      toast.success(`Файл ${cleaned} создан`);
      await loadFiles();
      setSelectedPath(cleaned);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка создания файла');
    } finally {
      setBusy(false);
    }
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setBusy(true);
    try {
      let uploaded = 0;
      for (const f of Array.from(fileList)) {
        const buf = await f.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]!);
        }
        const base64 = btoa(binary);
        await saveSiteFile(
          tld,
          {
            path: f.name,
            contentBase64: base64,
            mimeType: f.type || undefined,
          },
          subLabel,
        );
        uploaded += 1;
      }
      toast.success(`Загружено файлов: ${uploaded}`);
      await loadFiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка загрузки файла');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDeleteFile = async (filePath: string) => {
    setBusy(true);
    try {
      await deleteSiteFile(tld, filePath, subLabel);
      toast.success(`Удалён ${filePath}`);
      if (selectedPath === filePath) {
        setSelectedPath(null);
        setEditorContent('');
      }
      await loadFiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка удаления');
    } finally {
      setBusy(false);
    }
  };

  const saveSettings = async (seedStarter = false) => {
    setBusy(true);
    try {
      const res = await updateSiteSettings(
        tld,
        {
          mode: seedStarter ? 'hosting' : mode,
          entryFile: entryFile.trim() || 'index.html',
          spaFallback,
          seedStarter,
        },
        subLabel,
      );
      setSettings(res.settings);
      setMode(res.settings.mode);
      setFiles(res.files);
      toast.success(
        seedStarter ? 'Стартовый шаблон развёрнут и хостинг включён' : 'Настройки сайта сохранены',
      );
      await loadFiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Ошибка сохранения настроек');
    } finally {
      setBusy(false);
    }
  };

  if (!hasSession) {
    return (
      <Alert>
        <Globe className="h-4 w-4" />
        <AlertTitle>Требуется авторизация владельца</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>
            Чтобы управлять файлами сайта и настройками хостинга для {tld}, войдите по Email или
            подпишите вход кошельком.
          </span>
          {onRequireAuth && (
            <Button size="sm" onClick={onRequireAuth}>
              Войти для управления
            </Button>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (!isOwner) {
    return (
      <Alert>
        <Globe className="h-4 w-4" />
        <AlertTitle>Только для владельца зоны</AlertTitle>
        <AlertDescription>
          Хостинг и файловый менеджер доступны только владельцу зоны {tld} или администратору.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Globe className="h-5 w-5 text-primary" />
                Встроенный хостинг и файлы сайта
              </CardTitle>
              <CardDescription className="mt-1">
                Файлы хранятся в PostgreSQL и мгновенно раздаются по домену{' '}
                <span className="mono font-medium text-foreground">{siteUrl}</span>
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" size="sm" asChild className="gap-1.5">
                <a href={previewApiUrl} target="_blank" rel="noreferrer">
                  Предпросмотр <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
              <Button size="sm" asChild className="gap-1.5">
                <a href={siteUrl} target="_blank" rel="noreferrer">
                  Открыть сайт <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="space-y-1.5">
              <Label>Домен / Поддомен</Label>
              <select
                value={subLabel}
                onChange={(e) => {
                  setSubLabel(e.target.value);
                  setSelectedPath(null);
                }}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">{cleanTld} (корневая зона)</option>
                {subOptions.map((sub) => (
                  <option key={sub} value={sub}>
                    {sub}.{cleanTld}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label>Режим работы</Label>
              <select
                value={mode}
                onChange={(e) => setMode(e.target.value as 'card' | 'hosting' | 'redirect')}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="hosting">Встроенный хостинг (файлы из БД)</option>
                <option value="redirect">Переадресация (URL из метаданных зоны)</option>
                <option value="card">Карточка домена (по умолчанию)</option>
              </select>
            </div>

            {mode === 'redirect' ? (
              <div className="flex items-end pb-2 md:col-span-2">
                <p className="text-xs text-muted-foreground">
                  При режиме переадресации используется поле <code className="mono">url</code> из
                  метаданных зоны (кнопка «Метаданные» в шапке зоны).
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Входной файл</Label>
                  <Input
                    value={entryFile}
                    onChange={(e) => setEntryFile(e.target.value)}
                    placeholder="index.html"
                  />
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={spaFallback}
                      onChange={(e) => setSpaFallback(e.target.checked)}
                    />
                    SPA fallback (отдавать {entryFile || 'index.html'})
                  </label>
                </div>
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Badge variant={settings?.mode === 'hosting' ? 'success' : 'secondary'}>
                {settings?.mode === 'hosting'
                  ? 'Хостинг активен'
                  : settings?.mode === 'redirect'
                    ? 'Редирект'
                    : 'Хостинг выкл.'}
              </Badge>
              <span>
                Занято: {formatBytes(totalBytes)} из {formatBytes(maxSiteBytes)}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => saveSettings(true)}
                className="gap-1.5"
              >
                <Sparkles className="h-3.5 w-3.5" />
                Развернуть стартовый сайт
              </Button>
              <Button
                size="sm"
                disabled={busy}
                onClick={() => saveSettings(false)}
                className="gap-1.5"
              >
                <Save className="h-3.5 w-3.5" />
                Сохранить режим
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && (
        <Alert variant="destructive">
          <AlertTitle>Ошибка</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <FolderOpen className="h-4 w-4 text-primary" />
                Файлы ({files.length})
              </CardTitle>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void loadFiles()}
                disabled={loading}
                aria-label="Обновить"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <form onSubmit={createNewFile} className="flex gap-1.5">
              <Input
                value={newFilePath}
                onChange={(e) => setNewFilePath(e.target.value)}
                placeholder="style.css или about.html"
                className="h-9 text-xs"
              />
              <Button type="submit" size="sm" disabled={busy || !newFilePath.trim()} className="gap-1">
                <FilePlus2 className="h-3.5 w-3.5" />
              </Button>
            </form>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(e) => void handleUploadFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="w-full gap-2"
              >
                <Upload className="h-3.5 w-3.5" />
                Загрузить файлы с компьютера
              </Button>
            </div>

            <div className="max-h-[420px] space-y-1 overflow-y-auto pr-1">
              {files.length === 0 ? (
                <p className="py-6 text-center text-xs text-muted-foreground">
                  Файлов пока нет. Создайте `index.html` или нажмите «Развернуть стартовый сайт».
                </p>
              ) : (
                files.map((file) => {
                  const active = selectedPath === file.path;
                  return (
                    <div
                      key={file.id}
                      className={`flex items-center justify-between gap-2 rounded-md border px-2.5 py-2 text-xs transition ${
                        active ? 'border-primary bg-primary/10' : 'hover:bg-accent/50'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedPath(file.path);
                        }}
                        className="min-w-0 flex-1 text-left"
                      >
                        <div className="mono truncate font-medium">{file.path}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {formatBytes(file.sizeBytes)}
                        </div>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-muted-foreground hover:text-destructive"
                        onClick={() => void handleDeleteFile(file.path)}
                        aria-label={`Удалить ${file.path}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  );
                })
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-8">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Code2 className="h-4 w-4 text-primary" />
                <span className="mono">{selectedPath ?? 'Выберите файл'}</span>
                {dirty && <Badge variant="warning">Не сохранено</Badge>}
              </CardTitle>
              {selectedPath && editorIsText && (
                <Button
                  size="sm"
                  disabled={busy || editorLoading}
                  onClick={() => void saveCurrentFile()}
                  className="gap-1.5"
                >
                  <Save className="h-3.5 w-3.5" />
                  Сохранить файл
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!selectedPath ? (
              <div className="grid min-h-[340px] place-items-center rounded-md border border-dashed text-sm text-muted-foreground">
                Выберите файл слева или создайте новый, чтобы отредактировать код сайта.
              </div>
            ) : editorLoading ? (
              <div className="grid min-h-[340px] place-items-center text-sm text-muted-foreground">
                Загрузка файла…
              </div>
            ) : !editorIsText ? (
              <div className="grid min-h-[340px] place-items-center rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                Это бинарный файл (изображение/шрифт). Он хранится в БД и уже доступен на сайте по
                пути <span className="mono text-foreground">/{selectedPath}</span>.
              </div>
            ) : (
              <Textarea
                value={editorContent}
                onChange={(e) => {
                  setEditorContent(e.target.value);
                  setDirty(true);
                }}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
                    e.preventDefault();
                    void saveCurrentFile();
                  }
                }}
                className="mono min-h-[420px] resize-y text-xs leading-relaxed"
                spellCheck={false}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
