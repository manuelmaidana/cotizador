import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { inputClass } from '../ui/Input';

export interface Suggestion<T> {
  id: string;
  label: string;
  detail?: ReactNode;
  data: T;
}

interface AutocompleteInputProps<T> {
  id?: string;
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
  onPick: (suggestion: Suggestion<T>) => void;
  onBlur?: () => void;
  fetchSuggestions: (query: string) => Promise<Suggestion<T>[]>;
  /** When set, each suggestion shows an X that asks to delete it from the database. */
  onRemoveSuggestion?: (suggestion: Suggestion<T>) => void;
  removeLabel?: (suggestion: Suggestion<T>) => string;
  autoFocus?: boolean;
}

export function AutocompleteInput<T>({
  id,
  value,
  placeholder,
  onChange,
  onPick,
  onBlur,
  fetchSuggestions,
  onRemoveSuggestion,
  removeLabel,
  autoFocus,
}: AutocompleteInputProps<T>) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const listId = `${inputId}-list`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion<T>[]>([]);
  const [highlight, setHighlight] = useState(-1);
  const [dismissed, setDismissed] = useState(false);
  const requestRef = useRef(0);

  // Fetch suggestions while focused; stale responses are dropped.
  useEffect(() => {
    if (!focused) return;
    const requestId = ++requestRef.current;
    const timer = setTimeout(() => {
      fetchSuggestions(value).then((result) => {
        if (requestId !== requestRef.current) return;
        setSuggestions(result);
        setHighlight(-1);
      });
    }, 80);
    return () => clearTimeout(timer);
  }, [value, focused, fetchSuggestions]);

  const open = focused && !dismissed && suggestions.length > 0;

  const pick = (s: Suggestion<T>) => {
    onPick(s);
    setDismissed(true);
  };

  const clear = () => {
    onChange('');
    setDismissed(false);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!open) {
      if (e.key === 'ArrowDown' && suggestions.length) {
        setDismissed(false);
        e.preventDefault();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    } else if (e.key === 'Enter' && highlight >= 0) {
      e.preventDefault();
      pick(suggestions[highlight]);
    } else if (e.key === 'Escape') {
      setDismissed(true);
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={inputId}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && highlight >= 0 ? `${listId}-${highlight}` : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        autoFocus={autoFocus}
        className={cn(inputClass, value && 'pr-12')}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setDismissed(false);
        }}
        onFocus={() => {
          setFocused(true);
          setDismissed(false);
        }}
        onBlur={() => {
          setFocused(false);
          // Drop the list so a later focus never shows results from a previous lookup.
          requestRef.current++;
          setSuggestions([]);
          onBlur?.();
        }}
        onKeyDown={onKeyDown}
      />

      {/* Clears only the field; nothing is deleted from the database. */}
      {value && (
        <button
          type="button"
          aria-label="Borrar texto"
          onMouseDown={(e) => e.preventDefault()}
          onClick={clear}
          className="absolute inset-y-0 right-0 flex w-12 items-center justify-center rounded-r-xl text-zinc-400 transition-colors duration-150 hover:text-zinc-700"
        >
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-200/80">
            <X className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
        </button>
      )}

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-[calc(100%+6px)] z-20 max-h-72 animate-fade-in overflow-y-auto rounded-xl bg-white p-1 shadow-lg shadow-zinc-900/10 ring-1 ring-zinc-200"
        >
          {suggestions.map((s, i) => (
            <li
              key={s.id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === highlight}
              // Keep focus in the input so blur doesn't close the list before the tap registers.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              className={cn(
                'flex items-stretch rounded-lg transition-colors duration-100',
                i === highlight ? 'bg-zinc-100' : 'hover:bg-zinc-50',
              )}
            >
              <button
                type="button"
                tabIndex={-1}
                onClick={() => pick(s)}
                className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-col justify-center px-3 py-2 text-left"
              >
                <span className="text-[15px] font-medium text-zinc-900">{s.label}</span>
                {s.detail && <span className="text-xs text-zinc-500">{s.detail}</span>}
              </button>
              {onRemoveSuggestion && (
                <button
                  type="button"
                  tabIndex={-1}
                  aria-label={removeLabel ? removeLabel(s) : `Eliminar ${s.label}`}
                  onClick={() => onRemoveSuggestion(s)}
                  className="flex w-11 shrink-0 items-center justify-center rounded-lg text-zinc-400 transition-colors duration-150 hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
