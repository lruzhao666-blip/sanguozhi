import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const supaUrl = window.SUPABASE_CONFIG?.SUPABASE_URL || '';
const supaKey = window.SUPABASE_CONFIG?.SUPABASE_ANON_KEY || '';

export const supabase = supaUrl && supaKey ? createClient(supaUrl, supaKey) : null;

window.supabase = supabase;
