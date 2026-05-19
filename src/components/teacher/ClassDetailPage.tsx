import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Download, Users, Clock, CheckCircle, TrendingUp, FileText, BookOpen } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
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
} from '@/lib/pdfReport';

interface ClassDetailPageProps {
  teacherId: string;
  onBack: () => void;
}

interface ResultRow {
  id: string;
  test_id: string;
  student_id: string;
  score: number;
  correct_answers: number;
  wrong_answers: number;
  total_questions: number;
  time_spent: number;
  difficulty_level: string | null;
  completed_at: string;
}

export const ClassDetailPage = ({ teacherId, onBack }: ClassDetailPageProps) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<any[]>([]);
  const [tests, setTests] = useState<any[]>([]);
  const [results, setResults] = useState<ResultRow[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');

  useEffect(() => {
    fetchAll();
  }, [teacherId]);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [{ data: profs }, { data: testRows }] = await Promise.all([
        supabase.from('profiles').select('*'),
        supabase.from('tests').select('*').eq('teacher_id', teacherId),
      ]);

      setStudents(profs || []);
      setTests(testRows || []);

      if (testRows && testRows.length > 0) {
        const testIds = testRows.map((t) => t.id);
        const { data: res } = await supabase
          .from('test_results')
          .select('*')
          .in('test_id', testIds)
          .eq('is_retake', false);
        setResults((res || []) as ResultRow[]);
      }
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Failed to load class data', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Build class options from student profiles
  const classOptions = useMemo(() => {
    const set = new Set<string>();
    students.forEach((s) => {
      if (s.grade && s.class) set.add(`${s.grade}-${s.class}`);
    });
    return Array.from(set).sort();
  }, [students]);

  // Default to first class once loaded
  useEffect(() => {
    if (!selectedClass && classOptions.length > 0) setSelectedClass(classOptions[0]);
  }, [classOptions, selectedClass]);

  const studentsById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const s of students) m[s.user_id] = s;
    return m;
  }, [students]);

  const testsById = useMemo(() => {
    const m: Record<string, any> = {};
    for (const t of tests) m[t.id] = t;
    return m;
  }, [tests]);

  // Filter to this class
  const { classStudents, classResults, perTest, perStudent } = useMemo(() => {
    if (!selectedClass) {
      return { classStudents: [] as any[], classResults: [] as ResultRow[], perTest: [] as any[], perStudent: [] as any[] };
    }
    const [grade, section] = selectedClass.split('-');
    const cs = students.filter((s) => s.grade === grade && s.class === section);
    const ids = new Set(cs.map((s) => s.user_id));
    const cr = results.filter((r) => ids.has(r.student_id));

    const byTest: Record<string, ResultRow[]> = {};
    cr.forEach((r) => {
      (byTest[r.test_id] ??= []).push(r);
    });
    const pt = Object.entries(byTest)
      .map(([tid, rs]) => {
        const test = testsById[tid];
        const avg = rs.length ? Math.round(rs.reduce((s, r) => s + (r.score || 0), 0) / rs.length) : 0;
        return {
          test_id: tid,
          title: test?.title || 'Unknown Test',
          subject: test?.subject || '',
          attempts: rs.length,
          avgScore: avg,
          best: rs.length ? Math.max(...rs.map((r) => r.score || 0)) : 0,
          lastDate: rs
            .map((r) => new Date(r.completed_at).getTime())
            .reduce((a, b) => Math.max(a, b), 0),
        };
      })
      .sort((a, b) => b.lastDate - a.lastDate);

    const byStudent: Record<string, ResultRow[]> = {};
    cr.forEach((r) => {
      (byStudent[r.student_id] ??= []).push(r);
    });
    const ps = cs
      .map((s) => {
        const rs = byStudent[s.user_id] || [];
        const avg = rs.length ? Math.round(rs.reduce((sum, r) => sum + (r.score || 0), 0) / rs.length) : 0;
        return {
          student_id: s.user_id,
          name: s.full_name || 'Unknown',
          testsTaken: rs.length,
          avgScore: avg,
        };
      })
      .sort((a, b) => b.avgScore - a.avgScore);

    return { classStudents: cs, classResults: cr, perTest: pt, perStudent: ps };
  }, [selectedClass, students, results, testsById]);

  const stats = useMemo(() => {
    const avg = classResults.length
      ? Math.round(classResults.reduce((s, r) => s + (r.score || 0), 0) / classResults.length)
      : 0;
    const totalTime = classResults.reduce((s, r) => s + (r.time_spent || 0), 0);
    const passRate = classResults.length
      ? Math.round((classResults.filter((r) => (r.score || 0) >= 50).length / classResults.length) * 100)
      : 0;
    const uniqueTests = new Set(classResults.map((r) => r.test_id)).size;
    return {
      avg,
      totalTime: Math.round(totalTime / 60),
      passRate,
      uniqueTests,
      attempts: classResults.length,
      studentsCount: classStudents.length,
    };
  }, [classResults, classStudents]);

  const trendData = useMemo(
    () =>
      [...classResults]
        .sort((a, b) => new Date(a.completed_at).getTime() - new Date(b.completed_at).getTime())
        .slice(-15)
        .map((r, i) => ({
          name: studentsById[r.student_id]?.full_name?.split(' ')[0] || `S${i + 1}`,
          score: r.score || 0,
        })),
    [classResults, studentsById],
  );

  const exportPDF = async () => {
    if (!selectedClass) return;
    const doc = new jsPDF();
    const logo = await loadImageAsBase64(sckoolLogo);
    drawWatermark(doc, logo);
    let y = drawHeader(doc, logo, 'ASD Benchmark Portal', `Class ${selectedClass} — Performance Report`);

    // Class info card
    doc.setFillColor(BRAND.surface[0], BRAND.surface[1], BRAND.surface[2]);
    doc.roundedRect(PAGE.margin, y, PAGE.contentWidth, 18, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(BRAND.ink[0], BRAND.ink[1], BRAND.ink[2]);
    doc.text(`Class ${selectedClass}`, PAGE.margin + 4, y + 7);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(BRAND.muted[0], BRAND.muted[1], BRAND.muted[2]);
    doc.text(
      `${stats.studentsCount} students enrolled  •  ${stats.uniqueTests} distinct tests  •  ${stats.attempts} total attempts`,
      PAGE.margin + 4,
      y + 14,
    );
    y += 24;

    // KPI strip
    const kpis = [
      { label: 'Students', value: `${stats.studentsCount}`, color: BRAND.primary },
      { label: 'Avg Score', value: `${stats.avg}%`, color: BRAND.success },
      { label: 'Pass Rate', value: `${stats.passRate}%`, color: BRAND.warning },
      { label: 'Tests', value: `${stats.uniqueTests}`, color: BRAND.danger },
      { label: 'Total Time', value: `${stats.totalTime}m`, color: BRAND.muted },
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

    // Per-test breakdown table
    y = ensureSpace(doc, y, 16, logo);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(BRAND.ink[0], BRAND.ink[1], BRAND.ink[2]);
    doc.text('Tests Taken by This Class', PAGE.margin, y);
    y += 6;

    doc.setFillColor(BRAND.primary[0], BRAND.primary[1], BRAND.primary[2]);
    doc.rect(PAGE.margin, y, PAGE.contentWidth, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('Test', PAGE.margin + 2, y + 5.5);
    doc.text('Subject', PAGE.margin + 80, y + 5.5);
    doc.text('Attempts', PAGE.margin + 115, y + 5.5);
    doc.text('Avg', PAGE.margin + 140, y + 5.5);
    doc.text('Best', PAGE.margin + 160, y + 5.5);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(BRAND.ink[0], BRAND.ink[1], BRAND.ink[2]);
    perTest.forEach((t, i) => {
      y = ensureSpace(doc, y, 7, logo);
      if (i % 2 === 0) {
        doc.setFillColor(BRAND.surface[0], BRAND.surface[1], BRAND.surface[2]);
        doc.rect(PAGE.margin, y - 4, PAGE.contentWidth, 6.5, 'F');
      }
      doc.text((t.title || '').substring(0, 36), PAGE.margin + 2, y);
      doc.text((t.subject || '-').substring(0, 14), PAGE.margin + 80, y);
      doc.text(`${t.attempts}`, PAGE.margin + 115, y);
      doc.text(`${t.avgScore}%`, PAGE.margin + 140, y);
      doc.text(`${t.best}%`, PAGE.margin + 160, y);
      y += 7;
    });
    y += 6;

    // Per-student leaderboard
    y = ensureSpace(doc, y, 16, logo);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(BRAND.ink[0], BRAND.ink[1], BRAND.ink[2]);
    doc.text('Student Leaderboard', PAGE.margin, y);
    y += 6;

    doc.setFillColor(BRAND.primary[0], BRAND.primary[1], BRAND.primary[2]);
    doc.rect(PAGE.margin, y, PAGE.contentWidth, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('#', PAGE.margin + 2, y + 5.5);
    doc.text('Student', PAGE.margin + 14, y + 5.5);
    doc.text('Tests Taken', PAGE.margin + 110, y + 5.5);
    doc.text('Avg Score', PAGE.margin + 150, y + 5.5);
    y += 10;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(BRAND.ink[0], BRAND.ink[1], BRAND.ink[2]);
    perStudent.forEach((s, i) => {
      y = ensureSpace(doc, y, 7, logo);
      if (i % 2 === 0) {
        doc.setFillColor(BRAND.surface[0], BRAND.surface[1], BRAND.surface[2]);
        doc.rect(PAGE.margin, y - 4, PAGE.contentWidth, 6.5, 'F');
      }
      doc.text(`${i + 1}`, PAGE.margin + 2, y);
      doc.text((s.name || '').substring(0, 40), PAGE.margin + 14, y);
      doc.text(`${s.testsTaken}`, PAGE.margin + 110, y);
      doc.text(s.testsTaken > 0 ? `${s.avgScore}%` : '—', PAGE.margin + 150, y);
      y += 7;
    });

    const total = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      doc.setPage(i);
      drawFooter(doc, i, total);
    }
    doc.save(`Class_${selectedClass}_report.pdf`);
    toast({ title: 'Downloaded', description: 'Class report saved as PDF' });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-xl">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
              <Users className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold">Class Performance</h2>
              <p className="text-sm text-muted-foreground">
                Aggregate tests &amp; summaries by class
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={selectedClass} onValueChange={setSelectedClass}>
            <SelectTrigger className="w-[180px] rounded-xl">
              <SelectValue placeholder="Select class" />
            </SelectTrigger>
            <SelectContent>
              {classOptions.length === 0 ? (
                <SelectItem value="__none" disabled>
                  No classes found
                </SelectItem>
              ) : (
                classOptions.map((c) => (
                  <SelectItem key={c} value={c}>
                    Class {c}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
          <Button
            onClick={exportPDF}
            disabled={!selectedClass || classResults.length === 0}
            className="gap-2 rounded-xl"
          >
            <Download className="h-4 w-4" />
            Download Report (PDF)
          </Button>
        </div>
      </div>

      {!selectedClass ? (
        <Card className="cloud-bubble p-12 text-center text-muted-foreground">
          Select a class to view its summary.
        </Card>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card className="cloud-bubble p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Students</p>
                  <p className="text-2xl font-bold">{stats.studentsCount}</p>
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
                  <p className="text-2xl font-bold">{stats.avg}%</p>
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
                  <p className="text-2xl font-bold">{stats.passRate}%</p>
                </div>
              </div>
            </Card>
            <Card className="cloud-bubble p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-accent/30 flex items-center justify-center">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Tests Taken</p>
                  <p className="text-2xl font-bold">{stats.uniqueTests}</p>
                </div>
              </div>
            </Card>
            <Card className="cloud-bubble p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center">
                  <Clock className="h-5 w-5 text-warning" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total Time</p>
                  <p className="text-2xl font-bold">{stats.totalTime}m</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Charts */}
          <div className="grid md:grid-cols-2 gap-6">
            <Card className="cloud-bubble p-6">
              <h3 className="text-lg font-semibold mb-4">Recent Score Trend</h3>
              {trendData.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 12 }} angle={-45} textAnchor="end" height={60} />
                    <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '1rem' }} />
                    <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={3} dot={{ fill: 'hsl(var(--primary))' }} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-center py-8">No attempts yet</p>
              )}
            </Card>

            <Card className="cloud-bubble p-6">
              <h3 className="text-lg font-semibold mb-4">Average per Test</h3>
              {perTest.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={perTest.map((t) => ({ name: t.title.substring(0, 14), avgScore: t.avgScore }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" tick={{ fontSize: 11 }} angle={-30} textAnchor="end" height={70} />
                    <YAxis domain={[0, 100]} stroke="hsl(var(--muted-foreground))" />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '1rem' }} />
                    <Bar dataKey="avgScore" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <p className="text-muted-foreground text-center py-8">No test data yet</p>
              )}
            </Card>
          </div>

          {/* Per-test list */}
          <Card className="cloud-bubble p-6">
            <h3 className="text-lg font-semibold mb-4">Tests Taken by Class {selectedClass}</h3>
            {perTest.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No tests attempted yet</p>
            ) : (
              <div className="space-y-3">
                {perTest.map((t) => (
                  <div key={t.test_id} className="p-4 bg-muted/30 rounded-xl">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold truncate">{t.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {t.subject || '—'} • {t.attempts} attempt(s) • Best {t.best}%
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-2xl font-bold text-primary">{t.avgScore}%</p>
                        <p className="text-xs text-muted-foreground">Class Avg</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Per-student leaderboard */}
          <Card className="cloud-bubble p-6">
            <h3 className="text-lg font-semibold mb-4">Student Leaderboard</h3>
            {perStudent.length === 0 ? (
              <p className="text-muted-foreground text-center py-8">No students in this class yet</p>
            ) : (
              <div className="space-y-2">
                {perStudent.map((s, i) => (
                  <div key={s.student_id} className="flex items-center justify-between p-3 bg-muted/30 rounded-xl">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary shrink-0">
                        {i + 1}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium truncate">{s.name}</p>
                        <p className="text-xs text-muted-foreground">{s.testsTaken} test(s) taken</p>
                      </div>
                    </div>
                    <p className="text-lg font-bold text-primary">
                      {s.testsTaken > 0 ? `${s.avgScore}%` : '—'}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};
