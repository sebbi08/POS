import { createContext, useContext, useMemo, useRef, useState, type ComponentProps } from "react";
import { format } from "date-fns";
import { CalendarDays } from "lucide-react";
import type { DayButton } from "react-day-picker";
import { de } from "react-day-picker/locale/de";
import { api } from "../api/client";
import {
  type BookingDay,
  dateToIso,
  formatCount,
  formatFestivalLabel,
  formatRangeLabel,
  groupFestivals,
  isoToDate,
} from "@/lib/booking-days";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Props {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
}

type LoadState = "loading" | "ready" | "error";

const CountsContext = createContext<Map<string, number>>(new Map());

// Day button with the booking count in small print under the day number.
function CountedDayButton({ day, modifiers, className, children, ...props }: ComponentProps<typeof DayButton>) {
  const count = useContext(CountsContext).get(dateToIso(day.date));
  return (
    <CalendarDayButton
      day={day}
      modifiers={modifiers}
      className={cn(modifiers.booked && "bg-primary/20 font-medium", className)}
      {...props}
    >
      {children}
      {count !== undefined && <span>{count.toLocaleString("de-DE")}</span>}
    </CalendarDayButton>
  );
}

const components = { DayButton: CountedDayButton };

function DateRangePicker({ from, to, onChange }: Props) {
  const [open, setOpen] = useState(false);
  // First click of a new selection; the current range is ignored until the second click.
  const [pending, setPending] = useState<Date | null>(null);
  const [days, setDays] = useState<BookingDay[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const latestRequest = useRef(0);

  const counts = useMemo(() => new Map(days.map((d) => [d.day, d.orderCount])), [days]);
  const booked = useMemo(() => days.map((d) => isoToDate(d.day)), [days]);
  const festivals = useMemo(() => groupFestivals(days), [days]);
  const labels = useMemo(
    () => ({
      labelDayButton: (date: Date) => {
        const label = format(date, "PPPP", { locale: de });
        const count = counts.get(dateToIso(date));
        return count === undefined ? label : `${label}, ${formatCount(count)}`;
      },
    }),
    [counts],
  );

  // Reloaded on every open so freshly synced bookings show up; superseded responses are dropped.
  const loadCounts = () => {
    const request = ++latestRequest.current;
    setLoadState("loading");
    api
      .get<BookingDay[]>("/reporting/booking-days")
      .then((result) => {
        if (request !== latestRequest.current) return;
        setDays(result);
        setLoadState("ready");
      })
      .catch(() => {
        if (request !== latestRequest.current) return;
        setDays([]);
        setLoadState("error");
      });
  };

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    setPending(null);
    if (next) loadCounts();
  };

  const select = (range: { from: string; to: string }) => {
    onChange(range);
    handleOpenChange(false);
  };

  const handleDayClick = (date: Date) => {
    if (!pending) {
      setPending(date);
      return;
    }
    const [a, b] = pending <= date ? [pending, date] : [date, pending];
    select({ from: dateToIso(a), to: dateToIso(b) });
  };

  const label = formatRangeLabel(from, to);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" aria-label={`Zeitraum: ${label}`}>
          <CalendarDays />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="flex w-auto gap-4 p-3">
        <div className="flex w-56 flex-col gap-1">
          <h3 className="px-2 pt-1 pb-2 text-sm font-medium">Letzte Buchungstage</h3>
          {loadState === "error" && (
            <p className="px-2 text-sm text-destructive">Buchungszahlen konnten nicht geladen werden</p>
          )}
          {loadState === "loading" && festivals.length === 0 && (
            <p className="px-2 text-sm text-muted-foreground">Lädt...</p>
          )}
          {loadState === "ready" && festivals.length === 0 && (
            <p className="px-2 text-sm text-muted-foreground">Noch keine Buchungen</p>
          )}
          {festivals.map((f) => {
            const festivalLabel = formatFestivalLabel(f);
            const count = formatCount(f.orderCount);
            return (
              <Button
                key={f.from}
                variant="ghost"
                aria-label={`${festivalLabel}, ${count}`}
                className="h-auto flex-col items-start gap-0.5 py-2 text-left"
                onClick={() => select({ from: f.from, to: f.to })}
              >
                <span>{festivalLabel}</span>
                <span className="text-xs text-muted-foreground">{count}</span>
              </Button>
            );
          })}
        </div>
        <CountsContext.Provider value={counts}>
          <Calendar
            mode="range"
            selected={pending ? { from: pending, to: undefined } : { from: isoToDate(from), to: isoToDate(to) }}
            onSelect={() => {}}
            onDayClick={handleDayClick}
            defaultMonth={isoToDate(from)}
            locale={de}
            weekStartsOn={1}
            modifiers={{ booked }}
            labels={labels}
            components={components}
            className="p-0 [--cell-size:--spacing(10)]"
          />
        </CountsContext.Provider>
      </PopoverContent>
    </Popover>
  );
}

export default DateRangePicker;
