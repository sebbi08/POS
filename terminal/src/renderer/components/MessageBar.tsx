import type { Message } from "../state/messages";

interface Props {
  message: Message | null;
  onDismiss: () => void;
}

function MessageBar({ message, onDismiss }: Props) {
  if (!message) return null;
  const error = message.kind === "error";
  return (
    <div
      role={error ? "alert" : "status"}
      className={`flex items-center justify-between gap-4 px-4 py-3 ${error ? "bg-red-700 text-white" : "bg-green-700 text-white"}`}
    >
      <span>{message.text}</span>
      <button onClick={onDismiss} aria-label="Meldung schließen" className="text-xl leading-none px-2">×</button>
    </div>
  );
}

export default MessageBar;
