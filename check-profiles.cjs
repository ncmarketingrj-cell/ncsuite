const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = 'https://uqhilsnrrmlepdjzpubq.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxaGlsc25ycm1sZXBkanpwdWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MzkxOTIsImV4cCI6MjA5ODExNTE5Mn0.BQOqIlmadGj07UUE2u_EWqD3rr4iv_XGF5QuiR5j_Bc';

async function run() {
  const supabase = createClient(supabaseUrl, supabaseKey);
  
  const { data: testAppt } = await supabase.from('crm_appointments').select('*').limit(1);
  console.log("Colunas crm_appointments:", testAppt ? Object.keys(testAppt[0] || {}) : "Vazia");
  
  const { data: testLead } = await supabase.from('crm_leads').select('*').limit(1);
  console.log("Colunas crm_leads:", testLead ? Object.keys(testLead[0] || {}) : "Vazia");
}
run();
