import { apiRequest } from "./queryClient";

export type AvailabilityStatus = "available" | "unavailable";
export type AvailabilityValue = AvailabilityStatus | undefined;

export function nextAvailabilityStatus(status?: AvailabilityStatus): AvailabilityStatus | undefined {
  return status === undefined ? "available" : status === "available" ? "unavailable" : undefined;
}

export function canEditAvailability({
  ready, busy, isPast, isWeekend, isBlocked, hasShift,
}: {
  ready: boolean; busy: boolean; isPast: boolean; isWeekend: boolean; isBlocked: boolean; hasShift: boolean;
}): boolean {
  return ready && !busy && !isPast && !isWeekend && !isBlocked && !hasShift;
}

export const availabilityMonthQueryKey = (date: string, userId?: string) =>
  userId
    ? ["/api/availability/me", userId, date.slice(0, 7)] as const
    : ["/api/availability/me", date.slice(0, 7)] as const;

export async function saveAvailability({ date, status }: { date: string; status?: AvailabilityStatus }) {
  return status === undefined
    ? apiRequest("DELETE", `/api/availability/me/${date}`)
    : apiRequest("PUT", "/api/availability/me", { date, status });
}

type DateWrite = {
  confirmed: AvailabilityValue;
  desired: AvailabilityValue;
  sending: boolean;
};

/**
 * A small per-date write queue. Different dates save concurrently, while a
 * date with repeated clicks only sends the latest intent after its current
 * request finishes.
 */
export class AvailabilityWriteQueue {
  private readonly dates = new Map<string, DateWrite>();
  private active = 0;
  private idleWaiters: Array<() => void> = [];

  constructor(
    private readonly save: (value: { date: string; status: AvailabilityValue }) => Promise<unknown>,
    private readonly events: {
      changed?: () => void;
      confirmed?: (date: string, status: AvailabilityValue) => void;
      failed?: (date: string, error: unknown) => void;
      idle?: () => void;
    } = {},
  ) {}

  /** Server rows may seed untouched dates, but can never overwrite an edit. */
  seed(rows: ReadonlyArray<{ date: string; status: AvailabilityStatus }>) {
    for (const row of rows) {
      if (!this.dates.has(row.date)) {
        this.dates.set(row.date, { confirmed: row.status, desired: row.status, sending: false });
      }
    }
  }

  status(date: string, serverValue: AvailabilityValue): AvailabilityValue {
    return this.dates.get(date)?.desired ?? serverValue;
  }

  cycle(date: string, serverValue: AvailabilityValue) {
    const current = this.status(date, serverValue);
    this.set(date, nextAvailabilityStatus(current), serverValue);
  }

  set(date: string, desired: AvailabilityValue, serverValue: AvailabilityValue) {
    let item = this.dates.get(date);
    if (!item) {
      item = { confirmed: serverValue, desired, sending: false };
      this.dates.set(date, item);
    } else {
      item.desired = desired;
    }
    this.events.changed?.();
    this.pump(date, item);
  }

  isPending(date?: string): boolean {
    return date ? !!this.dates.get(date)?.sending : this.active > 0;
  }

  whenIdle(): Promise<void> {
    if (this.active === 0) return Promise.resolve();
    return new Promise((resolve) => this.idleWaiters.push(resolve));
  }

  private pump(date: string, item: DateWrite) {
    if (item.sending || item.desired === item.confirmed) return;
    const sent = item.desired;
    item.sending = true;
    this.active += 1;
    this.events.changed?.();

    void this.save({ date, status: sent }).then(
      () => {
        item.confirmed = sent;
        this.events.confirmed?.(date, sent);
      },
      (error) => {
        this.events.failed?.(date, error);
        // Only roll the UI back when this failed request is still the user's
        // final intent. A newer click remains optimistic and is attempted next.
        if (item.desired === sent) item.desired = item.confirmed;
      },
    ).finally(() => {
      item.sending = false;
      this.active -= 1;
      this.events.changed?.();
      this.pump(date, item);
      if (this.active === 0) {
        const waiters = this.idleWaiters.splice(0);
        for (const resolve of waiters) resolve();
        this.events.idle?.();
      }
    });
  }
}