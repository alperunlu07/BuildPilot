import { homedir } from 'node:os';
import { join } from 'node:path';

// BUILDPILOT_HOME overrides the on-disk location for config, master key,
// hosts, and the SQLite DB. Lets a dev profile (e.g. BUILDPILOT_HOME=~/.buildpilot-dev)
// run alongside a release install without colliding on port or DB.
export const CONFIG_DIR = process.env.BUILDPILOT_HOME
  ? process.env.BUILDPILOT_HOME
  : join(homedir(), '.buildpilot');
