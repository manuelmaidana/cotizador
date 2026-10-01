import { forwardRef, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export const inputClass =
  'h-12 w-full rounded-xl border-0 bg-zinc-50 px-3.5 text-[16px] text-zinc-900 ring-1 ring-inset ring-zinc-200 placeholder:text-zinc-400 transition-shadow duration-150 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-600 disabled:opacity-60';

interface FieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

export function Field({ label, htmlFor, hint, children, className }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={htmlFor} className="text-[13px] font-medium text-zinc-700">
        {label}
      </label>
      {children}
      {hint && <p className="text-xs text-zinc-500">{hint}</p>}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  leading?: ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ className, leading, ...props }, ref) {
  if (!leading) return <input ref={ref} className={cn(inputClass, className)} {...props} />;
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-zinc-400">{leading}</span>
      <input ref={ref} className={cn(inputClass, 'pl-10', className)} {...props} />
    </div>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(inputClass, 'h-auto min-h-[88px] resize-none py-3', className)} {...props} />;
  },
);
