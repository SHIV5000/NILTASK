// Import the library as a default export
import supabaseJs from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Destructure the createClient function from the imported object
const { createClient } = supabaseJs;

// Supabase configuration
export const SUPABASE_URL = 'https://apfymygzwkzjhhgmtkaj.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwZnlteWd6d2t6amhoZ210a2FqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MjM5MTIsImV4cCI6MjA5NjQ5OTkxMn0.RiV6kDDeSq5ZIP68RGwtpLtqPALFloq23owoNm2aA-c';

// Create and export the Supabase client instance
export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
