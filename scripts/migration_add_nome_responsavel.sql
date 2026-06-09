-- Migration: adiciona nome_responsavel na tabela alunos
-- Execute no Supabase SQL Editor

ALTER TABLE alunos
  ADD COLUMN IF NOT EXISTS nome_responsavel text;
