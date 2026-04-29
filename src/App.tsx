import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import NotFound from "./pages/NotFound";
import LandingPage from "./components/landing/LandingPage";
import LoginPage from "./components/auth/LoginPage";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import NewStudentDashboard from "./components/dashboard/NewStudentDashboard";
import NewTeacherDashboard from "./components/dashboard/NewTeacherDashboard";
import AssessmentInterface from "./components/assessment/AssessmentInterface";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/auth" element={<LoginPage />} />
            <Route 
              path="/student/dashboard" 
              element={
                <ProtectedRoute allowedRole="student">
                  <NewStudentDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/teacher/dashboard" 
              element={
                <ProtectedRoute allowedRole="teacher">
                  <NewTeacherDashboard />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/assessment" 
              element={
                <ProtectedRoute allowedRole="student">
                  <AssessmentInterface />
                </ProtectedRoute>
              } 
            />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
