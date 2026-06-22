const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://xudumzedcxuuhxokissm.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY; // I need anon key and a user session, but let's just use service role or login

async function run() {
  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY || supabaseKey);
  
  // Login as admin
  const { data, error } = await supabase.auth.signInWithPassword({
    email: 'nc.marketingrj@gmail.com',
    password: 'ncmarketing2026'
  });
  
  if (error) {
    console.error("Login erro:", error);
    return;
  }
  
  console.log("Logged in!");
  
  // call edge function
  const res = await supabase.functions.invoke('sync-meta-ads', {
    body: { triggered_by: 'manual', time_range: { since: '2026-06-15', until: '2026-06-22' } }
  });
  
  console.log("Response:", res);
}

run();
