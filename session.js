const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, TextDisplayBuilder } = require('discord.js');
const { buildContainer, v2Msg, env, tpl, logo, banner } = require('../../utils/v2');
const { getServerInfo, getPlayers } = require('../../utils/erlcApi');

const SSU_UPDATE_INTERVAL = 60_000;

async function buildSSUPayload() {
    let serverName = 'Unknown', playerCount = '0', maxPlayers = '0';
    try {
        const [info, players] = await Promise.all([getServerInfo(), getPlayers()]);
        serverName = info.Name || 'Unknown';
        maxPlayers = `${info.MaxPlayers || 0}`;
        playerCount = `${Array.isArray(players) ? players.length : 0}`;
    } catch (_) {}
    const ownerId = process.env.OWNER_ID;
    const ownerMention = ownerId ? `<@${ownerId}>` : 'N/A';
    const container = buildContainer({
        title: env('SSU_TITLE', 'Server Startup'),
        description: tpl(env('SSU_DESCRIPTION', 'The server is now starting up!\n\n**Server:** {server}\n**Players:** {players}/{max}\n**Owner:** {owner}\n**Status:** Starting'), { server: serverName, players: playerCount, max: maxPlayers, owner: ownerMention }),
        thumbnail: logo(),
        banner: banner('SSU_BANNER')
    });

    const components = [container];
    const joinLink = process.env.QUICK_JOIN_LINK;
    if (joinLink) {
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Join Server').setStyle(ButtonStyle.Link).setURL(joinLink)
        ));
    }
    return { components };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('session')
        .setDescription('Session management commands')
        .addSubcommand(sub => sub.setName('ssu').setDescription('Start a server session'))
        .addSubcommand(sub => sub.setName('ssd').setDescription('Shut down a server session'))
        .addSubcommand(sub => sub.setName('boost').setDescription('Request a server boost'))
        .addSubcommand(sub => sub.setName('full').setDescription('Announce server is full'))
        .addSubcommand(sub => sub.setName('vote').setDescription('Start an SSU vote')),

    async execute(interaction, client) {
        const staffRole = process.env.STAFF_ROLE_ID;
        if (staffRole && !interaction.member.roles.cache.has(staffRole)) {
            return interaction.reply({ content: env('NO_PERMISSION_MSG', 'You do not have permission to use this command.'), flags: MessageFlags.Ephemeral });
        }

        const sub = interaction.options.getSubcommand();
        const sessionChannel = interaction.guild.channels.cache.get(process.env.SESSION_CHANNEL_ID);
        const sessionRole = process.env.SESSION_ROLE_ID;

        if (sub === 'ssu') {
            const { components } = await buildSSUPayload();
            if (sessionRole) components[0].addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@&${sessionRole}>`));

            const target = sessionChannel || interaction.channel;
            const ssuMessage = await target.send({ components, flags: MessageFlags.IsComponentsV2 });

            // Clear any existing live counter
            if (client.ssuLiveCounter) clearInterval(client.ssuLiveCounter);

            // Start live player count updates
            client.ssuLiveCounter = setInterval(async () => {
                try {
                    const { components: updated } = await buildSSUPayload();
                    await ssuMessage.edit({ components: updated, flags: MessageFlags.IsComponentsV2 });
                } catch (_) {}
            }, SSU_UPDATE_INTERVAL);

            return interaction.reply({ content: 'Session startup announced!', flags: MessageFlags.Ephemeral });
        }

        if (sub === 'ssd') {
            // Stop live player counter
            if (client.ssuLiveCounter) {
                clearInterval(client.ssuLiveCounter);
                client.ssuLiveCounter = null;
            }

            const payload = v2Msg({
                title: env('SSD_TITLE', 'Server Shutdown'),
                description: tpl(env('SSD_DESCRIPTION', 'The server is now shutting down.\n\n**Host:** {host}\n**Status:** Offline'), { host: `${interaction.user}` }),
                thumbnail: logo(),
                banner: banner('SSD_BANNER')
            });
            if (sessionRole) payload.components[0].addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@&${sessionRole}>`));

            const target = sessionChannel || interaction.channel;
            await target.send(payload);
            return interaction.reply({ content: 'Session shutdown announced!', flags: MessageFlags.Ephemeral });
        }

        if (sub === 'boost') {
            let serverName = 'Unknown', playerCount = '0', maxPlayers = '0';
            try {
                const [info, players] = await Promise.all([getServerInfo(), getPlayers()]);
                serverName = info.Name || 'Unknown';
                maxPlayers = `${info.MaxPlayers || 0}`;
                playerCount = `${Array.isArray(players) ? players.length : 0}`;
            } catch (_) {}

            const payload = v2Msg({
                title: env('SESSION_BOOST_TITLE', 'Server Boost Needed'),
                description: tpl(env('SESSION_BOOST_DESCRIPTION', 'The server needs more players!\n\n**Server:** {server}\n**Players:** {players}/{max}\n**Requested by:** {host}'), { server: serverName, players: playerCount, max: maxPlayers, host: `${interaction.user}` }),
                thumbnail: logo(),
                banner: banner('SSU_BANNER')
            });
            if (sessionRole) payload.components[0].addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@&${sessionRole}>`));
            const joinLink = process.env.QUICK_JOIN_LINK;
            if (joinLink) {
                payload.components.push(new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setLabel('Join Server').setStyle(ButtonStyle.Link).setURL(joinLink)
                ));
            }

            const target = sessionChannel || interaction.channel;
            await target.send(payload);
            return interaction.reply({ content: 'Server boost announced!', flags: MessageFlags.Ephemeral });
        }

        if (sub === 'full') {
            let serverName = 'Unknown', playerCount = '0', maxPlayers = '0';
            try {
                const [info, players] = await Promise.all([getServerInfo(), getPlayers()]);
                serverName = info.Name || 'Unknown';
                maxPlayers = `${info.MaxPlayers || 0}`;
                playerCount = `${Array.isArray(players) ? players.length : 0}`;
            } catch (_) {}

            const payload = v2Msg({
                title: env('SESSION_FULL_TITLE', 'Server Full'),
                description: tpl(env('SESSION_FULL_DESCRIPTION', 'The server is now full!\n\n**Server:** {server}\n**Players:** {players}/{max}\n**Host:** {host}'), { server: serverName, players: playerCount, max: maxPlayers, host: `${interaction.user}` }),
                thumbnail: logo(),
                banner: banner('SSU_BANNER')
            });
            if (sessionRole) payload.components[0].addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@&${sessionRole}>`));

            const target = sessionChannel || interaction.channel;
            await target.send(payload);
            return interaction.reply({ content: 'Server full announced!', flags: MessageFlags.Ephemeral });
        }

        if (sub === 'vote') {
            const voteId = Date.now().toString();
            const threshold = parseInt(process.env.SSU_VOTE_THRESHOLD || '5');
            const duration = parseInt(process.env.SSU_VOTE_DURATION || '5') * 60 * 1000;

            client.ssuVotes.set(voteId, { count: 0, voters: new Set() });

            const container = buildContainer({
                title: env('SSU_VOTE_TITLE', 'SSU Vote'),
                description: tpl(env('SSU_VOTE_DESCRIPTION', 'Vote to start up the server!\n\n**Votes:** {votes}/{threshold}\n\nClick the button below to vote!'), { votes: '0', threshold: `${threshold}` }),
                thumbnail: logo(),
                banner: banner('SSU_VOTE_BANNER')
            });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`ssuvote_${voteId}`).setLabel(env('SSU_VOTE_BUTTON_LABEL', 'Vote')).setStyle(ButtonStyle.Success)
            );

            const target = sessionChannel || interaction.channel;
            if (sessionRole) container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@&${sessionRole}>`));
            await target.send({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

            setTimeout(() => client.ssuVotes.delete(voteId), duration);

            return interaction.reply({ content: 'SSU Vote started!', flags: MessageFlags.Ephemeral });
        }
    }
};
