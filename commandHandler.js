const fs = require('fs');
const path = require('path');

function loadCommands(client) {
    const commandsPath = path.join(__dirname, '..', 'commands', 'prefix');
    const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

    for (const file of commandFiles) {
        const command = require(path.join(commandsPath, file));
        client.prefixCommands.set(command.name, command);
        if (command.aliases) {
            for (const alias of command.aliases) {
                client.prefixCommands.set(alias, command);
            }
        }
    }
}

module.exports = { loadCommands };
