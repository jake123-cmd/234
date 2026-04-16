const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { buildContainer, v2Msg, env, tpl, logo } = require('../../utils/v2');
const { Giveaway, getNextId } = require('../../utils/database');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Giveaway commands')
        .addSubcommand(sub => sub
            .setName('start')
            .setDescription('Start a giveaway')
            .addStringOption(opt => opt.setName('duration').setDescription('Duration (e.g. 1h, 30m, 1d)').setRequired(true))
            .addStringOption(opt => opt.setName('prize').setDescription('Prize').setRequired(true))
            .addIntegerOption(opt => opt.setName('winners').setDescription('Number of winners').setRequired(false))
        )
        .addSubcommand(sub => sub
            .setName('end')
            .setDescription('End a giveaway early')
            .addStringOption(opt => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true))
        )
        .addSubcommand(sub => sub
            .setName('reroll')
            .setDescription('Reroll a giveaway')
            .addStringOption(opt => opt.setName('message_id').setDescription('Giveaway message ID').setRequired(true))
        ),

    async execute(interaction, client) {
        const managementRole = process.env.MANAGEMENT_ROLE_ID;
        if (managementRole && !interaction.member.roles.cache.has(managementRole)) {
            return interaction.reply({ content: env('NO_PERMISSION_MSG', 'You do not have permission to use this command.'), flags: MessageFlags.Ephemeral });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'start') {
            const durationStr = interaction.options.getString('duration');
            const prize = interaction.options.getString('prize');
            const winners = interaction.options.getInteger('winners') || 1;

            const ms = parseDuration(durationStr);
            if (!ms) return interaction.reply({ content: 'Invalid duration. Use format: 1s, 1m, 1h, 1d', flags: MessageFlags.Ephemeral });

            const endTime = Date.now() + ms;
            const giveawayChannel = interaction.guild.channels.cache.get(process.env.GIVEAWAY_CHANNEL_ID) || interaction.channel;

            const container = buildContainer({
                title: env('GIVEAWAY_TITLE', 'Giveaway'),
                description: tpl(env('GIVEAWAY_DESCRIPTION', '**{prize}**\n\nClick the button to enter!\n**Winners:** {winners}\n**Ends:** {ends}\n**Hosted by:** {host}'), {
                    prize, winners: `${winners}`, ends: `<t:${Math.floor(endTime / 1000)}:R>`, host: `${interaction.user}`
                }),
                thumbnail: logo()
            });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('giveaway_temp').setLabel(tpl(env('GIVEAWAY_ENTER_BUTTON_LABEL', 'Enter ({count})'), { count: '0' })).setStyle(ButtonStyle.Success)
            );

            const msg = await giveawayChannel.send({ components: [container, row], flags: MessageFlags.IsComponentsV2 });

            const updatedRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`giveaway_${msg.id}`).setLabel(tpl(env('GIVEAWAY_ENTER_BUTTON_LABEL', 'Enter ({count})'), { count: '0' })).setStyle(ButtonStyle.Success)
            );
            await msg.edit({ components: [container, updatedRow], flags: MessageFlags.IsComponentsV2 });

            const giveawayId = await getNextId('giveaway');
            await Giveaway.create({
                id: giveawayId, guild_id: interaction.guild.id, channel_id: giveawayChannel.id, message_id: msg.id, host_id: interaction.user.id, prize, winner_count: winners, end_time: endTime
            });

            client.giveaways.set(msg.id, { prize, winners, endTime, entries: new Set(), channelId: giveawayChannel.id, hostId: interaction.user.id });

            setTimeout(async () => {
                const giveaway = client.giveaways.get(msg.id);
                if (!giveaway) return;

                const entriesArray = Array.from(giveaway.entries);
                const winnerList = [];
                for (let i = 0; i < Math.min(winners, entriesArray.length); i++) {
                    const idx = Math.floor(Math.random() * entriesArray.length);
                    winnerList.push(entriesArray.splice(idx, 1)[0]);
                }

                const winnerMentions = winnerList.length > 0 ? winnerList.map(id => `<@${id}>`).join(', ') : 'No valid entries';

                const endContainer = buildContainer({
                    title: env('GIVEAWAY_ENDED_TITLE', 'Giveaway Ended'),
                    description: tpl(env('GIVEAWAY_ENDED_DESCRIPTION', '**{prize}**\n\n**Winners:** {winners}\n**Hosted by:** {host}'), {
                        prize: giveaway.prize, winners: winnerMentions, host: `<@${giveaway.hostId}>`
                    })
                });

                const ch = interaction.guild.channels.cache.get(giveaway.channelId);
                if (ch) {
                    try {
                        const giveawayMsg = await ch.messages.fetch(msg.id);
                        await giveawayMsg.edit({ components: [endContainer], flags: MessageFlags.IsComponentsV2 });
                        await ch.send({ content: tpl(env('GIVEAWAY_WINNER_MSG', 'Congratulations {winners}! You won **{prize}**!'), { winners: winnerMentions, prize: giveaway.prize }) });
                    } catch (e) {}
                }

                await Giveaway.updateOne({ message_id: msg.id }, { ended: 1 });
                client.giveaways.delete(msg.id);
            }, ms);

            return interaction.reply({ content: 'Giveaway started!', flags: MessageFlags.Ephemeral });
        }

        if (sub === 'end') {
            const messageId = interaction.options.getString('message_id');
            const giveaway = client.giveaways.get(messageId);
            if (!giveaway) return interaction.reply({ content: 'Giveaway not found or already ended.', flags: MessageFlags.Ephemeral });

            const entriesArray = Array.from(giveaway.entries);
            const winnerList = [];
            for (let i = 0; i < Math.min(giveaway.winners, entriesArray.length); i++) {
                const idx = Math.floor(Math.random() * entriesArray.length);
                winnerList.push(entriesArray.splice(idx, 1)[0]);
            }

            const winnerMentions = winnerList.length > 0 ? winnerList.map(id => `<@${id}>`).join(', ') : 'No valid entries';

            const endContainer = buildContainer({
                title: env('GIVEAWAY_ENDED_TITLE', 'Giveaway Ended'),
                description: tpl(env('GIVEAWAY_ENDED_DESCRIPTION', '**{prize}**\n\n**Winners:** {winners}\n**Hosted by:** {host}'), {
                    prize: giveaway.prize, winners: winnerMentions, host: `<@${giveaway.hostId}>`
                })
            });

            const channel = interaction.guild.channels.cache.get(giveaway.channelId);
            if (channel) {
                try {
                    const giveawayMsg = await channel.messages.fetch(messageId);
                    await giveawayMsg.edit({ components: [endContainer], flags: MessageFlags.IsComponentsV2 });
                    await channel.send({ content: tpl(env('GIVEAWAY_WINNER_MSG', 'Congratulations {winners}! You won **{prize}**!'), { winners: winnerMentions, prize: giveaway.prize }) });
                } catch (e) {}
            }

            await Giveaway.updateOne({ message_id: messageId }, { ended: 1 });
            client.giveaways.delete(messageId);
            return interaction.reply({ content: 'Giveaway ended!', flags: MessageFlags.Ephemeral });
        }

        if (sub === 'reroll') {
            const messageId = interaction.options.getString('message_id');
            const giveawayData = await Giveaway.findOne({ message_id: messageId, guild_id: interaction.guild.id });
            if (!giveawayData) return interaction.reply({ content: 'Giveaway not found.', flags: MessageFlags.Ephemeral });

            const entriesArray = [...(giveawayData.entries || [])];
            const winnerList = [];
            for (let i = 0; i < Math.min(giveawayData.winner_count, entriesArray.length); i++) {
                const idx = Math.floor(Math.random() * entriesArray.length);
                winnerList.push(entriesArray.splice(idx, 1)[0]);
            }

            const winnerMentions = winnerList.length > 0 ? winnerList.map(id => `<@${id}>`).join(', ') : 'No valid entries';

            const endContainer = buildContainer({
                title: env('GIVEAWAY_ENDED_TITLE', 'Giveaway Ended'),
                description: tpl(env('GIVEAWAY_ENDED_DESCRIPTION', '**{prize}**\n\n**Winners:** {winners}\n**Hosted by:** {host}'), {
                    prize: giveawayData.prize, winners: winnerMentions, host: `<@${giveawayData.host_id}>`
                })
            });

            const channel = interaction.guild.channels.cache.get(giveawayData.channel_id);
            if (channel) {
                try {
                    const giveawayMsg = await channel.messages.fetch(messageId);
                    await giveawayMsg.edit({ components: [endContainer], flags: MessageFlags.IsComponentsV2 });
                } catch (_) {}
                await channel.send({ content: tpl(env('GIVEAWAY_WINNER_MSG', 'Congratulations {winners}! You won **{prize}**!'), { winners: winnerMentions, prize: giveawayData.prize }) });
            }

            return interaction.reply({ content: 'Giveaway rerolled!', flags: MessageFlags.Ephemeral });
        }
    }
};

function parseDuration(str) {
    const match = str.match(/^(\d+)(s|m|h|d)$/);
    if (!match) return null;
    const num = parseInt(match[1]);
    const unit = match[2];
    const multipliers = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
    return num * (multipliers[unit] || 0);
}
