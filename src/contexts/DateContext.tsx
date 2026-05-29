import { createContext, useContext, useState, ReactNode } from "react";
import { subDays } from "date-fns";

export const getLocalDateString = (d = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

interface DateContextType {
  dateFrom: string;
  dateTo: string;
  selectedDate: string;
  setDateFrom: (date: string) => void;
  setDateTo: (date: string) => void;
  setSelectedDate: (date: string) => void;
  resetToDefault: () => void;
}

const DateContext = createContext<DateContextType | undefined>(undefined);

export function DateProvider({ children }: { children: ReactNode }) {
  const [dateFrom, setDateFromState] = useState(() => {
    return localStorage.getItem("nc_date_from") || getLocalDateString(subDays(new Date(), 29));
  });
  const [dateTo, setDateToState] = useState(() => {
    return localStorage.getItem("nc_date_to") || getLocalDateString();
  });
  const [selectedDate, setSelectedDateState] = useState(() => {
    return localStorage.getItem("nc_selected_date") || getLocalDateString();
  });

  const setDateFrom = (date: string) => {
    setDateFromState(date);
    localStorage.setItem("nc_date_from", date);
  };

  const setDateTo = (date: string) => {
    setDateToState(date);
    localStorage.setItem("nc_date_to", date);
  };

  const setSelectedDate = (date: string) => {
    setSelectedDateState(date);
    localStorage.setItem("nc_selected_date", date);
  };

  const resetToDefault = () => {
    const today = getLocalDateString();
    const thirtyDaysAgo = getLocalDateString(subDays(new Date(), 29));
    setDateFrom(thirtyDaysAgo);
    setDateTo(today);
    setSelectedDate(today);
  };

  return (
    <DateContext.Provider
      value={{
        dateFrom,
        dateTo,
        selectedDate,
        setDateFrom,
        setDateTo,
        setSelectedDate,
        resetToDefault,
      }}
    >
      {children}
    </DateContext.Provider>
  );
}

export function useGlobalDate() {
  const context = useContext(DateContext);
  if (!context) {
    throw new Error("useGlobalDate deve ser usado dentro de um DateProvider");
  }
  return context;
}
