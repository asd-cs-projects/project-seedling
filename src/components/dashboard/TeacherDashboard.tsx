import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LogOut, Users, TrendingUp, BarChart3, FileText } from "lucide-react";

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const [teacherData, setTeacherData] = useState<any>(null);

  useEffect(() => {
    const data = localStorage.getItem("teacherData");
    if (!data) { navigate("/"); return; }
    setTeacherData(JSON.parse(data));
  }, [navigate]);

  const handleLogout = () => { localStorage.clear(); navigate("/"); };
  if (!teacherData) return null;

  const classStats = { totalStudents: 45, averageScore: 78, completionRate: 89, topPerformers: 12 };
  const recentTests = [
    { id: 1, student: "John Doe", grade: 9, class: "A", score: 85, level: "Hard", date: "2025-01-15" },
    { id: 2, student: "Jane Smith", grade: 9, class: "A", score: 92, level: "Hard", date: "2025-01-15" },
    { id: 3, student: "Mike Johnson", grade: 9, class: "B", score: 74, level: "Medium", date: "2025-01-14" },
    { id: 4, student: "Sarah Williams", grade: 10, class: "A", score: 88, level: "Hard", date: "2025-01-14" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/10 to-primary/5 p-6">
      <div className="container mx-auto max-w-7xl">
        <div className="cloud-bubble p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Teacher Dashboard</h1>
              <p className="text-muted-foreground mt-1">Welcome, {teacherData.name} • {teacherData.subject}</p>
            </div>
            <Button onClick={handleLogout} variant="outline" className="rounded-xl">
              <LogOut className="h-4 w-4 mr-2" />Logout
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-6 mb-6">
          <div className="stat-card text-center"><Users className="h-10 w-10 text-primary mx-auto mb-3" />
            <p className="text-3xl font-bold text-foreground">{classStats.totalStudents}</p>
            <p className="text-sm text-muted-foreground mt-1">Total Students</p></div>
          <div className="stat-card text-center"><TrendingUp className="h-10 w-10 text-secondary mx-auto mb-3" />
            <p className="text-3xl font-bold text-foreground">{classStats.averageScore}%</p>
            <p className="text-sm text-muted-foreground mt-1">Average Score</p></div>
          <div className="stat-card text-center"><BarChart3 className="h-10 w-10 text-accent-foreground mx-auto mb-3" />
            <p className="text-3xl font-bold text-foreground">{classStats.completionRate}%</p>
            <p className="text-sm text-muted-foreground mt-1">Completion Rate</p></div>
          <div className="stat-card text-center"><FileText className="h-10 w-10 text-success mx-auto mb-3" />
            <p className="text-3xl font-bold text-foreground">{classStats.topPerformers}</p>
            <p className="text-sm text-muted-foreground mt-1">Top Performers</p></div>
        </div>

        <div className="cloud-bubble p-6">
          <Tabs defaultValue="recent">
            <TabsList className="mb-6">
              <TabsTrigger value="recent">Recent Assessments</TabsTrigger>
              <TabsTrigger value="analytics">Analytics</TabsTrigger>
              <TabsTrigger value="students">Student Management</TabsTrigger>
            </TabsList>
            <TabsContent value="recent">
              <h2 className="text-xl font-semibold text-foreground mb-4">Recent Test Results</h2>
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Student</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Grade</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Class</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Level</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Score</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTests.map((t) => (
                    <tr key={t.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-4 text-foreground">{t.student}</td>
                      <td className="py-3 px-4 text-foreground">{t.grade}</td>
                      <td className="py-3 px-4 text-foreground">{t.class}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          t.level === "Hard" ? "bg-destructive/10 text-destructive" :
                          t.level === "Medium" ? "bg-warning/10 text-warning" : "bg-success/10 text-success"
                        }`}>{t.level}</span>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`font-semibold ${
                          t.score >= 85 ? "text-success" : t.score >= 70 ? "text-primary" : "text-warning"
                        }`}>{t.score}%</span>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{t.date}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabsContent>
            <TabsContent value="analytics">
              <h2 className="text-xl font-semibold text-foreground mb-6">Performance Analytics</h2>
              <div className="grid md:grid-cols-2 gap-6">
                <div className="stat-card">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Score Distribution</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">90-100%</span>
                        <span className="font-medium text-foreground">8 students</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-success h-2 rounded-full" style={{ width: '18%' }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">80-89%</span>
                        <span className="font-medium text-foreground">15 students</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full" style={{ width: '33%' }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">70-79%</span>
                        <span className="font-medium text-foreground">12 students</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-secondary h-2 rounded-full" style={{ width: '27%' }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Below 70%</span>
                        <span className="font-medium text-foreground">10 students</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-warning h-2 rounded-full" style={{ width: '22%' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="stat-card">
                  <h3 className="text-lg font-semibold text-foreground mb-4">Difficulty Level Distribution</h3>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Easy Level</span>
                        <span className="font-medium text-foreground">12 students</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-success h-2 rounded-full" style={{ width: '27%' }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Medium Level</span>
                        <span className="font-medium text-foreground">20 students</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-primary h-2 rounded-full" style={{ width: '44%' }}></div>
                      </div>
                    </div>
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-muted-foreground">Hard Level</span>
                        <span className="font-medium text-foreground">13 students</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div className="bg-destructive h-2 rounded-full" style={{ width: '29%' }}></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
            <TabsContent value="students">
              <div className="text-center py-12">
                <p className="text-muted-foreground">Student management features coming soon</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default TeacherDashboard;
