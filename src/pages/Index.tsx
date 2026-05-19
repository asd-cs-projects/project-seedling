import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { GraduationCap, BarChart3, BookOpen, Award } from "lucide-react";

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-accent/20 to-primary/10">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-16">
          <h1 className="text-5xl md:text-6xl font-bold text-foreground mb-4">
            ASD Benchmark Assessment Platform
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Professional PISA-Style Assessment System
          </p>
          <Button 
            size="lg" 
            onClick={() => navigate('/login')}
            className="nav-btn-next text-lg px-8 py-6"
          >
            Get Started
          </Button>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8 mt-16">
          <div className="cloud-bubble p-6 text-center">
            <GraduationCap className="h-12 w-12 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">For Students</h3>
            <p className="text-sm text-muted-foreground">
              Take adaptive assessments and track your performance
            </p>
          </div>

          <div className="cloud-bubble p-6 text-center">
            <BarChart3 className="h-12 w-12 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">Analytics Dashboard</h3>
            <p className="text-sm text-muted-foreground">
              Comprehensive performance insights and trends
            </p>
          </div>

          <div className="cloud-bubble p-6 text-center">
            <BookOpen className="h-12 w-12 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">For Teachers</h3>
            <p className="text-sm text-muted-foreground">
              Upload tests and monitor class performance
            </p>
          </div>

          <div className="cloud-bubble p-6 text-center">
            <Award className="h-12 w-12 mx-auto mb-4 text-primary" />
            <h3 className="text-lg font-semibold mb-2">Adaptive Testing</h3>
            <p className="text-sm text-muted-foreground">
              Difficulty levels adjust to student ability
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Index;
