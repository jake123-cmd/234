const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 }
});
const Counter = mongoose.model('Counter', counterSchema);

async function getNextId(name) {
    const counter = await Counter.findByIdAndUpdate(name, { $inc: { seq: 1 } }, { new: true, upsert: true });
    return counter.seq;
}

const infractionSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    guild_id: { type: String, required: true },
    user_id: { type: String, required: true },
    moderator_id: { type: String, required: true },
    type: { type: String, required: true },
    reason: { type: String, required: true },
    timestamp: { type: Number, required: true }
});

const promotionSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    guild_id: { type: String, required: true },
    user_id: { type: String, required: true },
    promoted_by: { type: String, required: true },
    old_rank: { type: String, required: true },
    new_rank: { type: String, required: true },
    reason: { type: String, default: 'No reason provided' },
    timestamp: { type: Number, required: true }
});

const ticketSchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    guild_id: { type: String, required: true },
    channel_id: { type: String, required: true },
    user_id: { type: String, required: true },
    ticket_type: { type: String, default: 'general' },
    status: { type: String, default: 'open' },
    claimed_by: { type: String, default: null },
    close_reason: { type: String, default: null },
    created_at: { type: Number, required: true }
});

const giveawaySchema = new mongoose.Schema({
    id: { type: Number, unique: true },
    guild_id: { type: String, required: true },
    channel_id: { type: String, required: true },
    message_id: { type: String, required: true },
    host_id: { type: String, required: true },
    prize: { type: String, required: true },
    winner_count: { type: Number, default: 1 },
    end_time: { type: Number, required: true },
    ended: { type: Number, default: 0 },
    entries: { type: [String], default: [] }
});

const Infraction = mongoose.model('Infraction', infractionSchema);
const Promotion = mongoose.model('Promotion', promotionSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);
const Giveaway = mongoose.model('Giveaway', giveawaySchema);

async function initDatabase() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to MongoDB');
}

module.exports = { initDatabase, Infraction, Promotion, Ticket, Giveaway, getNextId };
