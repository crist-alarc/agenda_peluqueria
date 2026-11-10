'use client';

import { Button, Input } from '@agenda/ui';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';

type Range = { weekday: number; start: string; end: string };

const DAYS = [1, 2, 3, 4, 5, 6, 0];
const NAMES = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

/**
 * Editor del horario semanal por tramos. Solo arma los datos: la validación
 * (tramos válidos y sin solapes) se hace en el servidor con @agenda/core.
 */
export function HoursEditor({
  name,
  initial,
  emptyLabel = 'Cerrado',
}: {
  name: string;
  initial: Range[];
  emptyLabel?: string;
}) {
  const [ranges, setRanges] = useState<Range[]>(initial.map((r) => ({ ...r, start: r.start.slice(0, 5), end: r.end.slice(0, 5) })));

  const update = (index: number, patch: Partial<Range>) =>
    setRanges((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  const add = (weekday: number) => {
    const sameDay = ranges.filter((r) => r.weekday === weekday);
    const last = sameDay[sameDay.length - 1];
    const start = last ? last.end : '10:00';
    const startHour = Number(start.slice(0, 2));
    const end = `${String(Math.min(startHour + 4, 23)).padStart(2, '0')}:${start.slice(3, 5)}`;
    setRanges((prev) => [...prev, { weekday, start, end: end > start ? end : '23:59' }]);
  };

  const copyMonday = () => {
    const monday = ranges.filter((r) => r.weekday === 1);
    setRanges((prev) => [
      ...prev.filter((r) => r.weekday === 1 || r.weekday === 0),
      ...[2, 3, 4, 5, 6].flatMap((weekday) => monday.map((r) => ({ ...r, weekday }))),
    ]);
  };

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(ranges)} />
      {DAYS.map((weekday) => {
        const items = ranges.map((r, index) => ({ r, index })).filter(({ r }) => r.weekday === weekday);
        return (
          <div key={weekday} className="flex flex-wrap items-center gap-2 border-b py-2 last:border-b-0">
            <span className="w-24 text-sm font-medium">{NAMES[weekday]}</span>
            <div className="flex flex-1 flex-wrap gap-2">
              {items.length === 0 && <span className="text-sm text-muted-foreground">{emptyLabel}</span>}
              {items.map(({ r, index }) => (
                <div key={index} className="flex items-center gap-1">
                  <Input
                    type="time"
                    aria-label={`${NAMES[weekday]} inicio`}
                    className="h-9 w-28"
                    value={r.start}
                    onChange={(e) => update(index, { start: e.target.value })}
                  />
                  <span className="text-muted-foreground">–</span>
                  <Input
                    type="time"
                    aria-label={`${NAMES[weekday]} término`}
                    className="h-9 w-28"
                    value={r.end}
                    onChange={(e) => update(index, { end: e.target.value })}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Quitar tramo del ${NAMES[weekday]}`}
                    onClick={() => setRanges((prev) => prev.filter((_, i) => i !== index))}
                  >
                    <X />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              aria-label={`Agregar tramo el ${NAMES[weekday]}`}
              onClick={() => add(weekday)}
            >
              <Plus /> Tramo
            </Button>
          </div>
        );
      })}
      <Button type="button" variant="ghost" size="xs" onClick={copyMonday}>
        Copiar el lunes a martes–sábado
      </Button>
    </div>
  );
}
