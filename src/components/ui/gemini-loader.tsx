import { Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface GeminiLoaderProps {
  message?: string;
  subMessage?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Bobbing loader: a single, calm bob animation.
 * Shows the Sckool ambassador logo with a small Gemini sparkle badge on top.
 * Deliberately uses ONE motion only (no ring/pulse) for a cleaner feel.
 */
export const GeminiLoader = ({
  message = 'Thinking...',
  subMessage,
  size = 'md',
  className,
}: GeminiLoaderProps) => {
  const sizes = {
    sm: { logo: 'h-14 w-14', badge: 'h-5 w-5', icon: 'h-3 w-3', text: 'text-sm', sub: 'text-xs' },
    md: { logo: 'h-20 w-20', badge: 'h-7 w-7', icon: 'h-4 w-4', text: 'text-base', sub: 'text-sm' },
    lg: { logo: 'h-28 w-28', badge: 'h-9 w-9', icon: 'h-5 w-5', text: 'text-lg', sub: 'text-sm' },
  }[size];

  return (
    <div className={cn('flex flex-col items-center justify-center gap-4 py-6', className)}>
      <div className="gemini-bob relative flex items-center justify-center">
        <img
          src="/favicon.png"
          alt="Sckool"
          className={cn('drop-shadow-md', sizes.logo)}
        />
        {/* Gemini sparkle badge sitting on top */}
        <div
          className={cn(
            'absolute -top-1 -right-1 rounded-full bg-gradient-to-br from-primary via-secondary to-accent flex items-center justify-center shadow-md ring-2 ring-background',
            sizes.badge,
          )}
          aria-hidden
        >
          <Sparkles className={cn('text-white', sizes.icon)} strokeWidth={2.4} />
        </div>
      </div>
      <div className="text-center space-y-1 max-w-xs">
        <p className={cn('font-semibold text-foreground gemini-shimmer-text', sizes.text)}>
          {message}
        </p>
        {subMessage && (
          <p className={cn('text-muted-foreground', sizes.sub)}>{subMessage}</p>
        )}
      </div>
    </div>
  );
};
