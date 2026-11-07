import { useEffect, useState } from "react";
import { api } from "../api/client";

export interface TerminalRef {
  id: string;
  name: string;
}

// Loads the terminals; nameOf maps an id to its name (unknown ids fall back to the id).
export function useTerminals(): { terminals: TerminalRef[]; nameOf: (id: string) => string } {
  const [terminals, setTerminals] = useState<TerminalRef[]>([]);

  useEffect(() => {
    api
      .get<TerminalRef[]>("/terminals")
      .then(setTerminals)
      .catch(() => {});
  }, []);

  return { terminals, nameOf: (id) => terminals.find((t) => t.id === id)?.name ?? id };
}
