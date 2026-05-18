import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';

type AppRole = 'admin' | 'teacher' | 'student';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: any | null;
  signUp: (email: string, password: string, userData: any) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Fetch user role and profile. Uses maybeSingle() so a missing row never
  // throws — instead we self-heal by creating defaults from the user metadata.
  const fetchUserData = async (userId: string) => {
    try {
      const { data: userResp } = await supabase.auth.getUser();
      const authUser = userResp?.user;
      const meta = authUser?.user_metadata || {};

      // ---- Role ----
      const { data: roleData, error: roleErr } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .maybeSingle();

      if (roleErr) console.error('user_roles fetch error:', roleErr);

      if (roleData?.role) {
        setRole(roleData.role as AppRole);
      } else {
        // No role row → derive from signup metadata (handle_new_user trigger
        // may be missing on a self-hosted DB). Default to student.
        const desired = (meta.role as AppRole) || 'student';
        // RLS only lets users self-insert the student role. Insert what we
        // can; teacher/admin rows must be created server-side (trigger).
        const toInsert: AppRole = desired === 'student' ? 'student' : 'student';
        const { error: insErr } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role: toInsert });
        if (insErr) console.error('user_roles self-heal insert failed:', insErr);
        setRole(desired); // optimistic — UI can route; teacher routes will still work if trigger added it
      }

      // ---- Profile ----
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileData) {
        setProfile(profileData);
      } else {
        if (profileError) console.error('profiles fetch error:', profileError);
        const { data: newProfile, error: createErr } = await supabase
          .from('profiles')
          .insert({
            user_id: userId,
            full_name: meta.full_name || authUser?.email || 'User',
            student_id: meta.student_id || null,
            grade: meta.grade || null,
            class: meta.class || null,
            gender: meta.gender || null,
            age: meta.age ? parseInt(meta.age) : null,
            subject: meta.subject || null,
          })
          .select()
          .maybeSingle();
        if (createErr) console.error('profile self-heal insert failed:', createErr);
        if (newProfile) setProfile(newProfile);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      // Never leave the app stuck — at least mark a default role so
      // ProtectedRoute can stop spinning.
      setRole((prev) => prev ?? 'student');
    }
  };

  useEffect(() => {
    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        // Defer Supabase calls to avoid deadlock
        setTimeout(() => {
          fetchUserData(session.user.id);
        }, 0);
      } else {
        setRole(null);
        setProfile(null);
      }
      
      setLoading(false);
    });

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        fetchUserData(session.user.id);
      }
      
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string, userData: any) => {
    const redirectUrl = `${window.location.origin}/`;

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: userData.fullName,
          student_id: userData.studentId ?? '',
          grade: userData.grade ?? '',
          class: userData.class ?? '',
          gender: userData.gender ?? '',
          age: userData.age ? String(userData.age) : '',
          subject: userData.subject ?? '',
          role: userData.role ?? 'student',
        },
      },
    });

    if (!error && data.user) {
      // Trigger handle_new_user creates profile + role server-side.
      // Set role immediately for navigation.
      setRole(userData.role as AppRole);

      // If session exists (auto-confirm enabled), refresh local state.
      if (data.session) {
        await fetchUserData(data.user.id);
      }
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (!error && data.user) {
      // Block resolution until role is loaded so caller can route correctly
      await fetchUserData(data.user.id);
    }

    return { error };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setRole(null);
    setProfile(null);
    navigate('/');
  };

  return (
    <AuthContext.Provider value={{ user, session, role, profile, signUp, signIn, signOut, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
