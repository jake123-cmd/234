const { ActivityType } = require('discord.js');
const { startErlcLogPoller } = require('../utils/erlcLogs');
const { getPlayers } = require('../utils/erlcApi');

async function updateActivity(client) {
    try {
        const players = await getPlayers();
        const count = Array.isArray(players) ? players.length : 0;
        client.user.setActivity(`${count} players in Arizona RP`, { type: ActivityType.Watching });
    } catch {
        client.user.setActivity('Arizona RP', { type: ActivityType.Watching });
    }
}

module.exports = {
    name: 'clientReady',
    once: true,
    execute(client) {
        console.log(`${client.user.tag} is online!`);
        updateActivity(client);
        setInterval(() => updateActivity(client), 60_000);
        startErlcLogPoller(client);
    }
};
