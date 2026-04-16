const fetch = require('node-fetch');

const BASE_URL = process.env.ERLC_API_URL || 'https://api.policeroleplay.community/v1';
const SERVER_KEY = process.env.ERLC_SERVER_KEY;

async function erlcRequest(endpoint) {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
        headers: { 'Server-Key': SERVER_KEY }
    });
    if (!res.ok) throw new Error(`ERLC API Error: ${res.status}`);
    return res.json();
}

async function getServerInfo() {
    return erlcRequest('/server');
}

async function getPlayers() {
    return erlcRequest('/server/players');
}

async function getJoinLogs() {
    return erlcRequest('/server/joinlogs');
}

async function getKillLogs() {
    return erlcRequest('/server/killlogs');
}

async function getCommandLogs() {
    return erlcRequest('/server/commandlogs');
}

async function getBans() {
    return erlcRequest('/server/bans');
}

async function getVehicles() {
    return erlcRequest('/server/vehicles');
}

async function getQueue() {
    return erlcRequest('/server/queue');
}

async function sendCommand(command) {
    const res = await fetch(`${BASE_URL}/server/command`, {
        method: 'POST',
        headers: {
            'Server-Key': SERVER_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command })
    });
    if (!res.ok) throw new Error(`ERLC API Error: ${res.status}`);
    return res.json();
}

async function getRobloxUsername(userId) {
    if (!userId) return 'N/A';
    const res = await fetch(`https://users.roblox.com/v1/users/${userId}`);
    if (!res.ok) return userId.toString();
    const data = await res.json();
    return data.displayName || data.name || userId.toString();
}

module.exports = {
    getServerInfo,
    getPlayers,
    getJoinLogs,
    getKillLogs,
    getCommandLogs,
    getBans,
    getVehicles,
    getQueue,
    sendCommand,
    getRobloxUsername
};
