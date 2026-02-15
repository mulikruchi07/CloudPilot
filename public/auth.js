import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

// Initialize Supabase with your actual credentials
// IMPORTANT: Replace these with your actual Supabase project URL and anon key
const SUPABASE_URL = 'https://your-project-id.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';

// Create and export the Supabase client
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Export auth helper functions
export const auth = {
    // Sign in with email and password
    signIn: async (email, password) => {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password
            });

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Sign in error:', error);
            return { success: false, error: error.message };
        }
    },

    // Sign up with email and password
    signUp: async (email, password) => {
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password
            });

            if (error) throw error;
            return { success: true, data };
        } catch (error) {
            console.error('Sign up error:', error);
            return { success: false, error: error.message };
        }
    },

    // Sign out
    signOut: async () => {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            return { success: true };
        } catch (error) {
            console.error('Sign out error:', error);
            return { success: false, error: error.message };
        }
    },

    // Get current session
    getSession: async () => {
        try {
            const { data, error } = await supabase.auth.getSession();
            if (error) throw error;
            return { success: true, session: data.session };
        } catch (error) {
            console.error('Get session error:', error);
            return { success: false, error: error.message };
        }
    },

    // Get current user
    getUser: async () => {
        try {
            const { data, error } = await supabase.auth.getUser();
            if (error) throw error;
            return { success: true, user: data.user };
        } catch (error) {
            console.error('Get user error:', error);
            return { success: false, error: error.message };
        }
    },

    // Listen to auth state changes
    onAuthStateChange: (callback) => {
        return supabase.auth.onAuthStateChange(callback);
    }
};

// Export default
export default auth;