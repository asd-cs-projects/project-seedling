import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ArrowLeft, Download, CheckCircle, XCircle, Clock, Target } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { QuestionReview } from './QuestionReview';
import { AIInsights } from './AIInsights';
import jsPDF from 'jspdf';
import sckoolLogo from '@/assets/sckool-logo.jpeg';
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

interface StudentResultDetailProps {
  resultId: string;
  testId: string;
  onBack: () => void;
}

export const StudentResultDetail = ({ resultId, testId, onBack }: StudentResultDetailProps) => {
  const { toast } = useToast();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchResult();
  }, [resultId]);

  const fetchResult = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('test_results')
        .select(`
          *,
          tests(title, subject)
        `)
        .eq('id', resultId)
        .single();

      if (error) throw error;
      setResult(data);
    } catch (error) {
      console.error('Error fetching result:', error);
      toast({ title: 'Error', description: 'Failed to load result details', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const generatePDF = async () => {
    if (!result) return;

    const doc = new jsPDF();
    const logoBase64 = await loadImageAsBase64(sckoolLogo);

    drawWatermark(doc, logoBase64);
    let y = drawHeader(doc, logoBase64, 'ASD Benchmark Portal', 'Student Performance Report');

    // Test info row
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(BRAND.ink[0], BRAND.ink[1], BRAND.ink[2]);
    doc.text(result.tests?.title || 'Assessment', PAGE.margin, y + 4);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(BRAND.muted[0], BRAND.muted[1], BRAND.muted[2]);
    doc.text(
      `Subject: ${result.tests?.subject || 'General'}   •   Date: ${new Date(result.completed_at).toLocaleDateString()}   •   Difficulty: ${result.difficulty_level || 'N/A'}`,
      PAGE.margin,
      y,
    );
    y += 8;

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

    if (result.ai_strengths?.length || result.ai_improvements?.length || result.ai_topic_tags?.length) {
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

    // Detailed Q-by-Q review (filtered by this attempt's difficulty)
    y += 4;
    const qa = await fetchQuestionsForReport(result.test_id || testId, result.difficulty_level);
    y = ensureSpace(doc, y, 30, logoBase64);
    renderAnswerReview(doc, y, qa, result.answers || {}, logoBase64);

    const total = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      drawFooter(doc, i, total);
    }

    doc.save(`${result.tests?.title || 'Test'}_report.pdf`);
    toast({ title: 'Downloaded', description: 'Report downloaded successfully' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Result not found</p>
        <Button onClick={onBack} variant="outline" className="mt-4">Go Back</Button>
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
            <h2 className="text-2xl font-semibold">{result.tests?.title || 'Test Results'}</h2>
            <p className="text-sm text-muted-foreground">
              {result.tests?.subject} • {new Date(result.completed_at).toLocaleDateString()}
            </p>
          </div>
        </div>
        <Button onClick={generatePDF} className="gap-2 rounded-xl">
          <Download className="h-4 w-4" />
          Download Report
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="cloud-bubble p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Target className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Score</p>
              <p className="text-2xl font-bold">{result.score}%</p>
            </div>
          </div>
        </Card>
        <Card className="cloud-bubble p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-green-500/10 flex items-center justify-center">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Correct</p>
              <p className="text-2xl font-bold text-green-600">{result.correct_answers}</p>
            </div>
          </div>
        </Card>
        <Card className="cloud-bubble p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <XCircle className="h-5 w-5 text-red-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Wrong</p>
              <p className="text-2xl font-bold text-red-600">{result.wrong_answers}</p>
            </div>
          </div>
        </Card>
        <Card className="cloud-bubble p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/10 flex items-center justify-center">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Time</p>
              <p className="text-2xl font-bold">{Math.floor((result.time_spent || 0) / 60)}m</p>
            </div>
          </div>
        </Card>
        <Card className="cloud-bubble p-4">
          <div className="text-center">
            <p className="text-xs text-muted-foreground">Difficulty</p>
            <p className="text-lg font-bold capitalize">{result.difficulty_level || 'N/A'}</p>
          </div>
        </Card>
      </div>

      {/* AI Insights */}
      <AIInsights
        strengths={result.ai_strengths || []}
        improvements={result.ai_improvements || []}
        topicTags={result.ai_topic_tags || []}
      />

      {/* Question Review */}
      <Card className="cloud-bubble p-6">
        <QuestionReview
          testId={testId}
          answers={result.answers || {}}
          difficultyFilter={result.difficulty_level}
        />
      </Card>
    </div>
  );
};