const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://xudumzedcxuuhxokissm.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1ZHVtemVkY3h1dWh4b2tpc3NtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxMDcyNjcsImV4cCI6MjA5NDY4MzI2N30.9XXDZEDwuS5_6zsDWT5e6QxCEDvQpEyY88R7BNJ4SmM';

async function run() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const res = await supabase.functions.invoke('sync-meta-ads', {
    body: { triggered_by: 'manual', time_range: { since: '2026-06-15', until: '2026-06-22' } }
  });
  console.log(res);
}
run();
