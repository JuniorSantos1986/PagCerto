import { CheckCircle2, Info, XCircle } from "lucide-react";

export interface ToastData {
  id: number;
  message: string;
  tone: "success" | "error" | "info";
}

export function Toast({ toast }: { toast: ToastData }) {
  const Icon =
    toast.tone === "success" ? CheckCircle2 : toast.tone === "error" ? XCircle : Info;

  return (
    <div className={`toast toast-${toast.tone}`} role="status" aria-live="polite">
      <Icon size={17} />
      <span>{toast.message}</span>
    </div>
  );
}
