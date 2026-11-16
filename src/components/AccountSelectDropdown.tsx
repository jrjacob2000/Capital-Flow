import React, { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { SavingsAccount } from '../types/finance';
import { formatCurrency } from '../utils/budgetCalculations';

interface AccountSelectDropdownProps {
  value: string;
  onChange: (accountId: string) => void;
  accounts: SavingsAccount[];
  currencySymbol?: string;
  showBalance?: boolean;
  emptyOption?: {
    value: string;
    label: string;
  };
  getAccountLabelSuffix?: (acc: SavingsAccount) => string;
  className?: string;
  variant?: 'default' | 'indigo' | 'white';
  disabled?: boolean;
}

export const AccountSelectDropdown: React.FC<AccountSelectDropdownProps> = ({
  value,
  onChange,
  accounts,
  currencySymbol = '₱',
  showBalance = false,
  emptyOption,
  getAccountLabelSuffix,
  className = '',
  variant = 'default',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

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
  }, [isOpen, accounts.length]);

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

  const selectedAccount =
    accounts.find((a) => a.id === value) || (!emptyOption ? accounts[0] : undefined);

  const resolvePrimaryText = (acc: SavingsAccount) => {
    if (getAccountLabelSuffix) {
      return `${acc.name}${getAccountLabelSuffix(acc)}`;
    }
    if (showBalance) {
      return `${acc.name} (${currencySymbol}${formatCurrency(acc.balance)})`;
    }
    return acc.name;
  };

  const baseBgClass =
    variant === 'indigo'
      ? 'bg-indigo-50/50 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800'
      : variant === 'white'
      ? 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700'
      : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700';

  return (
    <div ref={containerRef} className={`relative min-w-0 ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        className={`w-full min-w-0 h-8 sm:h-9 px-2 sm:px-2.5 rounded-xl border ${baseBgClass} text-slate-900 dark:text-white flex items-center justify-between gap-1.5 text-left outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {selectedAccount ? (
          <div className="min-w-0 flex-1 leading-tight">
            <div className="text-xs font-medium text-slate-900 dark:text-white truncate">
              {resolvePrimaryText(selectedAccount)}
            </div>
            {selectedAccount.type && (
              <div className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 font-normal truncate">
                {selectedAccount.type}
              </div>
            )}
          </div>
        ) : emptyOption ? (
          <span className="text-xs font-medium text-slate-900 dark:text-white truncate">
            {emptyOption.label}
          </span>
        ) : (
          <span className="text-xs font-medium text-slate-400 truncate">
            Select Account...
          </span>
        )}
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
            {emptyOption && (
              <button
                ref={value === emptyOption.value ? selectedItemRef : undefined}
                type="button"
                role="option"
                aria-selected={value === emptyOption.value}
                onClick={() => {
                  onChange(emptyOption.value);
                  setIsOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer ${
                  value === emptyOption.value ? 'bg-indigo-50/60 dark:bg-indigo-950/40' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-medium text-slate-900 dark:text-white break-words leading-snug">
                    {emptyOption.label}
                  </div>
                </div>
                {value === emptyOption.value && (
                  <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                )}
              </button>
            )}

            {accounts.map((acc) => {
              const isSelected = selectedAccount
                ? acc.id === selectedAccount.id
                : acc.id === value;
              return (
                <button
                  key={acc.id}
                  ref={isSelected ? selectedItemRef : undefined}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(acc.id);
                    setIsOpen(false);
                  }}
                  className={`w-full px-2.5 py-1.5 text-left flex items-center justify-between gap-2 hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors cursor-pointer ${
                    isSelected ? 'bg-indigo-50/60 dark:bg-indigo-950/40' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-900 dark:text-white break-words leading-snug">
                      {resolvePrimaryText(acc)}
                    </div>
                    {acc.type && (
                      <div className="text-[9px] sm:text-[10px] text-slate-500 dark:text-slate-400 truncate leading-tight mt-0.5">
                        {acc.type}
                      </div>
                    )}
                  </div>
                  {isSelected && (
                    <Check className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </div>
  );
};
