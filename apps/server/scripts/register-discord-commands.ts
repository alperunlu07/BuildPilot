// One-shot script: register BuildPilot's slash commands with Discord.
//
//   pnpm --filter @buildpilot/server discord:register-commands
//
// Discord requires application commands to be declared up front via the
// REST API; the interactions endpoint we serve in apps/server/src/discord-bot.ts
// only handles invocations, not registration. We keep registration as an
// explicit, manual step (rather than auto-running on server start) so an
// accidental rebuild doesn't double-register or shadow custom commands a
// user added through the developer portal.
//
// Required env vars:
//   DISCORD_APPLICATION_ID   — application id from the developer portal
//   DISCORD_BOT_TOKEN        — bot token (Bot xxx); registration uses the
//                              REST API which authenticates with the bot
//                              token rather than the application secret
//
// Optional:
//   DISCORD_GUILD_ID         — if set, registers as guild commands (instant
//                              propagation, ~5 min vs the global ~1h cache).
//                              Useful while developing.

interface CommandDef {
  name: string;
  description: string;
  options?: Array<{
    name: string;
    description: string;
    type: number; // 3 = STRING per Discord ApplicationCommandOptionType
    required?: boolean;
  }>;
}

const COMMANDS: CommandDef[] = [
  {
    name: 'help',
    description: 'Show BuildPilot help',
  },
  {
    name: 'list',
    description: 'List configured BuildPilot pipelines',
  },
  {
    name: 'build',
    description: 'Start a build for the named pipeline',
    options: [
      {
        name: 'name',
        description: 'Pipeline name (substring match)',
        type: 3,
        required: true,
      },
    ],
  },
];

async function main(): Promise<void> {
  const appId = process.env.DISCORD_APPLICATION_ID;
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!appId || !token) {
    console.error(
      'Missing env var: DISCORD_APPLICATION_ID and DISCORD_BOT_TOKEN are required.',
    );
    process.exit(1);
  }
  const url = guildId
    ? `https://discord.com/api/v10/applications/${appId}/guilds/${guildId}/commands`
    : `https://discord.com/api/v10/applications/${appId}/commands`;
  console.log(`Registering ${COMMANDS.length} commands at ${url}`);
  // PUT replaces the entire command set atomically; safer than POST per-command.
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bot ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(COMMANDS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error(`registration failed: ${res.status} ${res.statusText}\n${text}`);
    process.exit(1);
  }
  console.log('OK — Discord acknowledged the registration.');
}

void main().catch((err) => {
  console.error(err);
  process.exit(1);
});
