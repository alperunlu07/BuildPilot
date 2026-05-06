import { randomUUID } from 'node:crypto';
import type { NodeTemplate, StepType } from '@buildpilot/shared-types';
import { getDb } from './db';

interface Row {
  id: string;
  name: string;
  description: string | null;
  base_step_type: string;
  data_json: string;
  created_at: number;
  updated_at: number;
}

function rowToTemplate(row: Row): NodeTemplate {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    baseStepType: row.base_step_type as StepType,
    data: JSON.parse(row.data_json) as Record<string, unknown>,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface NodeTemplateInput {
  name: string;
  description?: string | null;
  baseStepType: StepType;
  data: Record<string, unknown>;
}

export function listNodeTemplates(): NodeTemplate[] {
  const rows = getDb()
    .prepare('SELECT * FROM node_templates ORDER BY name ASC')
    .all() as Row[];
  return rows.map(rowToTemplate);
}

export function getNodeTemplate(id: string): NodeTemplate | null {
  const row = getDb().prepare('SELECT * FROM node_templates WHERE id = ?').get(id) as
    | Row
    | undefined;
  return row ? rowToTemplate(row) : null;
}

export function createNodeTemplate(input: NodeTemplateInput): NodeTemplate {
  const id = randomUUID();
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO node_templates (id, name, description, base_step_type, data_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      input.name,
      input.description ?? null,
      input.baseStepType,
      JSON.stringify(input.data),
      now,
      now,
    );
  return {
    id,
    name: input.name,
    description: input.description ?? null,
    baseStepType: input.baseStepType,
    data: input.data,
    createdAt: now,
    updatedAt: now,
  };
}

export function updateNodeTemplate(
  id: string,
  patch: Partial<NodeTemplateInput>,
): NodeTemplate | null {
  const existing = getNodeTemplate(id);
  if (!existing) return null;
  const merged: NodeTemplate = {
    ...existing,
    name: patch.name ?? existing.name,
    description: patch.description ?? existing.description,
    baseStepType: patch.baseStepType ?? existing.baseStepType,
    data: patch.data ?? existing.data,
    updatedAt: Date.now(),
  };
  getDb()
    .prepare(
      `UPDATE node_templates SET name = ?, description = ?, base_step_type = ?, data_json = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      merged.name,
      merged.description,
      merged.baseStepType,
      JSON.stringify(merged.data),
      merged.updatedAt,
      id,
    );
  return merged;
}

export function deleteNodeTemplate(id: string): void {
  getDb().prepare('DELETE FROM node_templates WHERE id = ?').run(id);
}
