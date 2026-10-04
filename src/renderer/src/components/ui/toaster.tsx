import { useToast } from '@/hooks/useToast';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

export function Toaster() {
  const { toasts, removeToast } = useToast();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 w-80">
      {toasts.map(toast => (
        <Toast key={toast.id} toast={toast} onDismiss={removeToast} />
      ))}
    </div>
  );
}

interface ToastProps {
  toast: {
    id: string;
    title: string;
    description?: string;
    variant?: 'default' | 'destructive' | 'success';
  };
  onDismiss: (id: string) => void;
}

function Toast({ toast, onDismiss }: ToastProps) {
  const variantStyles = {
    default: 'bg-card border-border',
    destructive: 'bg-destructive/10 border-destructive/50 text-destructive',
    success: 'bg-green-500/10 border-green-500/50 text-green-400',
  };

  return (
    <div
      className={cn(
        'flex items-start gap-3 p-4 rounded-lg border shadow-lg animate-in slide-in-from-right',
        variantStyles[toast.variant ?? 'default']
      )}
    >
      <div className="flex-1">
        <p className="font-medium">{toast.title}</p>
        {toast.description && (
          <p className="text-sm text-muted-foreground mt-1">{toast.description}</p>
        )}
      </div>
      <button
        onClick={() => onDismiss(toast.id)}
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}