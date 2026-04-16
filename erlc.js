const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const { v2Reply, env, logo } = require('../../utils/v2');
const erlc = require('../../utils/erlcApi');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('erlc')
        .setDescription('ERLC server commands')
        .addSubcommand(sub => sub.setName('server').setDescription('Get server information'))
        .addSubcommand(sub => sub.setName('players').setDescription('Get online players'))
        .addSubcommand(sub => sub.setName('joinlogs').setDescription('Get join logs'))
        .addSubcommand(sub => sub.setName('killlogs').setDescription('Get kill logs'))
        .addSubcommand(sub => sub.setName('commandlogs').setDescription('Get command logs'))
        .addSubcommand(sub => sub.setName('bans').setDescription('Get server bans'))
        .addSubcommand(sub => sub.setName('vehicles').setDescription('Get server vehicles'))
        .addSubcommand(sub => sub.setName('queue').setDescription('Get server queue'))
        .addSubcommand(sub => sub
            .setName('command')
            .setDescription('Execute an in-game command')
            .addStringOption(opt => opt.setName('cmd').setDescription('Command to execute').setRequired(true))
        ),

    async execute(interaction) {
        const staffRole = process.env.STAFF_ROLE_ID;
        if (staffRole && !interaction.member.roles.cache.has(staffRole)) {
            return interaction.reply({ content: env('NO_PERMISSION_MSG', 'You do not have permission to use this command.'), flags: MessageFlags.Ephemeral });
        }

        await interaction.deferReply();
        const sub = interaction.options.getSubcommand();

        try {
            if (sub === 'server') {
                const data = await erlc.getServerInfo();
                let ownerName = data.OwnerId?.toString() || 'N/A';
                try { ownerName = await erlc.getRobloxUsername(data.OwnerId); } catch (_) {}
                return interaction.editReply(v2Reply({
                    title: env('ERLC_SERVER_TITLE', 'Server Information'),
                    fields: [
                        { name: 'Name', value: data.Name || 'N/A' },
                        { name: 'Players', value: `${data.CurrentPlayers || 0}/${data.MaxPlayers || 0}` },
                        { name: 'Join Code', value: data.JoinKey || 'N/A' },
                        { name: 'Owner', value: ownerName }
                    ],
                    thumbnail: logo()
                }));
            }

            if (sub === 'players') {
                const data = await erlc.getPlayers();
                const playerList = Array.isArray(data)
                    ? data.map(p => `${p.Player || p}`)
                    : Object.entries(data).map(([id, info]) => `${info.Player || id} -- ${info.Team || 'Unknown'}`);
                return interaction.editReply(v2Reply({
                    title: env('ERLC_PLAYERS_TITLE', 'Current Players'),
                    description: playerList.length > 0 ? playerList.slice(0, 30).join('\n') : 'No players online'
                }));
            }

            if (sub === 'joinlogs') {
                const data = await erlc.getJoinLogs();
                const joinLabel = env('ERLC_JOIN_LABEL', 'Joined');
                const leaveLabel = env('ERLC_LEAVE_LABEL', 'Left');
                const logs = Array.isArray(data)
                    ? data.slice(0, 15).map(l => `${l.Join ? joinLabel : leaveLabel} ${l.Player || 'Unknown'} -- <t:${l.Timestamp}:T>`)
                    : ['No logs available'];
                return interaction.editReply(v2Reply({
                    title: env('ERLC_JOINLOGS_TITLE', 'Join Logs'),
                    description: logs.join('\n') || 'No logs'
                }));
            }

            if (sub === 'killlogs') {
                const data = await erlc.getKillLogs();
                const logs = Array.isArray(data)
                    ? data.slice(0, 15).map(l => `${l.Killer || 'Unknown'} killed ${l.Killed || 'Unknown'} -- <t:${l.Timestamp}:T>`)
                    : ['No logs available'];
                return interaction.editReply(v2Reply({
                    title: env('ERLC_KILLLOGS_TITLE', 'Kill Logs'),
                    description: logs.join('\n') || 'No logs'
                }));
            }

            if (sub === 'commandlogs') {
                const data = await erlc.getCommandLogs();
                const logs = Array.isArray(data)
                    ? data.slice(0, 15).map(l => `${l.Player || 'Unknown'}: ${l.Command || 'N/A'} -- <t:${l.Timestamp}:T>`)
                    : ['No logs available'];
                return interaction.editReply(v2Reply({
                    title: env('ERLC_CMDLOGS_TITLE', 'Command Logs'),
                    description: logs.join('\n') || 'No logs'
                }));
            }

            if (sub === 'bans') {
                const data = await erlc.getBans();
                const banList = typeof data === 'object'
                    ? Object.entries(data).slice(0, 20).map(([id, reason]) => `**${id}** -- ${reason}`)
                    : ['No bans'];
                return interaction.editReply(v2Reply({
                    title: env('ERLC_BANS_TITLE', 'Server Bans'),
                    description: banList.join('\n') || 'No bans'
                }));
            }

            if (sub === 'vehicles') {
                const data = await erlc.getVehicles();
                const vehicles = Array.isArray(data)
                    ? data.slice(0, 20).map(v => `${v.Name || 'Unknown'} -- Owner: ${v.Owner || 'N/A'}`)
                    : ['No vehicles'];
                return interaction.editReply(v2Reply({
                    title: env('ERLC_VEHICLES_TITLE', 'Server Vehicles'),
                    description: vehicles.join('\n') || 'No vehicles'
                }));
            }

            if (sub === 'queue') {
                const data = await erlc.getQueue();
                const queue = Array.isArray(data)
                    ? data.slice(0, 20).map((p, i) => `**${i + 1}.** ${p}`)
                    : ['No queue'];
                return interaction.editReply(v2Reply({
                    title: env('ERLC_QUEUE_TITLE', 'Server Queue'),
                    description: queue.join('\n') || 'No one in queue'
                }));
            }

            if (sub === 'command') {
                const managementRole = process.env.MANAGEMENT_ROLE_ID;
                if (managementRole && !interaction.member.roles.cache.has(managementRole)) {
                    return interaction.editReply({ content: env('NO_PERMISSION_MSG', 'You do not have permission to execute in-game commands.') });
                }
                const cmd = interaction.options.getString('cmd');
                await erlc.sendCommand(cmd);
                return interaction.editReply({ content: `Command executed: \`${cmd}\`` });
            }
        } catch (error) {
            return interaction.editReply({ content: `ERLC API Error: ${error.message}` });
        }
    }
};
