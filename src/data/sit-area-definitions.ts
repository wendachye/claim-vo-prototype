import type { DrawingPosition } from "../types/domain";
export interface SITAreaDefinition { code: string; itemIds: string[]; position: DrawingPosition | null; name?: string }
// Named scopes from the supplied S.I.T. schedule, PDF page 27.
// The general site plan identifies W3/W5, not the detailed stair/core/wing
// positions. Keep the original four illustrative pins; new scopes have no pin.
const definitions: SITAreaDefinition[] = [
  { code: 'W3-ST31', itemIds: ['WI-001'], position: { x: .5, y: .83 } },
  { code: 'W3-ST34', itemIds: ['WI-002'], position: { x: .65, y: .87 } },
  { code: 'W5-ST51', itemIds: ['WI-004'], position: { x: .58, y: .48 } },
  { code: 'W5-EAST', itemIds: ['WI-005'], position: { x: .78, y: .51 } },
  { code: 'W3-ST36', itemIds: ['WI-003'], position: null },
  { code: 'W5-NORTH', itemIds: ['WI-006'], position: null },
  { code: 'W5-ESCALATOR', itemIds: ['WI-007'], position: null },
  { code: 'W3-COLUMNS', itemIds: ['WI-008'], position: null },
  // D.1 is included decking for B.1; link its whole scope to both platform
  // areas without dividing its source quantity or adding a separate charge.
  { code: 'W3-AMPH-A', itemIds: ['WI-009', 'WI-012'], position: null },
  { code: 'W5-AMPH-AB', itemIds: ['WI-010', 'WI-012'], position: null },
  { code: 'W3-LIFT-CORES', itemIds: ['WI-011'], position: null },
  // Four ladder sets are specified, but their individual locations are not.
  { code: 'W3-TEMP-ACCESS', itemIds: ['WI-013'], position: null },
];

const exclusions = [
  { itemId: 'WI-014', reason: 'Project-wide design service; no site area specified.' },
  { itemId: 'WI-015', reason: 'Project-wide visits; no site area specified.' },
  { itemId: 'WI-016', reason: 'Bracket work face is not specified in the schedule or general plan.' },
  { itemId: 'WI-017', reason: 'Rate-only labour; actual work location must be recorded separately.' },
  { itemId: 'WI-018', reason: 'Rate-only labour; actual work location must be recorded separately.' },
];

export const getSITAreaDefinitions = () => structuredClone(definitions);
export const getSITAreaExclusions = () => structuredClone(exclusions);
