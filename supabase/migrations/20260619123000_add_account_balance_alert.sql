-- Migration: 20260619123000_add_account_balance_alert.sql
-- Description: Add fields to support account balance alerts on ad accounts.

ALTER TABLE alert_thresholds 
ADD COLUMN IF NOT EXISTS alert_account_balance_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS min_account_balance NUMERIC(15,2) DEFAULT 0;
