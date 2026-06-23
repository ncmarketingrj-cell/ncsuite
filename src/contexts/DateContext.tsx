import { createContext, useContext, useState, useCallback, ReactNode } from "react";
import { subDays } from "date-fns";

export const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

export type Period = "7d" | "14d" | "30d" | "60d" | "90d" | "custom";

const PERIOD_DAYS: Record<Exclude<Period, "custom">, number> = {
  "7d": 7, "14d": 14, "30d": 30, "60d": 60, "90d": 90,
};

function periodDates(p: Exclude<Period, "custom">) {
  const today = getLocalDateString();
  const from = getLocalDateString(subDays(new Date(), PERIOD_DAYS[p] - 1));
  return { from, to: today };
}

interface DateContextType {
  // dates
  dateFrom: string;
  dateTo: string;
  selectedDate: string;
  period: Period;
  // account / campaign / adset
  accountId: string;
  campaignId: string;
  adSetId: string;
  // setters
  setDateFrom: (d: string) => void;
  setDateTo: (d: string) => void;
  setSelectedDate: (d: string) => void;
  setPeriod: (p: Period) => void;
  setAccountId: (id: string) => void;
  setCampaignId: (id: string) => void;
  setAdSetId: (id: string) => void;
  resetToDefault: () => void;
}

const DateContext = createContext<DateContextType | undefined>(undefined);

function ls(key: string, fallback: string): string {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}
function lsSet(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch {}
}

export function DateProvider({ children }: { children: ReactNode }) {
  const [period, setPeriodState] = useState<Period>(() => (ls("nc_period", "30d") as Period));
  const [dateFrom, setDateFromState] = useState(() => ls("nc_date_from", getLocalDateString(subDays(new Date(), 29))));
  const [dateTo, setDateToState] = useState(() => ls("nc_date_to", getLocalDateString()));
  const [selectedDate, setSelectedDateState] = useState(() => ls("nc_selected_date", getLocalDateString()));
  const [accountId, setAccountIdState] = useState(() => ls("nc_account_id", "all"));
  const [campaignId, setCampaignIdState] = useState(() => ls("nc_campaign_id", "all"));
  const [adSetId, setAdSetIdState] = useState(() => ls("nc_adset_id", "all"));

  const setDateFrom = useCallback((d: string) => {
    setDateFromState(d); lsSet("nc_date_from", d);
  }, []);

  const setDateTo = useCallback((d: string) => {
    setDateToState(d); lsSet("nc_date_to", d);
  }, []);

  const setSelectedDate = useCallback((d: string) => {
    setSelectedDateState(d); lsSet("nc_selected_date", d);
  }, []);

  const setPeriod = useCallback((p: Period) => {
    setPeriodState(p); lsSet("nc_period", p);
    if (p !== "custom") {
      const { from, to } = periodDates(p as Exclude<Period, "custom">);
      setDateFromState(from); lsSet("nc_date_from", from);
      setDateToState(to); lsSet("nc_date_to", to);
    }
  }, []);

  const setAccountId = useCallback((id: string) => {
    setAccountIdState(id); lsSet("nc_account_id", id);
    setCampaignIdState("all"); lsSet("nc_campaign_id", "all");
    setAdSetIdState("all"); lsSet("nc_adset_id", "all");
  }, []);

  const setCampaignId = useCallback((id: string) => {
    setCampaignIdState(id); lsSet("nc_campaign_id", id);
    setAdSetIdState("all"); lsSet("nc_adset_id", "all");
  }, []);

  const setAdSetId = useCallback((id: string) => {
    setAdSetIdState(id); lsSet("nc_adset_id", id);
  }, []);

  const resetToDefault = useCallback(() => {
    const { from, to } = periodDates("30d");
    setPeriodState("30d"); lsSet("nc_period", "30d");
    setDateFromState(from); lsSet("nc_date_from", from);
    setDateToState(to); lsSet("nc_date_to", to);
    setSelectedDateState(to); lsSet("nc_selected_date", to);
    setAccountIdState("all"); lsSet("nc_account_id", "all");
    setCampaignIdState("all"); lsSet("nc_campaign_id", "all");
    setAdSetIdState("all"); lsSet("nc_adset_id", "all");
  }, []);

  return (
    <DateContext.Provider value={{
      dateFrom, dateTo, selectedDate, period,
      accountId, campaignId, adSetId,
      setDateFrom, setDateTo, setSelectedDate, setPeriod,
      setAccountId, setCampaignId, setAdSetId, resetToDefault,
    }}>
      {children}
    </DateContext.Provider>
  );
}

export function useGlobalDate() {
  const ctx = useContext(DateContext);
  if (!ctx) throw new Error("useGlobalDate deve ser usado dentro de um DateProvider");
  return ctx;
}
