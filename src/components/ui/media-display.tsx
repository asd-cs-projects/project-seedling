import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { ImageIcon, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface MediaDisplayProps {
  url?: string | null;
  type?: string | null;
  alt?: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
  showPlaceholder?: boolean;
}

// Convert any test-files URL/path to a short-lived signed URL.
// Bucket is now private — direct public URLs no longer work.
const useSignedUrl = (rawUrl?: string | null) => {
  const [signed, setSigned] = useState<string | null>(rawUrl || null);

  useEffect(() => {
    let cancelled = false;
    const resolve = async () => {
      if (!rawUrl) { setSigned(null); return; }
      // Extract object path from a public URL or accept a raw path
      let path = rawUrl;
      const marker = '/storage/v1/object/public/test-files/';
      const idx = rawUrl.indexOf(marker);
      if (idx >= 0) path = rawUrl.substring(idx + marker.length);
      else if (rawUrl.startsWith('test-files/')) path = rawUrl.substring('test-files/'.length);
      else if (rawUrl.startsWith('http')) { setSigned(rawUrl); return; } // external URL

      try {
        const { data } = await supabase.storage
          .from('test-files')
          .createSignedUrl(path, 60 * 30); // 30 minutes
        if (!cancelled) setSigned(data?.signedUrl ?? rawUrl);
      } catch {
        if (!cancelled) setSigned(rawUrl);
      }
    };
    resolve();
    return () => { cancelled = true; };
  }, [rawUrl]);

  return signed;
};

export const MediaDisplay = ({
  url,
  type,
  alt = 'Media content',
  className,
  size = 'md',
  showPlaceholder = false,
}: MediaDisplayProps) => {
  const signedUrl = useSignedUrl(url);
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);

  if (!url) {
    if (showPlaceholder) {
      return (
        <div className={cn(
          'flex items-center justify-center bg-muted/30 border border-dashed border-border rounded-xl',
          size === 'sm' && 'h-24',
          size === 'md' && 'h-40',
          size === 'lg' && 'h-56',
          size === 'full' && 'h-64',
          className
        )}>
          <ImageIcon className="h-8 w-8 text-muted-foreground/50" />
        </div>
      );
    }
    return null;
  }

  const sizeClasses = {
    sm: 'max-h-32',
    md: 'max-h-48',
    lg: 'max-h-64',
    full: 'max-h-96 w-full',
  };

  const containerClasses = cn(
    'relative rounded-xl overflow-hidden border border-border bg-muted/30',
    className
  );

  if (type === 'image') {
    return (
      <div className={containerClasses}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
        {hasError ? (
          <div className="flex items-center justify-center h-32 bg-muted/30">
            <div className="text-center text-muted-foreground">
              <ImageIcon className="h-8 w-8 mx-auto mb-2" />
              <p className="text-sm">Failed to load image</p>
            </div>
          </div>
        ) : signedUrl ? (
          <img
            src={signedUrl}
            alt={alt}
            className={cn(
              'w-full h-auto object-contain mx-auto block',
              sizeClasses[size],
              isLoading && 'opacity-0'
            )}
            onLoad={() => setIsLoading(false)}
            onError={() => {
              setIsLoading(false);
              setHasError(true);
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-muted/50">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    );
  }

  if (type === 'audio') {
    return (
      <div className={containerClasses}>
        <audio controls className="w-full p-4">
          <source src={signedUrl || url} />
          Your browser does not support the audio element.
        </audio>
      </div>
    );
  }

  if (type === 'video') {
    return (
      <div className={containerClasses}>
        <video
          controls
          className={cn('w-full h-auto', sizeClasses[size])}
        >
          <source src={signedUrl || url} />
          Your browser does not support the video element.
        </video>
      </div>
    );
  }

  // Fallback for unknown types - try to render as image
  return (
    <div className={containerClasses}>
      <img
        src={signedUrl || url}
        alt={alt}
        className={cn('w-full h-auto object-contain mx-auto block', sizeClasses[size])}
        onError={() => setHasError(true)}
      />
    </div>
  );
};
