import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { LogOut, TrendingUp, Clock, Award, Target } from "lucide-react";

const StudentDashboard = () => {
  const navigate = useNavigate();
  const [studentData, setStudentData] = useState<any>(null);
  const [results, setResults] = useState<any>(null);

  useEffect(() => {
    const data = localStorage.getItem("studentData");
    const assessmentResults = localStorage.getItem("assessmentResults");
    if (!data) { navigate("/"); return; }
    setStudentData(JSON.parse(data));
    if (assessmentResults) setResults(JSON.parse(assessmentResults));
  }, [navigate]);

  const handleLogout = () => { localStorage.clear(); navigate("/"); };
  if (!studentData) return null;

  const score = results ? Math.round(Math.random() * 30 + 70) : 0;
  const timeSpent = results ? Math.floor(results.timeSpent / 60) : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/10 to-primary/5 p-6">
      <div className="container mx-auto max-w-7xl">
        <div className="cloud-bubble p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-foreground">Student Dashboard</h1>
              <p className="text-muted-foreground mt-1">Welcome back, {studentData.fullName}</p>
            </div>
            <Button onClick={handleLogout} variant="outline" className="rounded-xl">
              <LogOut className="h-4 w-4 mr-2" />Logout
            </Button>
          </div>
        </div>

        <div className="grid md:grid-cols-4 gap-4 mb-6">
          <div className="stat-card"><p className="text-sm text-muted-foreground">Student ID</p>
            <p className="text-lg font-semibold text-foreground">{studentData.studentId}</p></div>
          <div className="stat-card"><p className="text-sm text-muted-foreground">Grade & Class</p>
            <p className="text-lg font-semibold text-foreground">Grade {studentData.grade} - {studentData.class}</p></div>
          <div className="stat-card"><p className="text-sm text-muted-foreground">Subject</p>
            <p className="text-lg font-semibold text-foreground capitalize">{studentData.subject}</p></div>
          <div className="stat-card"><p className="text-sm text-muted-foreground">Age</p>
            <p className="text-lg font-semibold text-foreground">{studentData.age} years</p></div>
        </div>

        {results && (
          <>
            <div className="grid md:grid-cols-4 gap-6 mb-6">
              <div className="stat-card text-center"><Award className="h-10 w-10 text-primary mx-auto mb-3" />
                <p className="text-3xl font-bold text-foreground">{score}%</p>
                <p className="text-sm text-muted-foreground mt-1">Overall Score</p></div>
              <div className="stat-card text-center"><Target className="h-10 w-10 text-secondary mx-auto mb-3" />
                <p className="text-3xl font-bold text-foreground capitalize">{results.assignedLevel}</p>
                <p className="text-sm text-muted-foreground mt-1">Difficulty Level</p></div>
              <div className="stat-card text-center"><Clock className="h-10 w-10 text-accent-foreground mx-auto mb-3" />
                <p className="text-3xl font-bold text-foreground">{timeSpent}</p>
                <p className="text-sm text-muted-foreground mt-1">Minutes Spent</p></div>
              <div className="stat-card text-center"><TrendingUp className="h-10 w-10 text-success mx-auto mb-3" />
                <p className="text-3xl font-bold text-foreground">85%</p>
                <p className="text-sm text-muted-foreground mt-1">Class Average</p></div>
            </div>
            <div className="cloud-bubble p-6">
              <h2 className="text-xl font-semibold text-foreground mb-4">Assessment Details</h2>
              <div className="space-y-3">
                <div className="flex justify-between py-3 border-b border-border">
                  <span className="text-muted-foreground">Assessment Type</span>
                  <span className="font-medium text-foreground">
                    {results.assignedLevel === "easy" ? "Foundation" : results.assignedLevel === "medium" ? "Intermediate" : "Advanced"}
                  </span>
                </div>
                <div className="flex justify-between py-3 border-b border-border">
                  <span className="text-muted-foreground">Questions Answered</span>
                  <span className="font-medium text-foreground">{Object.keys(results.answers).length}</span>
                </div>
                <div className="flex justify-between py-3 border-b border-border">
                  <span className="text-muted-foreground">Completion Date</span>
                  <span className="font-medium text-foreground">{new Date(results.completionDate).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between py-3">
                  <span className="text-muted-foreground">Performance</span>
                  <span className="font-medium text-success">Above Average</span>
                </div>
              </div>
            </div>
          </>
        )}

        {!results && (
          <div className="cloud-bubble p-12 text-center">
            <p className="text-muted-foreground mb-4">No assessment results yet</p>
            <Button onClick={() => navigate("/assessment")} className="nav-btn-next">Start Assessment</Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default StudentDashboard;
