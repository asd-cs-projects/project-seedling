import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Download, User, Clock, CheckCircle, XCircle, TrendingUp, Eye, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import jsPDF from 'jspdf';
import sckoolLogo from '@/assets/sckool-logo.jpeg';
import { QuestionReview } from '@/components/results/QuestionReview';
import { AIInsights, ClassSummary } from '@/components/results/AIInsights';
import {
  BRAND,
  PAGE,
  loadImageAsBase64,
  drawHeader,
  drawWatermark,
  drawFooter,
  ensureSpace,
  fetchQuestionsForReport,
  renderAnswerReview,
} from '@/lib/pdfReport';

interface TestResultsPageProps {
  testId: string;
  testTitle: string;
  onBack: () => void;
}

interface TestResult {
  id: string;
  student_id: string;
  score: number;
  correct_answers: number;
  wrong_answers: number;
  total_questions: number;
  difficulty_level: string;
  practice_score: number;
  time_spent: number;
  completed_at: string;
  answers: any;
  status?: string;
  ai_strengths?: string[];
  ai_improvements?: string[];
  ai_topic_tags?: string[];
  student_name?: string;
  student_grade?: string;
  student_class?: string;
  student_gender?: string;
}

const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  completed: { label: 'Completed', className: 'bg-success/15 text-success border-success/30' },
  timed_out: { label: 'Timed Out', className: 'bg-warning/15 text-warning-foreground border-warning/40' },
  incomplete: { label: 'Incomplete', className: 'bg-muted text-muted-foreground border-border' },
  not_attempted: { label: 'Not Attempted', className: 'bg-destructive/10 text-destructive border-destructive/30' },
};

