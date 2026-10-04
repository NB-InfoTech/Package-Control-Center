import { forwardRef } from 'react';
import { cn } from '@/utils/cn';

/**
 * Minimal form label primitive (shadcn style, no external deps).
 * Shared by pages that render form fields (Drift Detection, ...).
 */
const Label = forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn('text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70', className)}
      {...props}
    />
  )
);
Label.displayName = 'Label';

export { Label };