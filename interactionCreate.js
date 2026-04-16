const { ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, MessageFlags, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { Ticket, Giveaway, getNextId } = require('../utils/database');
const { createTranscript } = require('../utils/transcript');
const { buildContainer, v2Msg, env, tpl, color, footer, logo, banner } = require('../utils/v2');
const { getServerInfo, getPlayers } = require('../utils/erlcApi');

module.exports = {
    name: 'interactionCreate',
    once: false,
    async execute(interaction, client) {
        if (interaction.isChatInputCommand()) {
            const command = client.slashCommands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction, client);
            } catch (error) {
                try {
                    const content = env('ERROR_MSG', 'An error occurred while executing that command.');
                    if (interaction.replied || interaction.deferred) {
                        await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
                    } else {
                        await interaction.reply({ content, flags: MessageFlags.Ephemeral });
                    }
                } catch (_) {}
            }
            return;
        }

        if (interaction.isButton()) {
            if (interaction.customId.startsWith('create_ticket_')) {
                const ticketType = interaction.customId.replace('create_ticket_', '');
                const existing = await Ticket.findOne({ guild_id: interaction.guild.id, user_id: interaction.user.id, status: 'open' });
                if (existing) {
                    return interaction.reply({ content: 'You already have an open ticket.', flags: MessageFlags.Ephemeral });
                }

                const typeRoleMap = {
                    general: process.env.TICKET_ROLE_GENERAL,
                    management: process.env.TICKET_ROLE_MANAGEMENT,
                    ownership: process.env.TICKET_ROLE_OWNERSHIP
                };
                const accessRoleId = typeRoleMap[ticketType] || process.env.TICKET_SUPPORT_ROLE_ID;

                const category = interaction.guild.channels.cache.get(process.env.TICKET_CATEGORY_ID);
                const overwrites = [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ];
                if (accessRoleId) overwrites.push({ id: accessRoleId, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });

                const channel = await interaction.guild.channels.create({
                    name: `${ticketType}-${interaction.user.username}`,
                    type: ChannelType.GuildText,
                    parent: category ? category.id : null,
                    permissionOverwrites: overwrites
                });

                const ticketId = await getNextId('ticket');
                await Ticket.create({ id: ticketId, guild_id: interaction.guild.id, channel_id: channel.id, user_id: interaction.user.id, ticket_type: ticketType, created_at: Date.now() });

                const typeLabel = ticketType.charAt(0).toUpperCase() + ticketType.slice(1);
                const container = buildContainer({
                    title: env('TICKET_OPENED_TITLE', 'Ticket Opened'),
                    description: tpl(env('TICKET_OPENED_DESCRIPTION', 'Welcome {user}! A staff member will be with you shortly.\nClick the button below to close this ticket.'), { user: `${interaction.user}` }),
                    fields: [{ name: 'Type', value: typeLabel }],
                    thumbnail: logo(),
                    banner: banner('TICKET_BANNER')
                });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('claim_ticket').setLabel(env('TICKET_CLAIM_BUTTON_LABEL', 'Claim Ticket')).setStyle(ButtonStyle.Success),
                    new ButtonBuilder().setCustomId('close_ticket').setLabel(env('TICKET_CLOSE_BUTTON_LABEL', 'Close Ticket')).setStyle(ButtonStyle.Danger)
                );

                await channel.send({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
                await interaction.reply({ content: `Your ticket has been created: ${channel}`, flags: MessageFlags.Ephemeral });
                return;
            }

            if (interaction.customId === 'claim_ticket') {
                const ticket = await Ticket.findOne({ channel_id: interaction.channel.id, status: 'open' });
                if (!ticket) return interaction.reply({ content: 'This is not a valid ticket.', flags: MessageFlags.Ephemeral });

                if (ticket.claimed_by) {
                    return interaction.reply({ content: `This ticket is already claimed by <@${ticket.claimed_by}>.`, flags: MessageFlags.Ephemeral });
                }

                await Ticket.updateOne({ channel_id: interaction.channel.id }, { claimed_by: interaction.user.id });

                const typeLabel = (ticket.ticket_type || 'general').charAt(0).toUpperCase() + (ticket.ticket_type || 'general').slice(1);
                const container = buildContainer({
                    title: env('TICKET_OPENED_TITLE', 'Ticket Opened'),
                    description: tpl(env('TICKET_OPENED_DESCRIPTION', 'Welcome {user}! A staff member will be with you shortly.\nClick the button below to close this ticket.'), { user: `<@${ticket.user_id}>` }),
                    fields: [
                        { name: 'Type', value: typeLabel },
                        { name: 'Claimed By', value: `${interaction.user}` }
                    ],
                    thumbnail: logo(),
                    banner: banner('TICKET_BANNER')
                });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claimed').setStyle(ButtonStyle.Success).setDisabled(true),
                    new ButtonBuilder().setCustomId('close_ticket').setLabel(env('TICKET_CLOSE_BUTTON_LABEL', 'Close Ticket')).setStyle(ButtonStyle.Danger)
                );

                await interaction.update({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
                return;
            }

            if (interaction.customId === 'close_ticket') {
                const modal = new ModalBuilder()
                    .setCustomId('close_ticket_modal')
                    .setTitle('Close Ticket');

                const reasonInput = new TextInputBuilder()
                    .setCustomId('close_reason')
                    .setLabel('Reason for closing')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(false)
                    .setPlaceholder('Enter a reason for closing this ticket...');

                modal.addComponents(new ActionRowBuilder().addComponents(reasonInput));
                await interaction.showModal(modal);
                return;
            }

            if (interaction.customId.startsWith('giveaway_')) {
                const messageId = interaction.customId.split('_')[1];
                const giveaway = client.giveaways.get(messageId);
                if (!giveaway) return interaction.reply({ content: 'This giveaway no longer exists.', flags: MessageFlags.Ephemeral });

                if (giveaway.entries.has(interaction.user.id)) {
                    giveaway.entries.delete(interaction.user.id);
                    await Giveaway.updateOne({ message_id: messageId }, { $pull: { entries: interaction.user.id } });
                    await interaction.reply({ content: 'You have left the giveaway.', flags: MessageFlags.Ephemeral });
                } else {
                    giveaway.entries.add(interaction.user.id);
                    await Giveaway.updateOne({ message_id: messageId }, { $addToSet: { entries: interaction.user.id } });
                    await interaction.reply({ content: 'You have entered the giveaway!', flags: MessageFlags.Ephemeral });
                }

                const btnLabel = tpl(env('GIVEAWAY_ENTER_BUTTON_LABEL', 'Enter ({count})'), { count: `${giveaway.entries.size}` });
                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`giveaway_${messageId}`).setLabel(btnLabel).setStyle(ButtonStyle.Success)
                );

                const container = buildContainer({
                    title: env('GIVEAWAY_TITLE', 'Giveaway'),
                    description: tpl(env('GIVEAWAY_DESCRIPTION', '**{prize}**\n\nClick the button to enter!\n**Winners:** {winners}\n**Ends:** {ends}\n**Hosted by:** {host}'), {
                        prize: giveaway.prize,
                        winners: `${giveaway.winners}`,
                        ends: `<t:${Math.floor(giveaway.endTime / 1000)}:R>`,
                        host: `<@${giveaway.hostId}>`
                    }),
                    thumbnail: logo()
                });

                await interaction.message.edit({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
                return;
            }

            if (interaction.customId.startsWith('ssuvote_')) {
                const voteId = interaction.customId.split('_')[1];
                const vote = client.ssuVotes.get(voteId);
                if (!vote) return interaction.reply({ content: 'This vote has expired.', flags: MessageFlags.Ephemeral });

                if (vote.voters.has(interaction.user.id)) {
                    return interaction.reply({ content: 'You have already voted.', flags: MessageFlags.Ephemeral });
                }

                vote.voters.add(interaction.user.id);
                vote.count++;

                const threshold = parseInt(process.env.SSU_VOTE_THRESHOLD || '5');

                if (vote.count >= threshold) {
                    const endContainer = buildContainer({
                        title: env('SSU_VOTE_PASSED_TITLE', 'SSU Vote -- Passed!'),
                        description: tpl(env('SSU_VOTE_PASSED_DESCRIPTION', 'The vote has passed! The server is starting up!\n\n**Votes:** {votes}/{threshold}'), {
                            votes: `${vote.count}`,
                            threshold: `${threshold}`
                        }),
                        thumbnail: logo(),
                        banner: banner('SSU_VOTE_BANNER')
                    });

                    await interaction.update({ components: [endContainer], flags: MessageFlags.IsComponentsV2 });

                    const sessionChannel = interaction.guild.channels.cache.get(process.env.SESSION_CHANNEL_ID);
                    const sessionRole = process.env.SESSION_ROLE_ID;

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

                    const { components: ssuComponents } = await buildSSUPayload();
                    if (sessionRole) ssuComponents[0].addTextDisplayComponents(new TextDisplayBuilder().setContent(`<@&${sessionRole}>`));

                    if (sessionChannel) {
                        const ssuMessage = await sessionChannel.send({ components: ssuComponents, flags: MessageFlags.IsComponentsV2 });

                        // Clear any existing live counter
                        if (client.ssuLiveCounter) clearInterval(client.ssuLiveCounter);

                        // Start live player count updates
                        client.ssuLiveCounter = setInterval(async () => {
                            try {
                                const { components: updated } = await buildSSUPayload();
                                await ssuMessage.edit({ components: updated, flags: MessageFlags.IsComponentsV2 });
                            } catch (_) {}
                        }, 60_000);
                    }

                    client.ssuVotes.delete(voteId);
                } else {
                    const container = buildContainer({
                        title: env('SSU_VOTE_TITLE', 'SSU Vote'),
                        description: tpl(env('SSU_VOTE_DESCRIPTION', 'Vote to start up the server!\n\n**Votes:** {votes}/{threshold}\n\nClick the button below to vote!'), {
                            votes: `${vote.count}`,
                            threshold: `${threshold}`
                        }),
                        thumbnail: logo(),
                        banner: banner('SSU_VOTE_BANNER')
                    });

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`ssuvote_${voteId}`).setLabel(env('SSU_VOTE_BUTTON_LABEL', 'Vote')).setStyle(ButtonStyle.Success)
                    );

                    await interaction.update({ components: [container, row], flags: MessageFlags.IsComponentsV2 });
                }
                return;
            }
        }

        if (interaction.isModalSubmit()) {
            if (interaction.customId === 'close_ticket_modal') {
                const reason = interaction.fields.getTextInputValue('close_reason') || 'No reason provided';
                const ticket = await Ticket.findOne({ channel_id: interaction.channel.id, status: 'open' });
                if (!ticket) return interaction.reply({ content: 'This is not a valid ticket.', flags: MessageFlags.Ephemeral });

                await interaction.reply({ content: 'Closing ticket and generating transcript...' });

                const transcript = await createTranscript(interaction.channel);
                const logChannel = interaction.guild.channels.cache.get(process.env.TICKET_LOG_CHANNEL_ID);

                if (logChannel) {
                    const typeLabel = (ticket.ticket_type || 'general').charAt(0).toUpperCase() + (ticket.ticket_type || 'general').slice(1);
                    const fields = [
                        { name: 'Opened By', value: `<@${ticket.user_id}>` },
                        { name: 'Closed By', value: `${interaction.user}` },
                        { name: 'Type', value: typeLabel },
                        { name: 'Reason', value: reason },
                        { name: 'Ticket', value: interaction.channel.name },
                        { name: 'Transcript', value: '📎 Attached below' }
                    ];
                    if (ticket.claimed_by) fields.splice(2, 0, { name: 'Claimed By', value: `<@${ticket.claimed_by}>` });
                    await logChannel.send(v2Msg({
                        title: env('TICKET_CLOSED_TITLE', 'Ticket Closed'),
                        fields
                    }));
                    await logChannel.send({ files: [transcript] });
                }

                await Ticket.updateOne({ channel_id: interaction.channel.id }, { status: 'closed', close_reason: reason });
                setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
                return;
            }

            if (interaction.customId === 'embed_modal') {
                const title = interaction.fields.getTextInputValue('embed_title');
                const description = interaction.fields.getTextInputValue('embed_description');
                const colorVal = interaction.fields.getTextInputValue('embed_color') || process.env.EMBED_COLOR || '2F3136';
                const footerVal = interaction.fields.getTextInputValue('embed_footer') || '';
                const thumbnail = interaction.fields.getTextInputValue('embed_thumbnail') || '';

                const container = new ContainerBuilder().setAccentColor(parseInt(colorVal.replace('#', ''), 16));
                container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
                if (thumbnail) {
                    container.addSectionComponents(
                        new SectionBuilder()
                            .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
                            .setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbnail))
                    );
                } else {
                    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`));
                }
                container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
                container.addTextDisplayComponents(new TextDisplayBuilder().setContent(description));
                if (footerVal) {
                    container.addSeparatorComponents(new SeparatorBuilder());
                    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footerVal}`));
                }

                await interaction.reply({ components: [container], flags: MessageFlags.IsComponentsV2 });
                return;
            }
        }
    }
};
