import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { Message } from "../state/messages";

interface Props {
  message: Message | null;
  onDismiss: () => void;
}

function MessageBar({ message, onDismiss }: Props) {
  if (!message) return null;
  const error = message.kind === "error";
  return (
    <Alert
      role={error ? "alert" : "status"}
      className={`flex items-center justify-between gap-4 rounded-none border-x-0 border-t-0 py-1 text-base text-white ${error ? "bg-red-700" : "bg-green-700"}`}
    >
      <span>{message.text}</span>
      <Button variant="ghost" size="touch" onClick={onDismiss} aria-label="Meldung schließen" className="text-xl">
        ×
      </Button>
    </Alert>
  );
}

export default MessageBar;
