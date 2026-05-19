import { createContext, useContext, useEffect, useState } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { asdIdToSyntheticEmail, isValidAsdId } from '@/lib/asdId';

type AppRole = 'admin' | 'teacher' | 'student';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  role: AppRole | null;
  profile: any | null;
  signUp: (asdId: string, password: string, userData: any) => Promise<{ error: any }>;
  signIn: (asdId: string, password: string) => Promise<{ error: any; role?: AppRole | null }>;
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

  // Fetch user role and profile. The handle_new_user trigger creates both
  // rows server-side on signup; we just read them here.
  const fetchUserData = async (userId: string): Promise<AppRole | null> => {
    let resolvedRole: AppRole | null = null;
    try {
      const [{ data: roleData }, { data: profileData }] = await Promise.all([
        supabase.from('user_roles').select('role').eq('user_id', userId).maybeSingle(),
        supabase.from('profiles').select('*').eq('user_id', userId).maybeSingle(),
      ]);

      if (roleData?.role) {
        resolvedRole = roleData.role as AppRole;
      } else {
        // Trigger should have created the row. Fall back to signup metadata.
        const { data: userResp } = await supabase.auth.getUser();
        const meta = userResp?.user?.user_metadata || {};
        resolvedRole = (meta.role as AppRole) || 'student';
      }
      setRole(resolvedRole);
      if (profileData) setProfile(profileData);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setRole((prev) => prev ?? 'student');
      resolvedRole = resolvedRole ?? 'student';
    }
    return resolvedRole;
  };

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(() => { fetchUserData(session.user.id); }, 0);
      } else {
        setRole(null);
        setProfile(null);
      }
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) fetchUserData(session.user.id);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (asdId: string, password: string, userData: any) => {
    if (!isValidAsdId(asdId)) {
      return { error: { message: 'Invalid ASD ID. Format: ASD-XXXXXXX (7 digits).' } };
    }
    const syntheticEmail = asdIdToSyntheticEmail(asdId);

    const { data, error } = await supabase.auth.signUp({
      email: syntheticEmail,
      password,
      options: {
        // Auto-confirm is on server-side; no inbox involved. Keep redirect
        // benign so any stray confirmation link lands on the app.
        emailRedirectTo: `${window.location.origin}/`,
        data: {
          full_name: userData.fullName,
          student_id: asdId,
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
      setRole(userData.role as AppRole);
      if (data.session) await fetchUserData(data.user.id);
    }
    return { error };
  };

  const signIn = async (asdId: string, password: string) => {
    if (!isValidAsdId(asdId)) {
      return { error: { message: 'Invalid ASD ID. Format: ASD-XXXXXXX.' }, role: null };
    }
    const syntheticEmail = asdIdToSyntheticEmail(asdId);
    const { data, error } = await supabase.auth.signInWithPassword({
      email: syntheticEmail,
      password,
    });
    if (error || !data.user) return { error, role: null };

    const resolvedRole = await fetchUserData(data.user.id);
    return { error: null, role: resolvedRole };
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
