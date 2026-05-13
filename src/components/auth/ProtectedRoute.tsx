import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRole: "student" | "teacher";
}

const ProtectedRoute = ({ children, allowedRole }: ProtectedRouteProps) => {
  const navigate = useNavigate();
  const { user, role, loading } = useAuth();
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    // Still loading auth — wait
    if (loading) return;

    // No user at all — go home
    if (!user) {
      navigate("/", { replace: true });
      return;
    }

    // User exists but role hasn't been fetched yet — wait, don't redirect
    if (!role) return;

    // Check if user has the required role (teachers can also be admins)
    if (allowedRole === "teacher" && (role === "teacher" || role === "admin")) {
      setIsAuthorized(true);
    } else if (allowedRole === "student" && role === "student") {
      setIsAuthorized(true);
    } else {
      // Wrong role — send to the right dashboard
      if (role === "teacher" || role === "admin") {
        navigate("/teacher/dashboard", { replace: true });
      } else if (role === "student") {
        navigate("/student/dashboard", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    }
  }, [user, role, loading, allowedRole, navigate]);

  if (loading || (user && !role)) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
