const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

function loadSlashCommands(client) {
    const commandsPath = path.join(__dirname, '..', 'commands', 'slash');
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        client.slashCommands.set(command.data.name, command);
    }
}

async function registerSlashCommands(client) {
    const commands = [];
    client.slashCommands.forEach(cmd => commands.push(cmd.data.toJSON()));

    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

    try {
        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );
    } catch (e) {
        console.error(e);
    }
}

module.exports = { loadSlashCommands, registerSlashCommands };
