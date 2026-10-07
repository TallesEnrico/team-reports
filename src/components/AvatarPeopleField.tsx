import { Check, Plus, UsersThree } from '@phosphor-icons/react';
import { type CSSProperties, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cx } from '../lib/cx';
import { Avatar } from './Avatar';
import styles from './AvatarPeopleField.module.css';

const VISIBLE = 5;

export interface AvatarPerson {
  id: string;
  name: string;
  avatarUrl?: string;
}

export interface AvatarPersonOption extends AvatarPerson {
  selected: boolean;
  kind?: 'person' | 'group' | 'all';
  detail?: string;
}

export interface AvatarPersonGroup {
  label?: string;
  options: AvatarPersonOption[];
}

interface MenuBox {
  left: number;
  width: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
}

interface AvatarPeopleFieldProps {
  inputId?: string;
  people: AvatarPerson[];
  self?: AvatarPerson;
  suggestions?: AvatarPerson[];
  groups: AvatarPersonGroup[];
  onToggle: (id: string) => void;
  onQueryChange?: (query: string) => void;
  filterLocally?: boolean;
  isLoading?: boolean;
  emptyText: string;
  searchPlaceholder?: string;
  emptyLabel?: string;
  summary?: string;
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function matches(option: AvatarPersonOption, query: string): boolean {
  if (!query) return true;
  return normalize(`${option.name} ${option.detail ?? ''}`).includes(query);
}

export function AvatarPeopleField({
  inputId,
  people,
  self,
  suggestions = [],
  groups,
  onToggle,
  onQueryChange,
  filterLocally = true,
  isLoading = false,
  emptyText,
  searchPlaceholder = 'Buscar pessoa',
  emptyLabel,
  summary,
}: AvatarPeopleFieldProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [box, setBox] = useState<MenuBox | null>(null);
  const closeRef = useRef<() => void>(() => {});

  const selectedIds = useMemo(() => new Set(people.map((person) => person.id)), [people]);

  const shown = useMemo(() => {
    const seen = new Set<string>();
    const faces: (AvatarPerson & { selected: boolean })[] = [];
    function add(person: AvatarPerson | undefined) {
      if (!person || seen.has(person.id) || faces.length >= VISIBLE) return;
      seen.add(person.id);
      faces.push({ ...person, selected: selectedIds.has(person.id) });
    }
    add(self);
    for (const person of people) add(person);
    for (const person of suggestions) add(person);
    return faces;
  }, [self, people, suggestions, selectedIds]);
  const extra = Math.max(0, people.length - VISIBLE);

  const visibleGroups = useMemo(() => {
    const needle = filterLocally ? normalize(query.trim()) : '';
    const browsing = query.trim().length === 0;
    const remote = !filterLocally && !browsing;
    const filtered = groups
      .map((group) => ({
        ...group,
        options: filterLocally ? group.options.filter((option) => matches(option, needle)) : group.options,
      }))
      .filter((group) => group.options.length > 0);
    const byId = new Map(filtered.flatMap((group) => group.options.map((option) => [option.id, option] as const)));
    const seen = new Set<string>();

    function asOption(person: AvatarPerson): AvatarPersonOption {
      return byId.get(person.id) ?? { ...person, selected: selectedIds.has(person.id), kind: 'person' };
    }

    function push(bucket: AvatarPersonOption[], option: AvatarPersonOption | undefined, listedOnly = false) {
      if (!option || seen.has(option.id)) return;
      if (listedOnly && !byId.has(option.id)) return;
      if (!browsing && filterLocally && !matches(option, needle)) return;
      seen.add(option.id);
      bucket.push(option);
    }

    const lead: AvatarPersonOption[] = [];
    const chosen: AvatarPersonOption[] = [];
    const squad: AvatarPersonOption[] = [];
    const others: AvatarPersonOption[] = [];
    const groupOptions: AvatarPersonOption[] = [];

    for (const group of filtered) {
      for (const option of group.options) if (option.kind === 'all') push(lead, option);
    }
    if (self) push(lead, asOption(self), remote);
    for (const person of people) if (person.id !== self?.id) push(chosen, asOption(person), remote);
    for (const person of suggestions) if (person.id !== self?.id) push(squad, asOption(person), remote);
    for (const group of filtered) {
      for (const option of group.options) {
        if (option.kind === 'all') continue;
        push(option.kind === 'group' ? groupOptions : others, option);
      }
    }

    return [
      lead.length > 0 ? { options: lead } : undefined,
      chosen.length > 0 ? { label: 'Selecionadas', options: chosen } : undefined,
      squad.length > 0 ? { label: 'Minha squad', options: squad } : undefined,
      others.length > 0 ? { label: 'Demais pessoas', options: others } : undefined,
      groupOptions.length > 0 ? { label: 'Grupos', options: groupOptions } : undefined,
    ].filter((group): group is AvatarPersonGroup => Boolean(group));
  }, [groups, query, filterLocally, self, suggestions, selectedIds, people]);

  function close() {
    setOpen(false);
    setQuery('');
    onQueryChange?.('');
  }

  closeRef.current = close;

  function changeQuery(next: string) {
    setQuery(next);
    onQueryChange?.(next);
  }

  useLayoutEffect(() => {
    if (!open) return;
    function place() {
      const node = rootRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const width = Math.min(320, Math.max(rect.width, 240), window.innerWidth - 16);
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - width - 8));
      const below = window.innerHeight - rect.bottom - 8;
      const above = rect.top - 8;
      const openUp = below < 220 && above > below;
      setBox(
        openUp
          ? { left, width, bottom: window.innerHeight - rect.top + 6, maxHeight: Math.max(120, Math.min(320, above - 6)) }
          : { left, width, top: rect.bottom + 6, maxHeight: Math.max(120, Math.min(320, below - 6)) },
      );
    }
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    function onPointer(event: MouseEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      closeRef.current();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') closeRef.current();
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hasOptions = visibleGroups.some((group) => group.options.length > 0);

  return (
    <div className={styles.field} ref={rootRef}>
      <div className={styles.row}>
        <div className={styles.stack}>
          {shown.map((person, index) => (
            <button
              key={person.id}
              type="button"
              className={cx(styles.face, person.selected && styles.selected)}
              style={{ '--z': shown.length - index } as CSSProperties}
              title={person.name}
              aria-pressed={person.selected}
              aria-label={person.selected ? `Remover ${person.name}` : `Selecionar ${person.name}`}
              onClick={() => onToggle(person.id)}
            >
              <Avatar src={person.avatarUrl} name={person.name} size={28} />
            </button>
          ))}
          <button
            id={inputId}
            type="button"
            className={styles.more}
            style={{ zIndex: shown.length + 1 }}
            aria-expanded={open}
            aria-haspopup="listbox"
            aria-controls={listId}
            aria-label={extra > 0 ? `Mais ${extra} ${extra === 1 ? 'pessoa' : 'pessoas'}. Escolher pessoas` : 'Escolher pessoas'}
            onClick={() => (open ? close() : setOpen(true))}
          >
            {extra > 0 ? `+${extra}` : <Plus size={16} weight="bold" />}
          </button>
        </div>
        {summary ? <span className={styles.summary}>{summary}</span> : null}
        {!summary && shown.length === 0 && emptyLabel ? <span className={styles.empty}>{emptyLabel}</span> : null}
      </div>
      {open && box
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              className={styles.menu}
              role="listbox"
              aria-label="Pessoas"
              aria-multiselectable="true"
              style={{ left: box.left, width: box.width, maxHeight: box.maxHeight, top: box.top, bottom: box.bottom }}
            >
              <input
                ref={searchRef}
                className={`input ${styles.search}`}
                type="search"
                placeholder={searchPlaceholder}
                autoComplete="off"
                value={query}
                onChange={(event) => changeQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') event.preventDefault();
                }}
              />
              <div className={styles.list}>
                {isLoading && !hasOptions ? <p className={styles.status}>Carregando…</p> : null}
                {!isLoading && !hasOptions ? <p className={styles.status}>{emptyText}</p> : null}
                {visibleGroups.map((group, index) => (
                  <div key={group.label ?? `grupo-${index}`} className={styles.group}>
                    {group.label ? <p className={styles.groupLabel}>{group.label}</p> : null}
                    {group.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        role="option"
                        aria-selected={option.selected}
                        className={styles.option}
                        onClick={() => onToggle(option.id)}
                      >
                        {option.kind === 'person' || option.kind === undefined ? (
                          <span className={cx(option.selected && styles.ring)}>
                            <Avatar src={option.avatarUrl} name={option.name} size={28} />
                          </span>
                        ) : (
                          <span className={cx(styles.mark, option.selected && styles.ring)} aria-hidden>
                            <UsersThree size={15} weight="bold" />
                          </span>
                        )}
                        <span className={styles.optionName}>{option.name}</span>
                        <span className={styles.trailing}>
                          {option.detail ? <span className={styles.detail}>{option.detail}</span> : null}
                          {option.selected ? <Check size={14} weight="bold" /> : null}
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
