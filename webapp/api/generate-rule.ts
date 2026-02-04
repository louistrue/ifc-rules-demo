/**
 * Vercel serverless function for AI rule generation
 */

import OpenAI from 'openai';
import type { VercelRequest, VercelResponse } from '@vercel/node';

interface IfcContext {
  entityTypes: Array<{ type: string; count: number }>;
  storeys: Array<{ name: string; elevation: number; elementCount: number }>;
  propertySets: Array<{ name: string; elementCount: number }>;
  materials: Array<{ name: string; elementCount: number }>;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check for API key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OpenAI API key not configured' });
  }

  try {
    const { prompt, context } = req.body as { prompt: string; context: IfcContext };

    if (!prompt) {
      return res.status(400).json({ error: 'Missing prompt' });
    }

    // Initialize OpenAI client
    const openai = new OpenAI({ apiKey });

    // Build system prompt with rule schema and context
    const systemPrompt = buildSystemPrompt(context || {});

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });

    const responseContent = completion.choices[0]?.message?.content;
    if (!responseContent) {
      throw new Error('No response from OpenAI');
    }

    const rule = JSON.parse(responseContent);

    // Ensure rule has a valid ID
    if (!rule.id || rule.id.startsWith('generated-rule-')) {
      rule.id = `ai-generated-${Date.now()}`;
    }

    // Validate rule structure
    if (!rule.conditions || !Array.isArray(rule.conditions)) {
      throw new Error('Invalid rule: missing conditions array');
    }

    return res.status(200).json({ rule });
  } catch (error: any) {
    console.error('Error generating rule:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate rule'
    });
  }
}

function buildSystemPrompt(context: Partial<IfcContext>): string {
  const { entityTypes = [], storeys = [], propertySets = [], materials = [] } = context;

  return `You are an IFC (Industry Foundation Classes) rule generator. Convert natural language queries into structured selection rules for filtering IFC building elements.

## Available Data in This Model

Entity Types:
${entityTypes.map((et) => `- ${et.type} (${et.count} elements)`).join('\n') || '(none loaded)'}

Storeys:
${storeys.map((s) => `- ${s.name} (elevation: ${s.elevation}m, ${s.elementCount} elements)`).join('\n') || '(none loaded)'}

Property Sets:
${propertySets.slice(0, 20).map((ps) => `- ${ps.name} (${ps.elementCount} elements)`).join('\n') || '(none loaded)'}
${propertySets.length > 20 ? `... and ${propertySets.length - 20} more` : ''}

Materials:
${materials.slice(0, 10).map((m) => `- ${m.name} (${m.elementCount} elements)`).join('\n') || '(none loaded)'}
${materials.length > 10 ? `... and ${materials.length - 10} more` : ''}

## Rule Structure

Return a JSON object with this structure:
{
  "id": "generated-rule-[timestamp]",
  "name": "Descriptive name for the rule",
  "conditions": [
    // Array of condition objects (see below)
  ],
  "mode": "all"  // "all" = AND (all conditions must match), "any" = OR (any condition matches)
}

## Condition Types

### 1. EntityType Condition (filter by element type)
{
  "type": "entityType",
  "entityType": "IfcWall" | ["IfcWall", "IfcDoor"],  // Single type or array
  "includeSubtypes": true  // Include subtypes like IfcWallStandardCase
}

### 2. Attribute Condition (filter by name, description, tag, etc.)
{
  "type": "attribute",
  "attribute": "name" | "description" | "tag" | "objectType" | "predefinedType",
  "operator": "contains" | "equals" | "startsWith" | "endsWith" | "notContains",
  "value": "search string"
}

Use "contains" operator for partial matches (e.g., name contains "Holz").

### 3. Spatial Condition (filter by storey, building, etc.)
{
  "type": "spatial",
  "level": "storey" | "building" | "site" | "space",
  "name": "exact name" | "*partial*"  // Use wildcards for partial matches
}

For partial storey name matches, use wildcards: "*EG*" matches any storey with "EG" in the name.

### 4. Property Condition (filter by property set properties)
{
  "type": "property",
  "propertySet": "Pset_WallCommon",
  "propertyName": "IsExternal",
  "operator": "equals" | "notEquals" | "contains" | "greaterThan" | "lessThan" | "exists",
  "value": true | false | "string" | 123  // Type depends on property
}

### 5. Material Condition
{
  "type": "material",
  "name": "exact name" | "*partial*"  // Use wildcards for partial matches
}

### 6. Classification Condition
{
  "type": "classification",
  "system": "Uniclass" | "*",  // "*" for any system
  "code": "code",
  "name": "name"
}

## Instructions

1. Parse the user's natural language query
2. Identify entity types mentioned (walls, doors, windows, etc.)
3. Identify filters (name contains X, on storey Y, etc.)
4. Build appropriate conditions
5. Use "contains" operator for partial string matches
6. Use wildcards (*) in spatial/material names for partial matches
7. Return ONLY valid JSON, no markdown or explanations
8. Use descriptive rule names
9. Default mode is "all" (AND logic)

## Examples

Query: "all walls with 'Holz' in name on storey with 'EG' in name"
Response:
{
  "id": "generated-rule-1706889600",
  "name": "Holz walls on EG storey",
  "conditions": [
    {
      "type": "entityType",
      "entityType": "IfcWall",
      "includeSubtypes": true
    },
    {
      "type": "attribute",
      "attribute": "name",
      "operator": "contains",
      "value": "Holz"
    },
    {
      "type": "spatial",
      "level": "storey",
      "name": "*EG*"
    }
  ],
  "mode": "all"
}

Query: "external doors"
Response:
{
  "id": "generated-rule-1706889601",
  "name": "External doors",
  "conditions": [
    {
      "type": "entityType",
      "entityType": "IfcDoor",
      "includeSubtypes": true
    },
    {
      "type": "property",
      "propertySet": "Pset_DoorCommon",
      "propertyName": "IsExternal",
      "operator": "equals",
      "value": true
    }
  ],
  "mode": "all"
}

Now convert the user's query into a rule.`;
}
