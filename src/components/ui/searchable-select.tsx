"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";

interface Option {
  value: string;
  label: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select...",
  className = "",
  disabled = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selectedOption = useMemo(
    () => options.find((o) => o.value === value),
    [options, value]
  );

  const filtered = useMemo(() => {
    if (!search) return options;
    const q = search.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)
    );
  }, [options, search]);

  function updateSearch(val: string) {
    setSearch(val);
    setHighlightIndex(0);
  }

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleSelect = useCallback(
    (val: string) => {
      onChange(val);
      setIsOpen(false);
      setSearch("");
    },
    [onChange]
  );

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!isOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setHighlightIndex((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setHighlightIndex((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[highlightIndex]) {
          handleSelect(filtered[highlightIndex].value);
        }
        break;
      case "Escape":
        setIsOpen(false);
        setSearch("");
        break;
    }
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation();
    onChange("");
    setSearch("");
    setIsOpen(false);
  }

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`flex h-8 items-center rounded border bg-white text-xs ${
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-50 text-gray-400"
            : isOpen
            ? "border-brennan-blue ring-1 ring-brennan-blue"
            : "border-brennan-border text-brennan-text cursor-pointer hover:border-gray-400"
        }`}
        onClick={() => {
          if (!disabled) {
            setIsOpen(true);
            setTimeout(() => inputRef.current?.focus(), 0);
          }
        }}
      >
        {isOpen ? (
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => updateSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            className="h-full w-full rounded bg-transparent px-2 text-xs focus:outline-none"
            placeholder={selectedOption?.label || placeholder}
          />
        ) : (
          <span className={`flex-1 truncate px-2 ${value ? "text-brennan-text" : "text-gray-400"}`}>
            {selectedOption?.label || placeholder}
          </span>
        )}
        {value && !disabled ? (
          <button
            type="button"
            onClick={handleClear}
            className="mr-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-600"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        ) : (
          <svg className="mr-1.5 h-3 w-3 shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
          </svg>
        )}
      </div>

      {isOpen && !disabled && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-brennan-border bg-white py-1 shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-2 py-2 text-xs text-gray-400">No matches</li>
          ) : (
            filtered.map((opt, i) => (
              <li
                key={opt.value}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelect(opt.value);
                }}
                onMouseEnter={() => setHighlightIndex(i)}
                className={`cursor-pointer px-2 py-1.5 text-xs ${
                  i === highlightIndex
                    ? "bg-brennan-blue/10 text-brennan-blue"
                    : opt.value === value
                    ? "bg-gray-50 font-medium text-brennan-text"
                    : "text-brennan-text hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
