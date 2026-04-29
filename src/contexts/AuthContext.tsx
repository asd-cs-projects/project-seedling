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

  // Fetch user role and profile
  const fetchUserData = async (userId: string) => {
    try {
      // Fetch role
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (roleData) {
        setRole(roleData.role as AppRole);
      }

      // Fetch profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (profileData) {
        setProfile(profileData);
      } else if (profileError?.code === 'PGRST116') {
        // Profile doesn't exist - create one for legacy users
        const { data: userData } = await supabase.auth.getUser();
        if (userData.user) {
          const { data: newProfile } = await supabase
            .from('profiles')
            .insert({
              user_id: userId,
              full_name: userData.user.user_metadata?.full_name || userData.user.email || 'User'
            })
            .select()
            .single();
          
          if (newProfile) {
            setProfile(newProfile);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
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
          full_name: userData.fullName
        }
      }
    });

    if (!error && data.user) {
      // Wait a moment for the trigger to create the profile
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Try to update the profile (created by trigger), or insert if it doesn't exist
      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({
          user_id: data.user.id,
          full_name: userData.fullName,
          student_id: userData.studentId,
          grade: userData.grade,
          class: userData.class,
          gender: userData.gender,
          age: userData.age ? parseInt(userData.age) : null,
          subject: userData.subject
        }, { onConflict: 'user_id' });

      if (profileError) {
        console.error('Profile upsert error:', profileError);
      }

      // Add to user_roles table
      const { error: roleError } = await supabase
        .from('user_roles')
        .insert({
          user_id: data.user.id,
          role: userData.role
        });

      if (roleError) {
        console.error('Role insert error:', roleError);
      }

      // Set the role immediately for navigation
      setRole(userData.role as AppRole);
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (!error && data.user) {
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
