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
    return;
  }
  
  console.log('Logged in as:', user.email, user.id);

  const token = 'EAANmoU71vRUBRZCa2rZB2OUP3iO5BsGY3GORQMQZBbZAx4r5GG2ikTKPnSjpvzg0tp0FpJo3G5D6dYZAvDa86nXJ3aenetEWSwgcvIZCNOdaK9dgZAFlYNeDFG6rrsitE9oswVEAG2UIIdSo7w9fguwxebPkwqUCcCypj5BIji1ORGAXxNQubYPIL3EScvxHwZDZD';

  const { error } = await supabase.from('meta_ads_configs').upsert({
    user_id: user.id,
    access_token: token,
    ad_account_id: 'ALL_ACCOUNTS',
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id' });

  if (error) {
    console.error('Upsert error:', error);
  } else {
    console.log('Token successfully inserted/updated!');
  }
}

main();
