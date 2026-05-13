import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { GraduationCap, UserCircle, ShieldCheck, ArrowLeft, Eye, EyeOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import sckoolLogo from "@/assets/sckool-logo.jpeg";
const PasswordInputField = ({
  id,
  value,
  onChange,
  placeholder,
  showPassword,
  onToggleShow
}: {
  id: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: string;
  showPassword: boolean;
  onToggleShow: () => void;
}) => <div className="relative">
    <Input id={id} type={showPassword ? "text" : "password"} placeholder={placeholder} value={value} onChange={onChange} className="input-glassy pr-12" />
    <button type="button" onClick={onToggleShow} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
    </button>
  </div>;
const LoginPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    toast
  } = useToast();
  const {
    signUp,
    signIn
  } = useAuth();
  const role = searchParams.get("role") || "student";
  const [isSignUp, setIsSignUp] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showAdminId, setShowAdminId] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [studentForm, setStudentForm] = useState({
    email: "",
    password: "",
    fullName: "",
    grade: "",
    class: "",
    gender: "",
    age: "",
    studentId: ""
  });
  const [teacherForm, setTeacherForm] = useState({
    adminId: "",
    email: "",
    password: "",
    fullName: "",
    subject: ""
  });

  // Validation helpers
  const validatePassword = (pass: string) => pass.length >= 6;
  const validateName = (name: string) => name.trim().length >= 2 && name.trim().length <= 50;
  const validateEmail = (email: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const handleStudentAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isSignUp) {
        if (!studentForm.email || !studentForm.password || !studentForm.fullName || !studentForm.grade || !studentForm.class || !studentForm.gender || !studentForm.age || !studentForm.studentId) {
          toast({
            title: "Missing Information",
            description: "Please fill in all fields",
            variant: "destructive"
          });
          return;
        }
        if (!/^\d{7}$/.test(studentForm.studentId)) {
          toast({
            title: "Invalid Student ID",
            description: "Student ID must be exactly 7 digits",
            variant: "destructive"
          });
          return;
        }
        if (!validateEmail(studentForm.email)) {
          toast({
            title: "Invalid Email",
            description: "Please enter a valid email address",
            variant: "destructive"
          });
          return;
        }
        if (!validatePassword(studentForm.password)) {
          toast({
            title: "Weak Password",
            description: "Password must be at least 6 characters",
            variant: "destructive"
          });
          return;
        }
        if (!validateName(studentForm.fullName)) {
          toast({
            title: "Invalid Name",
            description: "Name must be 2-50 characters",
            variant: "destructive"
          });
          return;
        }
        const {
          error
        } = await signUp(studentForm.email, studentForm.password, {
          fullName: studentForm.fullName.trim(),
          grade: studentForm.grade.trim(),
          class: studentForm.class.trim(),
          gender: studentForm.gender,
          age: studentForm.age,
          studentId: `ASD-${studentForm.studentId}`,
          role: 'student'
        });
        if (error) {
          if (error.message?.includes('already registered')) {
            toast({
              title: "Account Exists",
              description: "This email is already registered. Please login.",
              variant: "destructive"
            });
            setIsSignUp(false);
          } else {
            toast({
              title: "Error",
              description: error.message,
              variant: "destructive"
            });
          }
          return;
        }
        toast({
          title: "Success!",
          description: "Account created! Redirecting..."
        });
        navigate("/student/dashboard");
      } else {
        if (!studentForm.email || !studentForm.password) {
          toast({
            title: "Missing Information",
            description: "Please enter email and password",
            variant: "destructive"
          });
          return;
        }
        const {
          error
        } = await signIn(studentForm.email, studentForm.password);
        if (error) {
          toast({
            title: "Error",
            description: "Invalid email or password",
            variant: "destructive"
          });
          return;
        }
        toast({
          title: "Welcome!",
          description: "Logged in successfully"
        });
        navigate("/student/dashboard");
      }
    } finally {
      setIsLoading(false);
    }
  };
  const handleTeacherAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      if (isSignUp) {
        if (!teacherForm.adminId || !teacherForm.email || !teacherForm.password || !teacherForm.fullName || !teacherForm.subject) {
          toast({
            title: "Missing Information",
            description: "Please fill in all fields",
            variant: "destructive"
          });
          return;
        }

        // Verify admin ID server-side
        const {
          data: verifyData,
          error: verifyError
        } = await supabase.functions.invoke('verify-admin-id', {
          body: {
            adminId: teacherForm.adminId
          }
        });
        if (verifyError || !verifyData?.valid) {
          toast({
            title: "Invalid Admin ID",
            description: "Please contact administrator for valid Admin ID",
            variant: "destructive"
          });
          return;
        }
        if (!validateEmail(teacherForm.email)) {
          toast({
            title: "Invalid Email",
            description: "Please enter a valid email address",
            variant: "destructive"
          });
          return;
        }
        if (!validatePassword(teacherForm.password)) {
          toast({
            title: "Weak Password",
            description: "Password must be at least 6 characters",
            variant: "destructive"
          });
          return;
        }
        if (!validateName(teacherForm.fullName)) {
          toast({
            title: "Invalid Name",
            description: "Name must be 2-50 characters",
            variant: "destructive"
          });
          return;
        }
        const {
          error
        } = await signUp(teacherForm.email, teacherForm.password, {
          fullName: teacherForm.fullName.trim(),
          subject: teacherForm.subject,
          role: 'teacher'
        });
        if (error) {
          if (error.message?.includes('already registered')) {
            toast({
              title: "Account Exists",
              description: "This email is already registered. Please login.",
              variant: "destructive"
            });
            setIsSignUp(false);
          } else {
            toast({
              title: "Error",
              description: error.message,
              variant: "destructive"
            });
          }
          return;
        }
        toast({
          title: "Success!",
          description: "Account created! Redirecting..."
        });
        navigate("/teacher/dashboard");
      } else {
        if (!teacherForm.email || !teacherForm.password) {
          toast({
            title: "Missing Information",
            description: "Please enter Email and password",
            variant: "destructive"
          });
          return;
        }
        const {
          error
        } = await signIn(teacherForm.email, teacherForm.password);
        if (error) {
          toast({
            title: "Error",
            description: "Invalid Email or password",
            variant: "destructive"
          });
          return;
        }
        toast({
          title: "Welcome!",
          description: "Logged in successfully"
        });
        navigate("/teacher/dashboard");
      }
    } finally {
      setIsLoading(false);
    }
  };
  return <div className="min-h-screen bg-gradient-to-br from-background via-accent/20 to-primary/10 flex items-center justify-center p-4">
      <Card className="w-full max-w-xl cloud-bubble p-8 animate-enter">
        {/* Back Button */}
        <button onClick={() => navigate("/")} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6">
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back To Home Page </span>
        </button>

        {/* Header with Role Icon */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className={`w-20 h-20 rounded-full flex items-center justify-center ${role === "student" ? "bg-primary/10" : "bg-secondary/10"}`}>
              {role === "student" ? <GraduationCap className="h-10 w-10 text-primary" /> : <UserCircle className="h-10 w-10 text-secondary" />}
            </div>
          </div>
          <h1 className="text-3xl font-bold text-foreground mb-2">
            {role === "student" ? "Student Portal" : "Teacher Portal"}
          </h1>
          <p className="text-muted-foreground">
            {isSignUp ? "Create your account" : "Sign in to continue"}
          </p>
        </div>

        {/* Sign Up / Login Toggle */}
        <div className="mb-6 flex gap-2 justify-center">
          <Button variant={isSignUp ? "default" : "outline"} onClick={() => setIsSignUp(true)} className="flex-1 rounded-xl" disabled={isLoading}>
            Sign Up
          </Button>
          <Button variant={!isSignUp ? "default" : "outline"} onClick={() => setIsSignUp(false)} className="flex-1 rounded-xl" disabled={isLoading}>
            Login
          </Button>
        </div>

        {/* STUDENT FORM */}
        {role === "student" && <form onSubmit={handleStudentAuth} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="student-email">Email</Label>
              <Input id="student-email" type="email" value={studentForm.email} onChange={e => setStudentForm(prev => ({
            ...prev,
            email: e.target.value
          }))} className="input-glassy" disabled={isLoading} placeholder="Enter school email" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="student-password">Password</Label>
              <PasswordInputField id="student-password" value={studentForm.password} onChange={e => setStudentForm(prev => ({
            ...prev,
            password: e.target.value
          }))} placeholder="Enter password (min 6 characters)" showPassword={showPassword} onToggleShow={() => setShowPassword(!showPassword)} />
            </div>

            {isSignUp && <>
                <div className="space-y-2">
                  <Label htmlFor="fullName">Full Name</Label>
                  <Input id="fullName" placeholder="Enter full name" value={studentForm.fullName} onChange={e => setStudentForm(prev => ({
              ...prev,
              fullName: e.target.value
            }))} className="input-glassy" maxLength={50} disabled={isLoading} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="grade">Grade</Label>
                    <Input id="grade" placeholder="e.g., 10" value={studentForm.grade} onChange={e => setStudentForm(prev => ({
                ...prev,
                grade: e.target.value
              }))} className="input-glassy" disabled={isLoading} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="class">Class</Label>
                    <Input id="class" placeholder="e.g., A" value={studentForm.class} onChange={e => setStudentForm(prev => ({
                ...prev,
                class: e.target.value
              }))} className="input-glassy" disabled={isLoading} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Gender</Label>
                    <Select value={studentForm.gender} onValueChange={value => setStudentForm(prev => ({
                ...prev,
                gender: value
              }))} disabled={isLoading}>
                      <SelectTrigger className="input-glassy">
                        <SelectValue placeholder="Select" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Male">Male</SelectItem>
                        <SelectItem value="Female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="age">Age</Label>
                    <Input id="age" type="number" placeholder="Age" value={studentForm.age} onChange={e => setStudentForm(prev => ({
                ...prev,
                age: e.target.value
              }))} className="input-glassy" min={5} max={25} disabled={isLoading} />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="studentId">Student ID</Label>
                  <div className="flex gap-2">
                    <div className="flex items-center px-3 bg-muted rounded-l-xl border border-r-0 border-input">
                      <span className="text-sm font-medium text-muted-foreground">ASD-</span>
                    </div>
                    <Input 
                      id="studentId" 
                      type="text" 
                      placeholder="1234567" 
                      value={studentForm.studentId} 
                      onChange={e => {
                        const value = e.target.value.replace(/\D/g, '').slice(0, 7);
                        setStudentForm(prev => ({
                          ...prev,
                          studentId: value
                        }));
                      }} 
                      className="input-glassy rounded-l-none" 
                      maxLength={7} 
                      disabled={isLoading} 
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">Enter 7 digits (e.g., 1234567)</p>
                </div>
              </>}

            <Button type="submit" className="w-full nav-btn-next mt-6" disabled={isLoading}>
              {isLoading ? <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isSignUp ? "Creating Account..." : "Logging in..."}
                </> : isSignUp ? "Create Account" : "Login"}
            </Button>
          </form>}

        {/* TEACHER FORM */}
        {role === "teacher" && <form onSubmit={handleTeacherAuth} className="space-y-4">
            {isSignUp && <div className="space-y-2">
                <Label htmlFor="admin-id" className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  Admin ID
                </Label>
                <div className="relative">
                  <Input id="admin-id" type={showAdminId ? "text" : "password"} value={teacherForm.adminId} onChange={e => setTeacherForm(prev => ({
              ...prev,
              adminId: e.target.value
            }))} className="input-glassy pr-12" disabled={isLoading} placeholder="Enter Admin ID " />
                  <button type="button" onClick={() => setShowAdminId(!showAdminId)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                    {showAdminId ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Contact Administrator for Admin ID</p>
              </div>}

            <div className="space-y-2">
              <Label htmlFor="email-id">Email</Label>
              <Input id="email-id" type="email" value={teacherForm.email} onChange={e => setTeacherForm(prev => ({
            ...prev,
            email: e.target.value
          }))} className="input-glassy" maxLength={100} disabled={isLoading} placeholder="Enter school email" />
            </div>

            <div className="space-y-2">
              <Label htmlFor="teacher-password">Password</Label>
              <PasswordInputField id="teacher-password" value={teacherForm.password} onChange={e => setTeacherForm(prev => ({
            ...prev,
            password: e.target.value
          }))} placeholder="Enter password (min 6 characters)" showPassword={showPassword} onToggleShow={() => setShowPassword(!showPassword)} />
            </div>

            {isSignUp && <>
                <div className="space-y-2">
                  <Label htmlFor="teacher-fullName">Full Name</Label>
                  <Input id="teacher-fullName" placeholder="Enter full name" value={teacherForm.fullName} onChange={e => setTeacherForm(prev => ({
              ...prev,
              fullName: e.target.value
            }))} className="input-glassy" maxLength={50} disabled={isLoading} />
                </div>

                <div className="space-y-2">
                  <Label>Subject</Label>
                  <Select value={teacherForm.subject} onValueChange={value => setTeacherForm(prev => ({
              ...prev,
              subject: value
            }))} disabled={isLoading}>
                    <SelectTrigger className="input-glassy">
                      <SelectValue placeholder="Select subject" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="English">English</SelectItem>
                      <SelectItem value="Science">Science</SelectItem>
                      <SelectItem value="Mathematics">Mathematics</SelectItem>
                      <SelectItem value="Social Studies">Social Studies</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </>}

            <Button type="submit" className="w-full nav-btn-next mt-6" disabled={isLoading}>
              {isLoading ? <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  {isSignUp ? "Creating Account..." : "Logging in..."}
                </> : isSignUp ? "Create Account" : "Login"}
            </Button>
          </form>}
      </Card>
    </div>;
};
export default LoginPage;