require('dotenv').config();
const { SlashCommandBuilder } = require('discord.js');

const ALLOWED_ROLE = process.env.SAY_ROLE_ID; // from .env

async function handleSay({ userId, member, channel, text, reply }) {
    if (!member.roles.cache.has(ALLOWED_ROLE)) {
        return reply("You don't have permission to use this command.", true);
    }

    await channel.send(`${text}\n\n-# Sent by <@${userId}>`);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot say something.')
        .addStringOption(option =>
            option.setName('text')
                .setDescription('What the bot should say')
                .setRequired(true)
        )
        .setDMPermission(false),

    async execute(interaction) {
        const text = interaction.options.getString('text');

        await handleSay({
            userId: interaction.user.id,
            member: interaction.member,
            channel: interaction.channel,
            text,
            reply: (msg, ephemeral) =>
                interaction.reply({ content: msg, ephemeral: ephemeral ?? true })
        });
    }
};

