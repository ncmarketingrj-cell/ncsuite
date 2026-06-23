const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://xudumzedcxuuhxokissm.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1ZHVtemVkY3h1dWh4b2tpc3NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDcyNjcsImV4cCI6MjA5NDY4MzI2N30.9XXDZEDwuS5_6zsDWT5e6QxCEDvQpEyY88R7BNJ4SmM";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  const { data: clients } = await supabase.from('clients').select('id, name, meta_ad_account_id');
  console.log('--- CLIENTS ---');
  console.dir(clients, { depth: null });

  const { data: adAccounts } = await supabase.from('ad_accounts').select('id, name');
  console.log('\n--- AD ACCOUNTS ---');
  console.dir(adAccounts, { depth: null });
}

run().catch(console.error);
