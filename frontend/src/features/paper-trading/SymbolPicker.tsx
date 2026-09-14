import {
  FocusEvent,
  KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { getEnvelope } from "../../lib/api";
import { readErrorText } from "./error-text";
import { SecurityListItem } from "../markets/types";
import { SecuritySectorIcon } from "../markets/SecuritySectorIcon";
import { Field } from "./ui";
import { InputBase } from "../../components/base/input/input";
import { RiSearchLine } from "@remixicon/react";
import { cx } from "../../utils/cx";

const SEARCH_DEBOUNCE_MS = 300;
const MAX_RESULTS = 8;

interface SymbolPickerProps {
  value: string;
  onChange: (symbol: string) => void;
  disabled?: boolean;
}

// Reuses the PUBLIC GET /securities (features/markets/useSecurities.ts's
// endpoint, unauthenticated) via `getEnvelope` from lib/api.ts rather than a
// paper-trading-specific search endpoint — there isn't one. `value` is fully
// controlled and IS the order's symbol field: typing updates it on every
// keystroke so the ticket's estimate hash always reflects exactly what is on
// screen; only the network *search* is debounced, not the field itself.
//
// This does not call features/markets/useSecurities.ts directly even though
// it hits the exact same endpoint: that hook has no `enabled` option, and
// this component must not fire a search before the user has typed anything
// (see `enabled: trimmed.length > 0` below) — the Markets page always wants
// a page of results, this ticket never does until there's a query. The
// query key below is deliberately built to match the `['securities', query]`
// shape useSecurities.ts uses (same field names, same values), so a symbol
// already looked up on the Markets page — or vice versa — is served from the
// shared cache instead of being re-fetched here.
//
// Known gap: GET /securities carries no `listing_status`, so a suspended or
// delisted security (SECURITY_NOT_TRADABLE) can only be discovered when the
// estimate or submit call comes back with that code — this component does
// not attempt to pre-filter the results it shows.
export function SymbolPicker({ value, onChange, disabled }: SymbolPickerProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [debouncedValue, setDebouncedValue] = useState(value);
  // The keyboard-highlighted option, independent of `value` — this is what
  // ArrowUp/ArrowDown move and Enter commits. -1 means nothing is
  // highlighted (mouse-only interaction, or no results yet).
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const baseId = useId();
  const listboxId = `${baseId}-listbox`;

  useEffect(() => {
    const handle = setTimeout(
      () => setDebouncedValue(value),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(handle);
  }, [value]);

  const trimmed = debouncedValue.trim();

  // A new search term invalidates whatever was previously highlighted — the
  // list it referred to is about to change (or refetch).
  useEffect(() => {
    setActiveIndex(-1);
  }, [trimmed]);

  const { data, isFetching, isError, error } = useQuery({
    queryKey: [
      "securities",
      { search: trimmed, sort: "symbol", page: 1, page_size: MAX_RESULTS },
    ],
    queryFn: () =>
      getEnvelope<SecurityListItem[]>("/securities", {
        search: trimmed,
        sort: "symbol",
        page: 1,
        page_size: MAX_RESULTS,
      }),
    enabled: trimmed.length > 0,
  });

  const showDropdown = open && trimmed.length > 0;
  const results = data?.data ?? [];

  function selectResult(security: SecurityListItem) {
    onChange(security.symbol);
    setOpen(false);
    setActiveIndex(-1);
  }

  // Standard combobox keyboard behaviour: the input keeps DOM focus the
  // whole time (nothing in the listbox is separately tabbable — see the
  // ARIA notes below), and these keys move a *virtual* selection over it.
  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      if (!open) return;
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
      return;
    }

    if (event.key === "ArrowDown") {
      if (trimmed.length === 0) return;
      event.preventDefault();
      if (!showDropdown) {
        setOpen(true);
        setActiveIndex(results.length > 0 ? 0 : -1);
        return;
      }
      if (results.length === 0) return;
      setActiveIndex((index) => (index + 1) % results.length);
      return;
    }

    if (event.key === "ArrowUp") {
      if (!showDropdown || results.length === 0) return;
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? results.length - 1 : index - 1));
      return;
    }

    if (event.key === "Enter") {
      // Only intercept Enter (and stop it from submitting the ticket form)
      // when it is actually committing a highlighted option — otherwise
      // Enter keeps its normal behaviour (e.g. triggering Confirm).
      if (!showDropdown || activeIndex < 0 || activeIndex >= results.length)
        return;
      event.preventDefault();
      selectResult(results[activeIndex]);
    }
  }

  // Closing on blur has to distinguish "focus left the picker entirely"
  // from "focus moved to something else inside it" — a plain onBlur on the
  // input closed the dropdown (and, after the delay, unmounted the <ul>)
  // regardless of where focus went next, which made any focusable element
  // inside the results unreachable by keyboard. Checking `relatedTarget`
  // against the container is the correct fix; nothing here is separately
  // focusable any more (see the option markup below), but this still holds
  // if that ever changes.
  function handleBlur(event: FocusEvent<HTMLDivElement>) {
    if (containerRef.current?.contains(event.relatedTarget as Node | null))
      return;
    setOpen(false);
    setActiveIndex(-1);
  }

  return (
    <div className="relative" ref={containerRef} onBlur={handleBlur}>
      <Field label={t("paperTrading.ticket.symbol")}>
        <InputBase
          type="text"
          leadingIcon={RiSearchLine}
          fieldClassName="ring-1 ring-inset ring-border-button-default"
          role="combobox"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={
            showDropdown && activeIndex >= 0 && activeIndex < results.length
              ? `${listboxId}-option-${activeIndex}`
              : undefined
          }
          value={value}
          disabled={disabled}
          placeholder={t("paperTrading.ticket.symbolPlaceholder")}
          autoComplete="off"
          required
          onChange={(event) => {
            onChange(event.target.value.toUpperCase());
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
        />
      </Field>

      {showDropdown && (
        <ul
          className="absolute inset-x-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-2lg border border-border-table bg-background-primary-default py-1 shadow-lg"
          id={listboxId}
          role="listbox"
        >
          {isError ? (
            <li
              className="px-3 py-2 text-body-medium text-status-rose-text"
              role="alert"
            >
              {readErrorText(error, t("paperTrading.ticket.symbolError"))}
            </li>
          ) : results.length === 0 ? (
            <li className="px-3 py-2 text-body-medium text-text-secondary">
              {isFetching
                ? t("paperTrading.ticket.symbolSearching")
                : t("paperTrading.ticket.symbolNoMatches")}
            </li>
          ) : (
            results.map((security, index) => (
              <li
                key={security.symbol}
                id={`${listboxId}-option-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={cx(
                  "flex cursor-pointer items-center gap-2.5 rounded-xl px-2.5 py-2",
                  index === activeIndex && "bg-background-secondary-hover",
                )}
                onMouseEnter={() => setActiveIndex(index)}
                // Prevents the input from blurring before the click below is
                // processed — the option is not itself focusable, so without
                // this the mousedown would move focus (and close the
                // dropdown) first and the click would land on nothing.
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectResult(security)}
              >
                <SecuritySectorIcon
                  sector={security.sector}
                  className="size-8 rounded-lg"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="text-body-medium text-text-primary">
                    {security.symbol}
                  </span>
                  <span className="truncate text-body-2-medium text-text-tertiary">
                    {security.company_name}
                  </span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
