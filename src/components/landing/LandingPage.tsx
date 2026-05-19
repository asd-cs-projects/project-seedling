import { useNavigate } from "react-router-dom";
import { GraduationCap, UserCircle } from "lucide-react";
import sckoolLogo from "@/assets/sckool-logo.jpeg";
const LandingPage = () => {
  const navigate = useNavigate();
  return <div className="min-h-screen bg-gradient-to-br from-background via-accent/20 to-primary/10 flex flex-col items-center justify-center p-6">
      {/* Logo & Title */}
      <div className="text-center mb-16 animate-fade-in">
        <div className="w-24 h-24 rounded-full overflow-hidden mx-auto mb-6 shadow-lg border-4 border-primary/20">
          <img src={sckoolLogo} alt="Sckool Logo" className="w-full h-full object-cover" />
        </div>
        <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-3"> ASD Benchmark Portal</h1>
        <p className="text-lg text-muted-foreground max-w-md mx-auto">Empowering Learners to Inspire, Inquire & Innovate</p>
      </div>

      {/* Role Selection Bubbles */}
      <div className="flex flex-col md:flex-row gap-8 md:gap-12 animate-enter">
        {/* Student Bubble */}
        <button onClick={() => navigate("/auth?role=student")} className="role-bubble group">
          <div className="role-bubble-icon bg-primary/10">
            <GraduationCap className="w-12 h-12 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Student</h2>
            <p className="text-muted-foreground text-sm">Practice Assessments & Enhance Learning</p>
          </div>
        </button>

        {/* Teacher Bubble */}
        <button onClick={() => navigate("/auth?role=teacher")} className="role-bubble group">
          <div className="role-bubble-icon bg-secondary/10">
            <UserCircle className="w-12 h-12 text-secondary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-foreground mb-2">Teacher</h2>
            <p className="text-muted-foreground text-sm">Create Tests and Monitor Student Progress</p>
          </div>
        </button>
      </div>

      {/* Footer */}
      <p className="mt-16 text-sm text-muted-foreground animate-fade-in">
        ASD Benchmark Assessment Platform
      </p>
    </div>;
};
export default LandingPage;