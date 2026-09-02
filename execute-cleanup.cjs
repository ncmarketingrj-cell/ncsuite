const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = "https://uqhilsnrrmlepdjzpubq.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxaGlsc25ycm1sZXBkanpwdWJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MzkxOTIsImV4cCI6MjA5ODExNTE5Mn0.BQOqIlmadGj07UUE2u_EWqD3rr4iv_XGF5QuiR5j_Bc";

const supabase = createClient(supabaseUrl, supabaseKey);

async function runCleanup() {
  console.log("Signing in as admin...");
  const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'nc.marketingrj@gmail.com',
    password: 'ncmarketing2026'
  });

  if (authErr) {
    console.error('Login error:', authErr.message);
    return;
  }
  console.log("Authenticated successfully.");

  const now = new Date();

  // Cutoff dates
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgoDateStr = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  console.log(`\n--- STARTING DIRECT SUPABASE PURGE ---`);
  console.log(`Cutoff 14 days ago (ISO): ${fourteenDaysAgo}`);
  console.log(`Cutoff 7 days ago (ISO): ${sevenDaysAgo}`);
  console.log(`Cutoff 30 days ago (YYYY-MM-DD): ${thirtyDaysAgoDateStr}`);

  // Direct PostgREST delete queries
  
  // 1. billing_snapshots
  console.log("\n1. Purging billing_snapshots (fetched_at < 14 days)...");
  const { count: billingDel, error: err1 } = await supabase
    .from('billing_snapshots')
    .delete({ count: 'exact' })
    .lt('fetched_at', fourteenDaysAgo);
  if (err1) console.error("Error purging billing_snapshots:", err1.message);
  else console.log(`✅ billing_snapshots purged: ${billingDel} rows deleted.`);

  // 2. notifications
  console.log("\n2. Purging notifications (created_at < 14 days)...");
  const { count: notifDel, error: err2 } = await supabase
    .from('notifications')
    .delete({ count: 'exact' })
    .lt('created_at', fourteenDaysAgo);
  if (err2) console.error("Error purging notifications:", err2.message);
  else console.log(`✅ notifications purged: ${notifDel} rows deleted.`);

  // 3. sync_history
  console.log("\n3. Purging sync_history (started_at < 7 days)...");
  const { count: syncDel, error: err3 } = await supabase
    .from('sync_history')
    .delete({ count: 'exact' })
    .lt('started_at', sevenDaysAgo);
  if (err3) console.error("Error purging sync_history:", err3.message);
  else console.log(`✅ sync_history purged: ${syncDel} rows deleted.`);

  // 4. hourly_metrics
  console.log("\n4. Purging hourly_metrics (date < 30 days)...");
  const { count: hourlyDel, error: err4 } = await supabase
    .from('hourly_metrics')
    .delete({ count: 'exact' })
    .lt('date', thirtyDaysAgoDateStr);
  if (err4) console.error("Error purging hourly_metrics:", err4.message);
  else console.log(`✅ hourly_metrics purged: ${hourlyDel} rows deleted.`);

  // 5. demographic_metrics
  console.log("\n5. Purging demographic_metrics (date < 30 days)...");
  const { count: demoDel, error: err5 } = await supabase
    .from('demographic_metrics')
    .delete({ count: 'exact' })
    .lt('date', thirtyDaysAgoDateStr);
  if (err5) console.error("Error purging demographic_metrics:", err5.message);
  else console.log(`✅ demographic_metrics purged: ${demoDel} rows deleted.`);

  // 6. asset_metrics
  console.log("\n6. Purging asset_metrics (date < 30 days)...");
  const { count: assetDel, error: err6 } = await supabase
    .from('asset_metrics')
    .delete({ count: 'exact' })
    .lt('date', thirtyDaysAgoDateStr);
  if (err6) console.error("Error purging asset_metrics:", err6.message);
  else console.log(`✅ asset_metrics purged: ${assetDel} rows deleted.`);

  // 7. region_metrics
  console.log("\n7. Purging region_metrics (date < 30 days)...");
  const { count: regionDel, error: err7 } = await supabase
    .from('region_metrics')
    .delete({ count: 'exact' })
    .lt('date', thirtyDaysAgoDateStr);
  if (err7) console.error("Error purging region_metrics:", err7.message);
  else console.log(`✅ region_metrics purged: ${regionDel} rows deleted.`);

  const totalDel = (billingDel || 0) + (notifDel || 0) + (syncDel || 0) + (hourlyDel || 0) + (demoDel || 0) + (assetDel || 0) + (regionDel || 0);

  console.log("\n==========================================");
  console.log("🎉 DIRECT PURGE COMPLETED!");
  console.log(`Total rows deleted: ${totalDel}`);
  console.log("==========================================");
}

runCleanup();
