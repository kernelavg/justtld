import Link from 'next/link';
import { Compass } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * 404 — страница для любого несуществующего маршрута.
 * Серверный компонент: не зависит от клиентского состояния и темы.
 */
export default function NotFound() {
  return (
    <div className="container flex min-h-[60vh] flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full border bg-muted/40">
        <Compass className="h-6 w-6 text-muted-foreground" />
      </div>
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">404 — зона не найдена</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Такой страницы нет. Возможно, зона ещё не зарегистрирована или имя введено с опечаткой.
        </p>
        <p className="max-w-md text-xs text-muted-foreground">
          404 — page not found. The zone may not be registered yet, or the name has a typo.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href="/">На главную / Home</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/zones">Все зоны / All zones</Link>
        </Button>
        <Button asChild variant="ghost">
          <Link href="/register">Зарегистрировать / Register</Link>
        </Button>
      </div>
    </div>
  );
}
