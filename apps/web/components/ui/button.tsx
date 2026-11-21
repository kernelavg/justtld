'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-[13px] font-medium tracking-[-0.01em] transition-all duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45',
  {
    variants: {
      variant: {
        default:
          'bg-foreground text-background hover:bg-foreground/90 shadow-sm',
        brand:
          'bg-primary text-white hover:bg-primary/90 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline:
          'border border-border bg-transparent text-foreground hover:bg-foreground/[0.04] hover:border-foreground/25',
        ghost:
          'text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground',
        destructive:
          'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        success:
          'bg-success text-success-foreground hover:bg-success/90',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-lg px-3 text-xs',
        lg: 'h-10 rounded-[10px] px-5 text-sm font-medium',
        icon: 'h-8 w-8 rounded-lg',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
