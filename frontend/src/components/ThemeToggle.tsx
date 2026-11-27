import { Button } from "@/components/ui/button";
import { useThemePreference, type ThemePreference } from "../lib/theme";

const OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Hell" },
  { value: "dark", label: "Dunkel" },
];

/** Light, dark or follow the operating system; the choice is kept in this browser. */
function ThemeToggle() {
  const [theme, setTheme] = useThemePreference();

  return (
    <div role="group" aria-label="Darstellung" className="grid grid-cols-3 gap-1">
      {OPTIONS.map((o) => (
        <Button
          key={o.value}
          type="button"
          size="sm"
          variant={theme === o.value ? "secondary" : "ghost"}
          aria-pressed={theme === o.value}
          onClick={() => setTheme(o.value)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

export default ThemeToggle;
