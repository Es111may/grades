'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

type Skill = { id: number; name: string; taxonomyCode: string };

export default function SkillCombobox({
  skills,
  value,
  onChange,
  placeholder = '+ навык…',
}: {
  skills: Skill[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Display text: selected skill name OR query
  const selected = useMemo(
    () => (value ? skills.find((s) => s.id === value) ?? null : null),
    [skills, value],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return skills.slice(0, 30);
    return skills
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.taxonomyCode.toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [skills, query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  function pick(skill: Skill) {
    onChange(skill.id);
    setQuery('');
    setOpen(false);
  }

  function handleKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, filtered.length - 1));
      setOpen(true);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && filtered[highlight]) pick(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'Backspace' && !query && selected) {
      onChange(null);
    }
  }

  return (
    <div className="relative flex-1" ref={wrapRef}>
      <input
        type="text"
        value={selected && !open ? `${selected.taxonomyCode} · ${selected.name}` : query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setHighlight(0);
          if (selected) onChange(null);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKey}
        placeholder={placeholder}
        className="w-full text-xs bg-canvas border border-cloud rounded px-2 py-1 focus:outline-none focus:border-lime"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute left-0 right-0 top-full mt-1 bg-white border border-cloud rounded shadow-soft-lg z-10 max-h-60 overflow-y-auto">
          {filtered.map((s, i) => (
            <li
              key={s.id}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(s);
              }}
              onMouseEnter={() => setHighlight(i)}
              className={`px-2 py-1.5 text-xs cursor-pointer flex items-baseline gap-2 ${
                i === highlight ? 'bg-canvas' : ''
              }`}
            >
              <span className="text-ash uppercase tracking-widest text-[10px] w-8 shrink-0">
                {s.taxonomyCode}
              </span>
              <span className="truncate">{s.name}</span>
            </li>
          ))}
        </ul>
      )}
      {open && filtered.length === 0 && query && (
        <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-cloud rounded shadow-soft px-2 py-1.5 text-xs text-ash italic">
          ничего не найдено
        </div>
      )}
    </div>
  );
}
