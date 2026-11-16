import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';

export interface ParsedOption {
  value: string;
  label: string;
  disabled?: boolean;
  group?: string;
}

export function extractTextFromNode(node: React.ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(extractTextFromNode).join('');
  }
  if (React.isValidElement(node)) {
    const props = node.props as { children?: React.ReactNode };
    return extractTextFromNode(props.children);
  }
  return '';
}

export function parseChildrenToOptions(
  children: React.ReactNode,
  currentGroup?: string
): ParsedOption[] {
  const result: ParsedOption[] = [];

  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;

    const props = child.props as {
      value?: string | number;
      label?: string;
      disabled?: boolean;
      children?: React.ReactNode;
    };

    if (child.type === React.Fragment) {
      result.push(...parseChildrenToOptions(props.children, currentGroup));
      return;
    }

    if (child.type === 'optgroup') {
      const groupLabel = props.label ? String(props.label) : '';
      result.push(...parseChildrenToOptions(props.children, groupLabel));
      return;
    }

    if (child.type === 'option') {
      const label = extractTextFromNode(props.children).replace(/\s+/g, ' ').trim();
      const value = props.value !== undefined ? String(props.value) : label;
      result.push({
        value,
        label,
        disabled: Boolean(props.disabled),
        group: currentGroup,
      });
    }
  });

  return result;
}

interface CustomSelectProps {
  value?: string | number;
  defaultValue?: string | number;
  onChange?: (e: React.ChangeEvent<HTMLSelectElement>) => void;
  children: React.ReactNode;
  className?: string;
  disabled?: boolean;
  required?: boolean;
  'aria-label'?: string;
  id?: string;
}

export const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  defaultValue,
  onChange,
  children,
  className = '',
  disabled = false,
  'aria-label': ariaLabel,
  id,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [internalValue, setInternalValue] = useState<string>(
    defaultValue !== undefined ? String(defaultValue) : ''
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const options = parseChildrenToOptions(children);
  const isControlled = value !== undefined;
  const currentValue = isControlled ? String(value) : internalValue;

  const selectedOption =
    options.find((opt) => opt.value === currentValue) ||
    options[0] ||
    undefined;

  const updateMenuPosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const minMenuWidth = Math.min(Math.max(rect.width, 230), viewportW - 16);
    let left = rect.left;
    if (left + minMenuWidth > viewportW - 8) {
      left = Math.max(8, viewportW - minMenuWidth - 8);
    }

    const spaceBelow = viewportH - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;

    if (openUpward) {
      setMenuStyle({
        position: 'fixed',
        left: `${left}px`,
        width: `${minMenuWidth}px`,
        bottom: `${viewportH - rect.top + 4}px`,
        maxHeight: `${Math.min(260, Math.max(140, spaceAbove))}px`,
        zIndex: 9999,
      });
    } else {
      setMenuStyle({
        position: 'fixed',
        left: `${left}px`,
        width: `${minMenuWidth}px`,
        top: `${rect.bottom + 4}px`,
        maxHeight: `${Math.min(260, Math.max(140, spaceBelow))}px`,
        zIndex: 9999,
      });
    }
  };

  useLayoutEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    if (selectedItemRef.current) {
      selectedItemRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [isOpen, options.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (
        containerRef.current &&
        !containerRef.current.contains(target) &&
        (!menuRef.current || !menuRef.current.contains(target))
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    const handleScrollOrResize = (e: Event) => {
      if (menuRef.current && e.target && menuRef.current.contains(e.target as Node)) {
        return;
      }
      updateMenuPosition();
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleScrollOrResize);
    window.addEventListener('scroll', handleScrollOrResize, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleScrollOrResize);
      window.removeEventListener('scroll', handleScrollOrResize, true);
    };
  }, [isOpen]);

  const handleSelectOption = (optValue: string) => {
    if (!isControlled) {
      setInternalValue(optValue);
    }
    if (onChange) {
      const syntheticEvent = {
        target: { value: optValue },
        currentTarget: { value: optValue },
      } as React.ChangeEvent<HTMLSelectElement>;
      onChange(syntheticEvent);
    }
    setIsOpen(false);
  };

  const isInlineTransparent = className.includes('bg-transparent');

  const renderMenuItems = () => {
    const elements: React.ReactNode[] = [];
    let lastGroup: string | undefined = undefined;

    options.forEach((opt, idx) => {
      if (opt.group && opt.group !== lastGroup) {
        lastGroup = opt.group;
        elements.push(
          <div
            key={`group-${opt.group}-${idx}`}
            className="px-2.5 py-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 bg-slate-50/90 dark:bg-slate-800/60 select-none"
          >
            {opt.group}
          </div>
        );
      } else if (!opt.group && lastGroup !== undefined) {
        lastGroup = undefined;
      }

      const isSelected = selectedOption
        ? opt.value === selectedOption.value
        : opt.value === currentValue;
      const isCreateAction =
        opt.value.startsWith('__CREATE_') || opt.value === '__custom__';

      elements.push(
        <button
          key={`opt-${opt.value}-${idx}`}
          ref={isSelected ? selectedItemRef : undefined}
          type="button"
          role="option"
          aria-selected={isSelected}
          disabled={opt.disabled}
          onClick={() => !opt.disabled && handleSelectOption(opt.value)}
          className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
            isSelected ? 'bg-indigo-50/60 dark:bg-indigo-950/40' : ''
          }`}
        >
          <div className="min-w-0 flex-1">
            <div
              className={`text-xs font-medium break-words leading-snug ${
                isCreateAction
                  ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              {opt.label}
            </div>
          </div>
          {isSelected && (
            <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
          )}
        </button>
      );
    });

    return elements;
  };

  return (
    <div
      ref={containerRef}
      className={`relative min-w-0 ${
        className.includes('flex-1') ? 'flex-1' : isInlineTransparent ? '' : 'w-full'
      }`}
    >
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={
          isInlineTransparent
            ? `${className} flex items-center justify-between gap-1 text-left cursor-pointer disabled:opacity-50`
            : `${className} flex items-center justify-between gap-1.5 text-left cursor-pointer transition-all disabled:opacity-50 disabled:cursor-not-allowed`
        }
      >
        <span className="text-xs font-medium truncate flex-1 min-w-0">
          {selectedOption ? selectedOption.label : ''}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 shrink-0 transition-transform duration-150 ${
            isOpen ? 'rotate-180 text-indigo-500' : ''
          }`}
        />
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="listbox"
            style={menuStyle}
            className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl py-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60 animate-in fade-in zoom-in-95 duration-100"
          >
            {renderMenuItems()}
          </div>,
          document.body
        )}
    </div>
  );
};
