import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://xudumzedcxuuhxokissm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1ZHVtemVkY3h1dWh4b2tpc3NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDcyNjcsImV4cCI6MjA5NDY4MzI2N30.9XXDZEDwuS5_6zsDWT5e6QxCEDvQpEyY88R7BNJ4SmM';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: { user }, error: loginErr } = await supabase.auth.signInWithPassword({
    email: 'nc.marketingrj@gmail.com',
    password: 'ncmarketing2026',
  });
  
  if (loginErr || !user) {
    console.error('Login error:', loginErr);
    // Continue anyway without auth user, the edge function will fallback to the last config
  } else {
    console.log('Logged in as:', user.email);
  }

  const token = 'EAANmoU71vRUBRZCa2rZB2OUP3iO5BsGY3GORQMQZBbZAx4r5GG2ikTKPnSjpvzg0tp0FpJo3G5D6dYZAvDa86nXJ3aenetEWSwgcvIZCNOdaK9dgZAFlYNeDFG6rrsitE9oswVEAG2UIIdSo7w9fguwxebPkwqUCcCypj5BIji1ORGAXxNQubYPIL3EScvxHwZDZD';

  console.log('Invoking sync-meta-ads with quick mode...');
  
  const startTime = Date.now();
  const res = await fetch(`${supabaseUrl}/functions/v1/sync-meta-ads`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(user ? { 'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}` } : {})
    },
    body: JSON.stringify({ triggered_by: "manual", date_preset: "maximum" })
  });

  const duration = Date.now() - startTime;
  console.log(`Status: ${res.status} ${res.statusText} (${duration}ms)`);
  
  const text = await res.text();
  console.log('Body:', text.substring(0, 500));
}

main();
