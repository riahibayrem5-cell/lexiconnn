import { useEffect, useState } from "react";

const KEY = "lexicon:goals";

export interface ReadingGoals {
  booksThisYear: number;
  minutesPerWeek: number;
}

export const DEFAULT_GOALS: ReadingGoals = {
  booksThisYear: 24,
  minutesPerWeek: 180,
};

function read(): ReadingGoals {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { ...DEFAULT_GOALS, ...parsed };
  } catch {
    return DEFAULT_GOALS;
  }
}

function write(goals: ReadingGoals) {
  localStorage.setItem(KEY, JSON.stringify(goals));
  window.dispatchEvent(new CustomEvent("lexicon-goals"));
}

export function useReadingGoals() {
  const [goals, setGoalsState] = useState<ReadingGoals>(() => read());

  useEffect(() => {
    const sync = () => setGoalsState(read());
    window.addEventListener("lexicon-goals", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("lexicon-goals", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setGoals = (next: Partial<ReadingGoals>) => {
    const merged = { ...goals, ...next };
    write(merged);
    setGoalsState(merged);
  };

  return { goals, setGoals };
}
