const { getKillLogs, getCommandLogs, getJoinLogs } = require('./erlcApi');
const { v2Msg, env } = require('./v2');

// Track last-seen timestamps per log type to avoid duplicates
const lastSeen = {
    kills: 0,
    commands: 0,
    joins: 0
};

async function pollKillLogs(client) {
    const channelId = process.env.ERLC_KILLLOG_CHANNEL_ID;
    if (!channelId) return;

    try {
        const data = await getKillLogs();
        if (!Array.isArray(data) || data.length === 0) return;

        const newEntries = data.filter(l => l.Timestamp > lastSeen.kills);
        if (newEntries.length === 0) return;

        lastSeen.kills = Math.max(...data.map(l => l.Timestamp));

        const channel = client.channels.cache.get(channelId);
        if (!channel) return;

        const lines = newEntries.slice(-15).map(l =>
            `\`${l.Killer || 'Unknown'}\` killed \`${l.Killed || 'Unknown'}\` — <t:${l.Timestamp}:T>`
        );

        await channel.send(v2Msg({
            title: env('ERLC_KILLLOG_AUTO_TITLE', 'Kill Log'),
            description: lines.join('\n')
        }));
    } catch (_) {}
}

async function pollCommandLogs(client) {
    const channelId = process.env.ERLC_CMDLOG_CHANNEL_ID;
    if (!channelId) return;

    try {
        const data = await getCommandLogs();
        if (!Array.isArray(data) || data.length === 0) return;

        const newEntries = data.filter(l => l.Timestamp > lastSeen.commands);
        if (newEntries.length === 0) return;

        lastSeen.commands = Math.max(...data.map(l => l.Timestamp));

        const channel = client.channels.cache.get(channelId);
        if (!channel) return;

        const lines = newEntries.slice(-15).map(l =>
            `\`${l.Player || 'Unknown'}\`: \`${l.Command || 'N/A'}\` — <t:${l.Timestamp}:T>`
        );

        await channel.send(v2Msg({
            title: env('ERLC_CMDLOG_AUTO_TITLE', 'Command Log'),
            description: lines.join('\n')
        }));
    } catch (_) {}
}

async function pollJoinLogs(client) {
    const channelId = process.env.ERLC_JOINLOG_CHANNEL_ID;
    if (!channelId) return;

    try {
        const data = await getJoinLogs();
        if (!Array.isArray(data) || data.length === 0) return;

        const newEntries = data.filter(l => l.Timestamp > lastSeen.joins);
        if (newEntries.length === 0) return;

        lastSeen.joins = Math.max(...data.map(l => l.Timestamp));

        const channel = client.channels.cache.get(channelId);
        if (!channel) return;

        const lines = newEntries.slice(-15).map(l => {
            const action = l.Join ? '📥 Joined' : '📤 Left';
            return `${action} \`${l.Player || 'Unknown'}\` — <t:${l.Timestamp}:T>`;
        });

        await channel.send(v2Msg({
            title: env('ERLC_JOINLOG_AUTO_TITLE', 'Join / Leave Log'),
            description: lines.join('\n')
        }));
    } catch (_) {}
}

function startErlcLogPoller(client) {
    const interval = (parseInt(process.env.ERLC_LOG_POLL_INTERVAL) || 30) * 1000;

    // Seed timestamps on first run so we don't spam old logs
    let seeded = false;
    async function seed() {
        try {
            const [kills, cmds, joins] = await Promise.all([
                getKillLogs().catch(() => []),
                getCommandLogs().catch(() => []),
                getJoinLogs().catch(() => [])
            ]);
            if (Array.isArray(kills) && kills.length) lastSeen.kills = Math.max(...kills.map(l => l.Timestamp));
            if (Array.isArray(cmds) && cmds.length) lastSeen.commands = Math.max(...cmds.map(l => l.Timestamp));
            if (Array.isArray(joins) && joins.length) lastSeen.joins = Math.max(...joins.map(l => l.Timestamp));
        } catch (_) {}
        seeded = true;
    }

    seed().then(() => {
        console.log('ERLC log poller started');
        setInterval(() => {
            if (!seeded) return;
            pollKillLogs(client);
            pollCommandLogs(client);
            pollJoinLogs(client);
        }, interval);
    });
}

module.exports = { startErlcLogPoller };