const StatusBadge = ({ status }: { status?: string }) => {
  const cfg = STATUS_LABELS[status || 'completed'] || STATUS_LABELS.completed;
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${cfg.className}`}>
      {cfg.label}
    </span>
  );
};

export const TestResultsPage = ({ testId, testTitle, onBack }: TestResultsPageProps) => {
  const { toast } = useToast();
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Record<string, any>>({});
  const [selectedResult, setSelectedResult] = useState<TestResult | null>(null);
  const [classSummary, setClassSummary] = useState<{ summary: string; topicHeatmap: Record<string, string | { level: string; evidence?: string; questionRefs?: string[] }> } | null>(null);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [summaryCooldown, setSummaryCooldown] = useState(0);

  useEffect(() => {
    fetchResults();
    fetchClassSummary();
  }, [testId]);

  // Cooldown timer
  useEffect(() => {
    if (summaryCooldown <= 0) return;
    const timer = setInterval(() => {
      setSummaryCooldown(prev => {
        if (prev <= 1) { clearInterval(timer); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [summaryCooldown]);

  const fetchClassSummary = async () => {
    const { data } = await supabase
      .from('test_class_summaries')
      .select('*')
      .eq('test_id', testId)
      .maybeSingle();

    if (data) {
      setClassSummary({
        summary: data.summary || '',
        topicHeatmap: (data.topic_heatmap as Record<string, string | { level: string; evidence?: string; questionRefs?: string[] }>) || {},
      });
    }
  };

  const fetchResults = async () => {
    setLoading(true);
    try {
      const { data: resultsData, error: resultsError } = await supabase
        .from('test_results')
        .select('*')
        .eq('test_id', testId)
        .eq('is_retake', false)
        .order('completed_at', { ascending: false });

      if (resultsError) throw resultsError;

      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('*');

      if (profilesError) throw profilesError;

      const studentMap: Record<string, any> = {};
      profilesData?.forEach(p => {
        studentMap[p.user_id] = p;
      });
      setStudents(studentMap);

      const mappedResults = (resultsData || []).map(r => ({
        ...r,
        student_name: studentMap[r.student_id]?.full_name || 'Unknown Student',
        student_grade: studentMap[r.student_id]?.grade,
        student_class: studentMap[r.student_id]?.class,
        student_gender: studentMap[r.student_id]?.gender,
      }));

      setResults(mappedResults);
    } catch (error: any) {
      console.error('Error fetching results:', error);
      toast({ title: 'Error', description: 'Failed to load results', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const generateClassSummary = async (forceRegenerate = false) => {
    if (results.length === 0) return;
    setGeneratingSummary(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-insights', {
        body: { isClassSummary: true, testId, testTitle, testSubject: '', forceRegenerate },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.insights) {
        setClassSummary({
          summary: data.insights.summary || '',
          topicHeatmap: data.insights.topicHeatmap || {},
        });
        toast({
          title: data.cached ? 'Saved Summary Loaded' : 'Summary Generated',
          description: data.cached ? 'Showing existing AI summary.' : 'AI class summary created.',
        });
        setSummaryCooldown(15);
      }
    } catch (error: any) {
      const msg = String(error?.message || '').includes('regenerated today')
        ? 'You can only regenerate once per day. Try again tomorrow.'
        : (error?.message || 'Failed to generate class summary');
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    } finally {
      setGeneratingSummary(false);
    }
  };

  const regenerateStudentInsights = async (resultId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-insights', {
        body: { resultId, testTitle, testSubject: '', forceRegenerate: true },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Insights Updated', description: 'Student AI insights regenerated.' });
      await fetchResults();
      if (selectedResult?.id === resultId && data?.insights) {
        setSelectedResult({
          ...selectedResult,
          ai_strengths: data.insights.strengths,
          ai_improvements: data.insights.improvements,
          ai_topic_tags: data.insights.topicTags,
        });
      }
    } catch (error: any) {
      const msg = String(error?.message || '').includes('regenerated today')
        ? 'You can only regenerate once per day. Try again tomorrow.'
        : (error?.message || 'Failed to regenerate insights');
      toast({ title: 'Error', description: msg, variant: 'destructive' });
    }
  };

  const generateStudentInsights = async (resultId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('generate-insights', {
        body: { resultId, testTitle, testSubject: '' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast({ title: 'Insights Generated', description: 'Student AI insights ready.' });
      await fetchResults();
      if (selectedResult?.id === resultId && data?.insights) {
        setSelectedResult({
          ...selectedResult,
          ai_strengths: data.insights.strengths,
          ai_improvements: data.insights.improvements,
          ai_topic_tags: data.insights.topicTags,
        });
      }
    } catch (error: any) {
      toast({ title: 'Error', description: error?.message || 'Failed', variant: 'destructive' });
    }
  };

  const generatePDF = async (result: TestResult) => {
    const doc = new jsPDF();
    const logoBase64 = await loadImageAsBase64(sckoolLogo);

    drawWatermark(doc, logoBase64);
    let y = drawHeader(doc, logoBase64, 'ASD Benchmark Portal', 'Student Test Report');

    // Title block
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(BRAND.ink[0], BRAND.ink[1], BRAND.ink[2]);
    doc.text(testTitle, PAGE.margin, y + 4);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(BRAND.muted[0], BRAND.muted[1], BRAND.muted[2]);
    doc.text(
      `${result.student_name || 'Student'}   •   ${new Date(result.completed_at).toLocaleDateString()}   •   Difficulty: ${result.difficulty_level || 'N/A'}`,
      PAGE.margin,
      y,
    );
    y += 8;

    // Student info card
    doc.setFillColor(BRAND.surface[0], BRAND.surface[1], BRAND.surface[2]);
    doc.roundedRect(PAGE.margin, y, PAGE.contentWidth, 22, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(BRAND.muted[0], BRAND.muted[1], BRAND.muted[2]);
    doc.text('STUDENT', PAGE.margin + 4, y + 6);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(BRAND.ink[0], BRAND.ink[1], BRAND.ink[2]);
    doc.text(`Name: ${result.student_name || 'Unknown'}`, PAGE.margin + 4, y + 13);
    doc.text(`Grade: ${result.student_grade || 'N/A'}`, PAGE.margin + 4, y + 19);
    doc.text(`Class: ${result.student_class || 'N/A'}`, PAGE.margin + 80, y + 13);
    doc.text(`Gender: ${result.student_gender || 'N/A'}`, PAGE.margin + 80, y + 19);
    y += 28;

    // Score hero band
    doc.setFillColor(BRAND.primary[0], BRAND.primary[1], BRAND.primary[2]);
    doc.roundedRect(PAGE.margin, y, PAGE.contentWidth, 32, 3, 3, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(34);
    doc.text(`${result.score || 0}%`, PAGE.margin + 14, y + 22);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Overall Score', PAGE.margin + 14, y + 28);

    const kpis = [
      { label: 'Correct', value: `${result.correct_answers || 0}` },
      { label: 'Wrong', value: `${result.wrong_answers || 0}` },
      { label: 'Total', value: `${result.total_questions || 0}` },
      { label: 'Time', value: `${Math.floor((result.time_spent || 0) / 60)}m` },
    ];
    const kpiX = PAGE.margin + 60;
    const kpiW = (PAGE.contentWidth - 60) / 4;
    kpis.forEach((k, i) => {
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.text(k.label.toUpperCase(), kpiX + i * kpiW + kpiW / 2, y + 12, { align: 'center' });
      doc.setFontSize(15);
      doc.setFont('helvetica', 'bold');
      doc.text(k.value, kpiX + i * kpiW + kpiW / 2, y + 22, { align: 'center' });
    });
    y += 38;

    // AI Insights
    if ((result.ai_strengths?.length ?? 0) > 0 || (result.ai_improvements?.length ?? 0) > 0 || (result.ai_topic_tags?.length ?? 0) > 0) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(BRAND.ink[0], BRAND.ink[1], BRAND.ink[2]);
      doc.text('AI Performance Insights', PAGE.margin, y);
      y += 6;

      const renderList = (
        title: string,
        color: [number, number, number],
        items: string[],
      ) => {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(color[0], color[1], color[2]);
        doc.text(title, PAGE.margin, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(BRAND.ink[0], BRAND.ink[1], BRAND.ink[2]);
        items.forEach((s) => {
          const lines = doc.splitTextToSize(`• ${s}`, PAGE.contentWidth - 4);
          y = ensureSpace(doc, y, lines.length * 5 + 2, logoBase64);
          doc.text(lines, PAGE.margin + 2, y);
          y += lines.length * 5;
        });
        y += 3;
      };

      if (result.ai_strengths?.length) renderList('Strengths', BRAND.success, result.ai_strengths);
      if (result.ai_improvements?.length) renderList('Areas for Improvement', BRAND.warning, result.ai_improvements);
      if (result.ai_topic_tags?.length) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(BRAND.primary[0], BRAND.primary[1], BRAND.primary[2]);
        doc.text('Topics to Review', PAGE.margin, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(BRAND.ink[0], BRAND.ink[1], BRAND.ink[2]);
        const topicLines = doc.splitTextToSize(result.ai_topic_tags.join(', '), PAGE.contentWidth - 4);
        y = ensureSpace(doc, y, topicLines.length * 5 + 2, logoBase64);
        doc.text(topicLines, PAGE.margin + 2, y);
        y += topicLines.length * 5 + 2;
      }
    }

    // Detailed Q-by-Q review
    y += 4;
    const qa = await fetchQuestionsForReport(testId, result.difficulty_level);
    y = ensureSpace(doc, y, 30, logoBase64);
    renderAnswerReview(doc, y, qa, result.answers || {}, logoBase64);

    const total = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      drawFooter(doc, i, total);
    }

    doc.save(`${result.student_name}_${testTitle}_report.pdf`);
    toast({ title: 'Downloaded', description: 'PDF report downloaded successfully' });
  };

  const exportAllResults = async () => {
    const doc = new jsPDF();
    const logoBase64 = await loadImageAsBase64(sckoolLogo);

    drawWatermark(doc, logoBase64);
    let y = drawHeader(doc, logoBase64, 'ASD Benchmark Portal', `${testTitle} — Class Report`);

    const avgScoreValue = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length)
      : 0;
    const passRate = results.length > 0
      ? Math.round(results.filter(r => (r.score || 0) >= 50).length / results.length * 100)
      : 0;
    const highestScore = results.length > 0 ? Math.max(...results.map(r => r.score || 0)) : 0;
    const avgTimeValue = results.length > 0
      ? Math.round(results.reduce((sum, r) => sum + (r.time_spent || 0), 0) / results.length / 60)
      : 0;

    // KPI strip
    const kpis = [
      { label: 'Attempts', value: `${results.length}`, color: BRAND.primary },
      { label: 'Avg Score', value: `${avgScoreValue}%`, color: BRAND.success },
      { label: 'Pass Rate', value: `${passRate}%`, color: BRAND.warning },
      { label: 'Highest', value: `${highestScore}%`, color: BRAND.danger },
      { label: 'Avg Time', value: `${avgTimeValue}m`, color: BRAND.muted },
    ];
    const cellW = (PAGE.contentWidth - 4 * 3) / 5;
    kpis.forEach((k, i) => {
      const x = PAGE.margin + i * (cellW + 3);
      doc.setFillColor(k.color[0], k.color[1], k.color[2]);
      doc.roundedRect(x, y, cellW, 24, 2, 2, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(14);
      doc.text(k.value, x + cellW / 2, y + 12, { align: 'center' });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(k.label, x + cellW / 2, y + 19, { align: 'center' });
    });
    y += 32;

    // AI class summary
    if (classSummary?.summary) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(BRAND.ink[0], BRAND.ink[1], BRAND.ink[2]);
      doc.text('AI Class Summary', PAGE.margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9.5);
      doc.setTextColor(80, 80, 80);
      const summaryLines = doc.splitTextToSize(classSummary.summary, PAGE.contentWidth);
      y = ensureSpace(doc, y, summaryLines.length * 5 + 4, logoBase64);
      doc.text(summaryLines, PAGE.margin, y);
      y += summaryLines.length * 5 + 4;

      if (Object.keys(classSummary.topicHeatmap).length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(BRAND.ink[0], BRAND.ink[1], BRAND.ink[2]);
        doc.text('Topic Mastery', PAGE.margin, y);
        y += 5;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8.5);
        doc.setTextColor(80, 80, 80);
        const heatmapText = Object.entries(classSummary.topicHeatmap)
          .map(([t, l]) => `${t}: ${typeof l === 'string' ? l : (l as any).level}`)
          .join('  •  ');
        const heatLines = doc.splitTextToSize(heatmapText, PAGE.contentWidth);
        y = ensureSpace(doc, y, heatLines.length * 5 + 4, logoBase64);
        doc.text(heatLines, PAGE.margin, y);
        y += heatLines.length * 5 + 6;
      }
    }

    // Breakdowns
    const renderBreakdown = (
      title: string,
      data: Record<string, { total: number; count: number }>,
    ) => {
      y = ensureSpace(doc, y, 14 + Object.keys(data).length * 6, logoBase64);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(BRAND.ink[0], BRAND.ink[1], BRAND.ink[2]);
      doc.text(title, PAGE.margin, y);
      y += 6;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      Object.entries(data).forEach(([key, d]) => {
        const avg = d.count > 0 ? Math.round(d.total / d.count) : 0;
        doc.text(`• ${key}: ${d.count} attempt(s), ${avg}% avg`, PAGE.margin + 3, y);
        y += 5.5;
      });
      y += 3;
    };

    const groupBy = (key: (r: TestResult) => string) =>
      results.reduce((acc: Record<string, { total: number; count: number }>, r) => {
        const k = key(r);
        if (!acc[k]) acc[k] = { total: 0, count: 0 };
        acc[k].total += r.score || 0;
        acc[k].count += 1;
        return acc;
      }, {});

    renderBreakdown('Performance by Difficulty', groupBy(r => r.difficulty_level || 'Unknown'));
    renderBreakdown('Performance by Gender', groupBy(r => r.student_gender || 'Unknown'));
    renderBreakdown(
      'Performance by Class',
      groupBy(r => (r.student_grade && r.student_class ? `${r.student_grade} - ${r.student_class}` : 'Unknown')),
    );

    // Individual results table
    doc.addPage();
    drawWatermark(doc, logoBase64);
    y = drawHeader(doc, logoBase64, 'ASD Benchmark Portal', 'Individual Results');

    doc.setFillColor(BRAND.primary[0], BRAND.primary[1], BRAND.primary[2]);
    doc.rect(PAGE.margin, y, PAGE.contentWidth, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('Student', PAGE.margin + 2, y + 5.5);
    doc.text('Grade', PAGE.margin + 60, y + 5.5);
    doc.text('Score', PAGE.margin + 88, y + 5.5);
    doc.text('Correct', PAGE.margin + 110, y + 5.5);
    doc.text('Time', PAGE.margin + 138, y + 5.5);
    doc.text('Date', PAGE.margin + 156, y + 5.5);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(BRAND.ink[0], BRAND.ink[1], BRAND.ink[2]);

    results.forEach((r, index) => {
      y = ensureSpace(doc, y, 7, logoBase64);
      if (index % 2 === 0) {
        doc.setFillColor(BRAND.surface[0], BRAND.surface[1], BRAND.surface[2]);
        doc.rect(PAGE.margin, y - 4, PAGE.contentWidth, 6.5, 'F');
      }
      doc.text((r.student_name || 'Unknown').substring(0, 28), PAGE.margin + 2, y);
      doc.text(r.student_grade || '-', PAGE.margin + 60, y);
      doc.text(`${r.score || 0}%`, PAGE.margin + 88, y);
      doc.text(`${r.correct_answers || 0}/${r.total_questions || 0}`, PAGE.margin + 110, y);
      doc.text(`${Math.floor((r.time_spent || 0) / 60)}m`, PAGE.margin + 138, y);
      doc.text(new Date(r.completed_at).toLocaleDateString(), PAGE.margin + 156, y);
      y += 7;
    });

    // Paginate footers
    const total = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      drawFooter(doc, i, total);
    }

    doc.save(`${testTitle}_complete_report.pdf`);
    toast({ title: 'Exported', description: 'Complete report exported to PDF' });
  };

  // Analytics calculations
  const avgScore = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length)
    : 0;

  const avgTime = results.length > 0
    ? Math.round(results.reduce((sum, r) => sum + (r.time_spent || 0), 0) / results.length / 60)
    : 0;

  const scoreTrend = results
    .slice()
    .sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime())
    .slice(-15)
    .map(r => ({
      name: r.student_name?.split(' ')[0] || 'Unknown',
      score: r.score || 0,
      fullName: r.student_name,
    }));

  const difficultyData = Object.entries(
    results.reduce((acc: Record<string, { total: number; count: number }>, r) => {
      const diff = r.difficulty_level || 'Unknown';
      if (!acc[diff]) acc[diff] = { total: 0, count: 0 };
      acc[diff].total += r.score || 0;
      acc[diff].count += 1;
      return acc;
    }, {})
  ).map(([level, data]) => ({
    level,
    avgScore: data.count > 0 ? Math.round(data.total / data.count) : 0,
    count: data.count,
  }));

  const genderData = Object.entries(
    results.reduce((acc: Record<string, { total: number; count: number }>, r) => {
      const gender = r.student_gender || 'Unknown';
      if (!acc[gender]) acc[gender] = { total: 0, count: 0 };
      acc[gender].total += r.score || 0;
      acc[gender].count += 1;
      return acc;
    }, {})
  ).map(([gender, data]) => ({
    gender,
    avgScore: data.count > 0 ? Math.round(data.total / data.count) : 0,
    count: data.count,
  }));

  const classData = Object.entries(
    results.reduce((acc: Record<string, { total: number; count: number }>, r) => {
      const className = r.student_grade && r.student_class
        ? `${r.student_grade}-${r.student_class}`
        : 'Unknown';
      if (!acc[className]) acc[className] = { total: 0, count: 0 };
      acc[className].total += r.score || 0;
      acc[className].count += 1;
      return acc;
    }, {})
  ).map(([name, data]) => ({
    name,
    avgScore: data.count > 0 ? Math.round(data.total / data.count) : 0,
    count: data.count,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // If a specific student result is selected, show detail view
  if (selectedResult) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setSelectedResult(null)} className="rounded-xl">
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h2 className="text-2xl font-semibold">{selectedResult.student_name}</h2>
              <p className="text-sm text-muted-foreground">
                {testTitle} • {new Date(selectedResult.completed_at).toLocaleDateString()}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => (selectedResult.ai_strengths?.length || selectedResult.ai_improvements?.length)
                ? regenerateStudentInsights(selectedResult.id)
                : generateStudentInsights(selectedResult.id)}
              className="gap-2 rounded-xl"
            >
              <Sparkles className="h-4 w-4" />
              {(selectedResult.ai_strengths?.length || selectedResult.ai_improvements?.length) ? 'Regenerate Insights' : 'Generate Insights'}
            </Button>
            <Button onClick={() => generatePDF(selectedResult)} className="gap-2 rounded-xl">
              <Download className="h-4 w-4" />
              Download Report
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="cloud-bubble p-4">
            <p className="text-xs text-muted-foreground">Score</p>
            <p className="text-2xl font-bold text-primary">{selectedResult.score}%</p>
          </Card>
          <Card className="cloud-bubble p-4">
            <p className="text-xs text-muted-foreground">Correct</p>
            <p className="text-2xl font-bold text-success">{selectedResult.correct_answers}</p>
          </Card>
          <Card className="cloud-bubble p-4">
            <p className="text-xs text-muted-foreground">Wrong</p>
            <p className="text-2xl font-bold text-destructive">{selectedResult.wrong_answers}</p>
          </Card>
          <Card className="cloud-bubble p-4">
            <p className="text-xs text-muted-foreground">Time</p>
            <p className="text-2xl font-bold">{Math.floor((selectedResult.time_spent || 0) / 60)}m</p>
          </Card>
          <Card className="cloud-bubble p-4">
            <p className="text-xs text-muted-foreground">Difficulty</p>
            <p className="text-lg font-bold capitalize">{selectedResult.difficulty_level || 'N/A'}</p>
          </Card>
        </div>

        {/* AI Insights */}
        <AIInsights
          strengths={selectedResult.ai_strengths || []}
          improvements={selectedResult.ai_improvements || []}
          topicTags={selectedResult.ai_topic_tags || []}
        />

        {/* Question Review */}
        <Card className="cloud-bubble p-6">
          <QuestionReview
            testId={testId}
            answers={selectedResult.answers || {}}
            difficultyFilter={selectedResult.difficulty_level}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="text-2xl font-semibold">{testTitle}</h2>
            <p className="text-sm text-muted-foreground">Test Results & Analytics</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => generateClassSummary(!!classSummary?.summary)}
            disabled={generatingSummary || results.length === 0 || summaryCooldown > 0}
            className="gap-2 rounded-xl"
          >
            <Sparkles className="h-4 w-4" />
            {generatingSummary ? 'Generating...' : summaryCooldown > 0 ? `Wait ${summaryCooldown}s` : classSummary?.summary ? 'Regenerate Summary' : 'Generate AI Summary'}
          </Button>
          <Button onClick={exportAllResults} className="gap-2 rounded-xl">
            <Download className="h-4 w-4" />
            Export Statistics (PDF)
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cloud-bubble p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Attempts</p>
              <p className="text-2xl font-bold">{results.length}</p>
            </div>
          </div>
        </Card>
        <Card className="cloud-bubble p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-success/10 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Score</p>
              <p className="text-2xl font-bold">{avgScore}%</p>
            </div>
          </div>
        </Card>
        <Card className="cloud-bubble p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Avg Time</p>
              <p className="text-2xl font-bold">{avgTime} min</p>
            </div>
          </div>
        </Card>
        <Card className="cloud-bubble p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-secondary/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-secondary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Pass Rate</p>
              <p className="text-2xl font-bold">
                {results.length > 0
                  ? Math.round(results.filter(r => (r.score || 0) >= 50).length / results.length * 100)
                  : 0}%
              </p>
            </div>
          </div>
        </Card>
      </div>

      {/* AI Class Summary */}
      <ClassSummary
        summary={classSummary?.summary || ''}
        topicHeatmap={classSummary?.topicHeatmap || {}}
        isLoading={generatingSummary}
      />

      {/* Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="cloud-bubble p-6">
          <h3 className="text-lg font-semibold mb-4">Score Trend by Student</h3>
          {scoreTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={scoreTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="name"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '1rem'
                  }}
                  formatter={(value, name, props) => [
                    `${value}%`,
                    props.payload.fullName
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  strokeWidth={3}
                  dot={{ fill: 'hsl(var(--primary))' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-center py-8">No data yet</p>
          )}
        </Card>

        <Card className="cloud-bubble p-6">
          <h3 className="text-lg font-semibold mb-4">Performance by Difficulty</h3>
          {difficultyData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={difficultyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="level" stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '1rem'
                  }}
                  formatter={(value, name) => [
                    name === 'avgScore' ? `${value}%` : value,
                    name === 'avgScore' ? 'Avg Score' : 'Count'
                  ]}
                />
                <Bar dataKey="avgScore" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-center py-8">No data yet</p>
          )}
        </Card>
      </div>

      {/* Gender and Class Charts */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="cloud-bubble p-6">
          <h3 className="text-lg font-semibold mb-4">Performance by Gender</h3>
          {genderData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={genderData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="gender" stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '1rem'
                  }}
                />
                <Bar dataKey="avgScore" fill="hsl(var(--secondary))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-center py-8">No data yet</p>
          )}
        </Card>

        <Card className="cloud-bubble p-6">
          <h3 className="text-lg font-semibold mb-4">Performance by Class</h3>
          {classData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={classData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '1rem'
                  }}
                />
                <Bar dataKey="avgScore" fill="hsl(var(--accent))" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-muted-foreground text-center py-8">No data yet</p>
          )}
        </Card>
      </div>

      {/* Results List */}
      <Card className="cloud-bubble p-6">
        <h3 className="text-lg font-semibold mb-4">Individual Results</h3>
        <div className="space-y-3">
          {results.length === 0 ? (
            <p className="text-muted-foreground text-center py-8">No results yet</p>
          ) : (
            results.map((result) => (
              <div
                key={result.id}
                className="p-4 bg-muted/30 rounded-xl hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <p className="font-semibold">{result.student_name}</p>
                      <StatusBadge status={result.status} />
                      {result.student_grade && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted">
                          {result.student_grade} - {result.student_class}
                        </span>
                      )}
                      {result.student_gender && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-muted/50">
                          {result.student_gender}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3 w-3 text-success" />
                        {result.correct_answers || 0} correct
                      </span>
                      <span className="flex items-center gap-1">
                        <XCircle className="h-3 w-3 text-destructive" />
                        {result.wrong_answers || 0} wrong
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {Math.floor((result.time_spent || 0) / 60)} min
                      </span>
                      {result.difficulty_level && (
                        <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs">
                          {result.difficulty_level}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-2xl font-bold text-primary">{result.score || 0}%</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(result.completed_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setSelectedResult(result)}
                      className="rounded-xl gap-1"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      Review
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => generatePDF(result)}
                      className="rounded-xl"
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
};
