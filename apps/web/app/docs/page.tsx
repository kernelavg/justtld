'use client';

import * as React from 'react';
import { BookOpen, Code2, Database, Network, ShieldCheck, Terminal } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useI18n } from '@/lib/i18n';
import { useApiData } from '@/lib/hooks';
import type { ContractsInfo } from '@/lib/api';

const API_ROUTES: Array<[string, string, string]> = [
  ['GET', '/api/zones', 'Список зон: page, limit, status, owner, q, sort'],
  ['GET', '/api/zones/:tld', 'Зона из кэша + состояние в контракте'],
  ['GET', '/api/zones/:tld/history', 'История событий зоны'],
  ['GET', '/api/stats', 'Аналитика реестра'],
  ['GET', '/api/search?q=', 'Поиск + проверка доступности'],
  ['GET', '/api/health', 'Здоровье БД, узла, контракта и индексатора'],
  ['POST', '/api/zones/prepare-registration', 'Неподписанная tx registerTLD'],
  ['POST', '/api/zones/prepare-transfer', 'Неподписанная tx transferTLD'],
  ['POST', '/api/zones/prepare-renewal', 'Неподписанная tx renewTLD'],
  ['POST', '/api/zones/prepare-metadata', 'Неподписанная tx setTLDMetadata'],
  ['POST', '/api/zones/confirm', 'Проверка чек-рецепта + обновление кэша'],
  ['POST', '/api/admin/zones/:tld/block', 'Блокировка зоны (только админ)'],
  ['POST', '/api/admin/zones/:tld/unblock', 'Разблокировка зоны (только админ)'],
  ['POST', '/api/auth/nonce', 'Nonce для входа по подписи'],
  ['POST', '/api/auth/verify', 'Проверка подписи и выдача сессии'],
  ['POST', '/api/admin/resync', 'Команда индексатору: переиндексация'],
];

const CONTRACT_FUNCTIONS: Array<[string, string]> = [
  ['registerTLD(string tld, string metadata)', 'Регистрация: владелец = msg.sender, срок 365 дней'],
  ['transferTLD(string tld, address newOwner)', 'Передача только владельцем зоны'],
  ['renewTLD(string tld)', '+365 дней только владельцем'],
  ['setTLDMetadata(string tld, string metadata)', 'Обновление метаданных владельцем'],
  ['getTLD(string tld)', 'Полная информация о зоне'],
  ['ownerOf(string tld)', 'Адрес владельца'],
  ['exists(string tld)', 'Наличие зоны'],
  ['totalZones()', 'Количество зон'],
  ['blockTLD / unblockTLD', 'Только owner контракта'],
  ['pause / unpause', 'Pausable: блокирует мутации'],
];

export default function DocsPage() {
  const { t, language } = useI18n();
  const contracts = useApiData<ContractsInfo>('/api/contracts');
  const ru = language === 'ru';

  return (
    <div className="container py-10">
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight">{t('docs.title')}</h1>
        <p className="mt-2 text-muted-foreground">{t('docs.intro')}</p>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            icon: Network,
            label: 'RPC',
            value: contracts.data?.chain.rpcUrl ?? 'http://127.0.0.1:8545',
          },
          { icon: Code2, label: 'chainId', value: String(contracts.data?.chain.id ?? 31337) },
          {
            icon: ShieldCheck,
            label: 'Contract',
            value: contracts.data?.contract?.address ?? 'не развёрнут',
          },
          { icon: Database, label: 'Админ', value: contracts.data?.adminAddress ?? '—' },
        ].map((item) => (
          <Card key={item.label}>
            <CardContent className="space-y-1 p-4">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
                <item.icon className="h-3.5 w-3.5" /> {item.label}
              </div>
              <div className="mono break-all text-xs">{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Terminal className="h-4 w-4" /> {ru ? 'Быстрый старт' : 'Quick start'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="mono overflow-x-auto rounded-md bg-muted p-3 text-xs leading-relaxed">{`npm install
npm run start:all     # сеть + БД + контракт + indexer + web

# или по шагам
npm run chain         # EVM :8545
npm run deploy        # контракт
npm run indexer       # синхронизация
npm run dev           # приложение :3000`}</pre>
            <p className="mt-2 text-xs text-muted-foreground">
              {ru
                ? 'Остановка: Ctrl+C или npm run stop:all. Перезапуск: npm run start:all.'
                : 'Stop: Ctrl+C or npm run stop:all. Restart: npm run start:all.'}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <BookOpen className="h-4 w-4" /> {ru ? 'Правила зон' : 'Zone rules'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>
              {ru
                ? '• Начинается с точки, длина 3–21 символ.'
                : '• Starts with a dot, length 3–21.'}
            </p>
            <p>
              {ru
                ? '• Только a-z, 0-9 и дефис; без «--» и дефиса по краям.'
                : '• Only a-z, 0-9 and hyphen; no "--" or edge hyphens.'}
            </p>
            <p>
              {ru
                ? '• Приводится к нижнему регистру: .MyZone = .myzone.'
                : '• Normalized to lower case: .MyZone = .myzone.'}
            </p>
            <p>
              {ru
                ? '• Резерв: .eth .com .net .org .gov .edu .io .ai .sol .local + настраиваемый список.'
                : '• Reserved: .eth .com .net .org .gov .edu .io .ai .sol .local + configurable list.'}
            </p>
            <p>
              {ru
                ? '• Запрещённые подстроки (blacklist) задаются owner контракта.'
                : '• Blacklisted substrings are configured by the contract owner.'}
            </p>
            <p>
              {ru
                ? '• Срок 365 дней; истёкшую зону можно перехватить после 30 дней грейса (allowReclaim).'
                : '• Term is 365 days; an expired zone can be reclaimed after a 30-day grace (allowReclaim).'}
            </p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">{ru ? 'API' : 'API'}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Method</th>
                <th className="py-2 pr-3">Path</th>
                <th className="py-2">{ru ? 'Описание' : 'Description'}</th>
              </tr>
            </thead>
            <tbody>
              {API_ROUTES.map(([method, path, description]) => (
                <tr key={`${method}-${path}`} className="border-b last:border-0">
                  <td className="py-2 pr-3">
                    <Badge variant={method === 'GET' ? 'secondary' : 'default'}>{method}</Badge>
                  </td>
                  <td className="mono py-2 pr-3 text-xs">{path}</td>
                  <td className="py-2 text-xs text-muted-foreground">{description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">JustTLDRegistry.sol</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {CONTRACT_FUNCTIONS.map(([fn, description]) => (
            <div
              key={fn}
              className="flex flex-col gap-1 border-b pb-2 last:border-0 sm:flex-row sm:items-center sm:justify-between"
            >
              <span className="mono text-xs">{fn}</span>
              <span className="text-xs text-muted-foreground">{description}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">{ru ? 'Безопасность' : 'Security'}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <p>
            {ru
              ? '• Приватные ключи не хранятся на сервере: подписывает только кошелёк.'
              : '• No private keys on the server: only the wallet signs.'}
          </p>
          <p>
            {ru
              ? '• Права проверяются в контракте (ownerOf, paused, isBlocked).'
              : '• Permissions are checked on-chain (ownerOf, paused, isBlocked).'}
          </p>
          <p>
            {ru
              ? '• Zod-валидация, rate limiting, CSP, CSRF, анти-replay nonce.'
              : '• Zod validation, rate limiting, CSP, CSRF, anti-replay nonce.'}
          </p>
          <p>
            {ru
              ? '• Админ-панель: вход по подписи + CSRF-токен + аудит-лог.'
              : '• Admin panel: signature login + CSRF token + audit log.'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
