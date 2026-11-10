'use client';

import { Button, Input, Select } from '@agenda/ui';
import { Plus, X } from 'lucide-react';
import { useState } from 'react';

type Requirement = { resourceType: 'person' | 'space' | 'equipment'; quantity: number; requiredSkill: string };

const TYPES = { person: 'Persona', space: 'Espacio', equipment: 'Equipo' } as const;

/** Editor de los recursos que requiere un servicio. La validación ocurre en el servidor. */
export function RequirementsEditor({ name, initial }: { name: string; initial: Requirement[] }) {
  const [items, setItems] = useState<Requirement[]>(initial);
  const update = (index: number, patch: Partial<Requirement>) =>
    setItems((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(items)} />
      {items.length === 0 && <p className="text-sm text-muted-foreground">Sin requisitos de recursos.</p>}
      {items.map((r, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={1}
            max={50}
            aria-label="Cantidad"
            className="h-9 w-20"
            value={r.quantity}
            onChange={(e) => update(index, { quantity: Number(e.target.value) })}
          />
          <Select
            aria-label="Tipo de recurso"
            className="h-9 w-36"
            value={r.resourceType}
            onChange={(e) => update(index, { resourceType: e.target.value as Requirement['resourceType'] })}
          >
            {Object.entries(TYPES).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
          <Input
            aria-label="Habilidad requerida"
            placeholder="Habilidad (opcional), ej. barberia"
            className="h-9 min-w-48 flex-1"
            value={r.requiredSkill}
            onChange={(e) => update(index, { requiredSkill: e.target.value })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Quitar requisito"
            onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
          >
            <X />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={() => setItems((prev) => [...prev, { resourceType: 'person', quantity: 1, requiredSkill: '' }])}
      >
        <Plus /> Agregar requisito
      </Button>
    </div>
  );
}
