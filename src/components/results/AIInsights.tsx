import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Lightbulb, TrendingUp, Target, Sparkles } from 'lucide-react';

interface AIInsightsProps {
  strengths: string[];
  improvements: string[];
  topicTags: string[];
  isLoading?: boolean;
}

export const AIInsights = ({ strengths, improvements, topicTags, isLoading }: AIInsightsProps) => {
  if (isLoading) {
    return (
      <Card className="p-6 animate-pulse">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-primary" />
          <div className="h-6 bg-muted rounded w-32"></div>
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded w-full"></div>
          <div className="h-4 bg-muted rounded w-3/4"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </div>
      </Card>
    );
  }

  const hasInsights = strengths.length > 0 || improvements.length > 0 || topicTags.length > 0;

  if (!hasInsights) {
    return null;
  }

  return (
    <Card className="p-6 border-primary/20 bg-gradient-to-br from-primary/5 to-secondary/5">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-semibold">AI Performance Insights</h3>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Strengths */}
        {strengths.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-green-600" />
              <h4 className="font-medium text-green-700 dark:text-green-400">Strengths</h4>
            </div>
            <ul className="space-y-2">
              {strengths.map((strength, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-green-500 mt-1">•</span>
                  <span>{strength}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Areas for Improvement */}
        {improvements.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Target className="h-4 w-4 text-amber-600" />
              <h4 className="font-medium text-amber-700 dark:text-amber-400">Areas for Improvement</h4>
            </div>
            <ul className="space-y-2">
              {improvements.map((area, idx) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <span className="text-amber-500 mt-1">•</span>
                  <span>{area}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Topic Tags */}
      {topicTags.length > 0 && (
        <div className="mt-4 pt-4 border-t border-border/50">
          <div className="flex items-center gap-2 mb-3">
            <Lightbulb className="h-4 w-4 text-primary" />
            <h4 className="font-medium">Topics to Review</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            {topicTags.map((tag, idx) => (
              <Badge 
                key={idx} 
                variant="secondary" 
                className="bg-primary/10 text-primary hover:bg-primary/20"
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
};

interface ClassSummaryProps {
  summary: string;
  topicHeatmap: Record<string, string | { level: string; evidence?: string; questionRefs?: string[] }>;
  isLoading?: boolean;
}

export const ClassSummary = ({ summary, topicHeatmap, isLoading }: ClassSummaryProps) => {
  if (isLoading) {
    return (
      <Card className="p-6 animate-pulse">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="h-5 w-5 text-primary" />
          <div className="h-6 bg-muted rounded w-40"></div>
        </div>
        <div className="space-y-3">
          <div className="h-4 bg-muted rounded w-full"></div>
          <div className="h-4 bg-muted rounded w-3/4"></div>
        </div>
      </Card>
    );
  }

  if (!summary && Object.keys(topicHeatmap).length === 0) {
    return null;
  }

  const getMasteryColor = (level: string) => {
    switch (level.toLowerCase()) {
      case 'high':
        return 'bg-success/12 text-success border-success/30';
      case 'medium':
        return 'bg-warning/12 text-warning border-warning/30';
      case 'low':
        return 'bg-destructive/12 text-destructive border-destructive/30';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  return (
    <Card className="cloud-bubble p-6 border-secondary/20 bg-gradient-to-br from-secondary/5 via-card to-accent/5 overflow-hidden">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-5 w-5 text-secondary" />
        <h3 className="text-lg font-semibold">AI Class Summary</h3>
      </div>

      {summary && (
        <div className="mb-5 rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm">
          <p className="text-muted-foreground leading-7">{summary}</p>
        </div>
      )}

      {Object.keys(topicHeatmap).length > 0 && (
        <div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <h4 className="font-medium">Topic Mastery Heatmap</h4>
            <p className="text-xs text-muted-foreground">Built from which questions students got right, wrong, or skipped</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {Object.entries(topicHeatmap).map(([topic, entry]) => {
              const normalized = typeof entry === 'string' ? { level: entry } : entry;
              return (
                <div
                  key={topic}
                  className={`rounded-2xl border p-4 backdrop-blur-sm ${getMasteryColor(normalized.level)}`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <h5 className="font-semibold leading-tight">{topic}</h5>
                    <Badge variant="outline" className="border-current/20 bg-background/60 text-current capitalize">
                      {normalized.level}
                    </Badge>
                  </div>
                  {normalized.evidence && (
                    <p className="text-sm leading-6 text-foreground/80">{normalized.evidence}</p>
                  )}
                  {normalized.questionRefs?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {normalized.questionRefs.map((ref) => (
                        <span key={ref} className="rounded-full bg-background/60 px-2.5 py-1 text-xs font-medium text-foreground/80">
                          {ref}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </Card>
  );
};