import { forwardRef, HTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {}

const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('relative overflow-auto scrollbar-thin', className)}
      {...props}
    >
      {children}
    </div>
  )
);
ScrollArea.displayName = 'ScrollArea';

export { ScrollArea };